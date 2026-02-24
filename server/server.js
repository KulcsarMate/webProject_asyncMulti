const express = require("express");
const app = express();

app.use(express.json());
app.use(express.static("public"));

let game = createGame();
let turnTimer = null;

/* ---------------- GAME SETUP ---------------- */

function createGame() {
  return {
    state: "lobby",
    players: {},
    dealer: { hand: [] },
    deck: [],
    turnOrder: [],
    currentTurnIndex: 0
  };
}

/* ---------------- ROUND START ---------------- */

function startRound() {
  game.state = "playing";

  game.deck = createDeck();
  shuffle(game.deck);

  game.dealer.hand = [];
  game.turnOrder = [];
  game.currentTurnIndex = 0;

  for (let id in game.players) {
    const player = game.players[id];

    player.hand = [];
    player.result = null;
    player.stood = false;
    player.busted = false;

    player.hand.push(drawCard());
    player.hand.push(drawCard());

    game.turnOrder.push(id);
  }

  game.dealer.hand.push(drawCard());
  game.dealer.hand.push(drawCard());

  startTurnTimer();
}

/* ---------------- TURN SYSTEM ---------------- */

function startTurnTimer() {
  clearTimeout(turnTimer);

  turnTimer = setTimeout(() => {
    nextTurn();
  }, 15000);
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

/* ---------------- DEALER LOGIC ---------------- */

function dealerPlay() {
  while (handValue(game.dealer.hand) < 17) {
    game.dealer.hand.push(drawCard());
  }

  settleBets();
}

/* ---------------- SETTLEMENT ---------------- */

function settleBets() {
  const dealerValue = handValue(game.dealer.hand);
  const dealerBust = dealerValue > 21;

  for (let id of game.turnOrder) {
    const player = game.players[id];
    const playerValue = handValue(player.hand);

    if (player.busted) {
      player.result = "lose";
    }
    else if (dealerBust) {
      player.result = "win";
      player.chips += player.bet * 2;
    }
    else if (playerValue > dealerValue) {
      player.result = "win";
      player.chips += player.bet * 2;
    }
    else if (playerValue < dealerValue) {
      player.result = "lose";
    }
    else {
      player.result = "push";
      player.chips += player.bet;
    }

    player.bet = 0;
  }

  game.state = "finished";

  // 🔥 AUTO START NEXT ROUND AFTER 8 SECONDS
  setTimeout(() => {
    resetForNextRound();
  }, 8000);
}

function resetForNextRound() {
  game.state = "betting";
  game.dealer.hand = [];
  game.turnOrder = [];
  game.currentTurnIndex = 0;

  for (let id in game.players) {
    const player = game.players[id];
    player.hand = [];
    player.result = null;
    player.stood = false;
    player.busted = false;
  }
}

/* ---------------- ROUTES ---------------- */

app.post("/place-bet", (req, res) => {
  const { playerId, amount } = req.body;
  const player = game.players[playerId];

  if (!player || game.state !== "betting")
    return res.sendStatus(400);

  player.bet = amount;
  player.chips -= amount;

  const allBet = Object.values(game.players)
    .every(p => p.bet > 0);

  if (allBet) {
    startRound();
  }

  res.json(game);
});

app.post("/hit", (req, res) => {
  const { playerId } = req.body;

  if (game.state !== "playing")
    return res.json(game);

  const currentId = game.turnOrder[game.currentTurnIndex];
  if (playerId !== currentId)
    return res.json(game);

  const player = game.players[playerId];

  player.hand.push(drawCard());

  if (handValue(player.hand) > 21) {
    player.busted = true;
    nextTurn();
  }

  res.json(game);
});

app.post("/stand", (req, res) => {
  const { playerId } = req.body;

  if (game.state !== "playing")
    return res.json(game);

  const currentId = game.turnOrder[game.currentTurnIndex];
  if (playerId !== currentId)
    return res.json(game);

  game.players[playerId].stood = true;
  nextTurn();

  res.json(game);
});

app.get("/state", (req, res) => {
  res.json(game);
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});