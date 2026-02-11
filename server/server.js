const express = require("express");
const crypto = require("crypto");

const app = express();
app.use(express.json());
app.use(express.static("public"));


let game = createGame();
let turnTimer = null;

function createGame() {
  return {
    players: {},
    turnOrder: [],
    currentTurnIndex: 0,
    dealer: { hand: [] },
    deck: [],
    state: "lobby", // lobby | betting | playing | dealer | finished
    turnEndsAt: null,
    message: ""
  };
}


function createDeck() {
  const suits = ["♠","♥","♦","♣"];
  const values = [2,3,4,5,6,7,8,9,10,"J","Q","K","A"];

  return suits.flatMap(s =>
    values.map(v => ({ value: v, suit: s }))
  ).sort(() => Math.random() - 0.5);
}

function handValue(hand) {
  let total = 0;
  let aces = 0;

  for (let card of hand) {
    if (card.value === "A") {
      total += 11;
      aces++;
    } else if (["J","Q","K"].includes(card.value)) {
      total += 10;
    } else {
      total += card.value;
    }
  }

  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }

  return total;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


app.post("/join", (req, res) => {
  const { name } = req.body;
  const id = crypto.randomUUID();

  game.players[id] = {
    id,
    name,
    hand: [],
    chips: 1000,
    bet: 0,
    stood: false,
    busted: false,
    result: null
  };

  game.turnOrder.push(id);
  res.json({ playerId: id, game });
});

app.post("/start", (req, res) => {
  if (game.state === "lobby") {
    game.state = "betting";
  }
  res.json(game);
});


app.post("/place-bet", (req, res) => {
  const { playerId, amount } = req.body;
  const player = game.players[playerId];

  if (!player || game.state !== "betting") return res.json(game);
  if (amount > player.chips || amount <= 0) return res.json(game);

  player.bet = amount;
  player.chips -= amount;

  if (game.turnOrder.every(id => game.players[id].bet > 0)) {
    startRound();
  }

  res.json(game);
});


function startRound() {
  game.state = "playing";
  game.deck = createDeck();
  game.dealer.hand = [];
  game.currentTurnIndex = 0;

  for (let id of game.turnOrder) {
    const player = game.players[id];
    player.hand = [game.deck.pop(), game.deck.pop()];
    player.stood = false;
    player.busted = false;
    player.result = null;
  }

  game.dealer.hand = [game.deck.pop(), game.deck.pop()];
  startTurnTimer();
}


function startTurnTimer() {
  clearTimeout(turnTimer);

  game.turnEndsAt = Date.now() + 15000;

  turnTimer = setTimeout(() => {
    autoStand();
  }, 15000);
}

function autoStand() {
  const currentId = game.turnOrder[game.currentTurnIndex];
  if (!currentId) return;

  game.players[currentId].stood = true;
  nextTurn();
}


function nextTurn() {
  clearTimeout(turnTimer);

  game.currentTurnIndex++;

  if (game.currentTurnIndex >= game.turnOrder.length) {
    game.state = "dealer";
    dealerPlay();
  } else {
    startTurnTimer();
  }
}


app.post("/hit", (req, res) => {
  const { playerId } = req.body;

  if (game.state !== "playing") return res.json(game);

  const currentId = game.turnOrder[game.currentTurnIndex];
  if (playerId !== currentId) return res.json(game);

  const player = game.players[playerId];
  player.hand.push(game.deck.pop());

  if (handValue(player.hand) > 21) {
    player.busted = true;
    nextTurn();
  }

  res.json(game);
});

app.post("/stand", (req, res) => {
  const { playerId } = req.body;

  const currentId = game.turnOrder[game.currentTurnIndex];
  if (playerId !== currentId) return res.json(game);

  game.players[playerId].stood = true;
  nextTurn();

  res.json(game);
});


async function dealerPlay() {
  while (handValue(game.dealer.hand) < 17) {
    await delay(1000);
    game.dealer.hand.push(game.deck.pop());
  }

  finishRound();
}


async function finishRound() {
  const dealerScore = handValue(game.dealer.hand);

  for (let id of game.turnOrder) {
    const player = game.players[id];
    const score = handValue(player.hand);

    if (player.busted) {
      player.result = "Busted";
    } else if (dealerScore > 21 || score > dealerScore) {
      player.result = "Win";
      player.chips += player.bet * 2;
    } else if (score === dealerScore) {
      player.result = "Push";
      player.chips += player.bet;
    } else {
      player.result = "Lose";
    }

    player.bet = 0;
  }

  game.state = "finished";
  game.message = "Round finished";

  await delay(5000);
  game.state = "betting";
  game.turnEndsAt = null;
}


app.get("/state", (req, res) => {
  res.json(game);
});


app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
