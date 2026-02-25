const express = require("express");
const crypto = require("crypto");

const app = express();
app.use(express.json());
app.use(express.static("public"));

console.log("Server file loaded");

let game = createGame();
let turnTimer = null;

// ===============================
// HELPERS
// ===============================
function createGame() {
  return {
    players: {},
    turnOrder: [],
    currentTurnIndex: 0,
    dealer: { hand: [] },
    deck: [],
    state: "join", // join | lobby | betting | playing | dealer | finished
    turnEndsAt: null,
    nextRoundStartsAt: null,
    message: ""
  };
}

function createDeck() {
  const suits = ["H", "D", "C", "S"];
  const values = [
    "A", "2", "3", "4", "5", "6", "7",
    "8", "9", "10", "J", "Q", "K"
  ];

  const deck = [];
  for (let suit of suits) {
    for (let value of values) {
      deck.push({ suit, value });
    }
  }
  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

function drawCard() {
  return game.deck.pop();
}

function handValue(hand) {
  let value = 0;
  let aces = 0;

  for (let card of hand) {
    if (card.value === "A") {
      value += 11;
      aces++;
    } else if (["K", "Q", "J"].includes(card.value)) {
      value += 10;
    } else {
      value += parseInt(card.value);
    }
  }

  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }

  return value;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ===============================
// ROUTES
// ===============================

// Join the game
app.post("/join", (req, res) => {
  const { name } = req.body;
  
  console.log(name + game.state)
  if (!name || (game.state !== "join" && game.state !== "lobby")) return res.sendStatus(400);
  
  game.state = "lobby";
  const playerId = Date.now().toString();
  const isFirstPlayer = Object.keys(game.players).length === 0;

  game.players[playerId] = {
    id: playerId,
    name,
    chips: 1000,
    bet: 0,
    hand: [],
    result: null,
    stood: false,
    busted: false,
    isHost: isFirstPlayer
  };

  res.json({ playerId, ...game });
});

// Start the first round (after lobby)
app.post("/start", (req, res) => {
  const { playerId } = req.body;

  if (!playerId) return res.sendStatus(400);
  if (!game.players[playerId]?.isHost) return res.sendStatus(403);
  if (game.state !== "lobby") return res.sendStatus(400);

  game.state = "betting";
  res.json(game);
});

// Place bet
app.post("/place-bet", (req, res) => {
  const { playerId, amount } = req.body;
  const player = game.players[playerId];

  if (!player || game.state !== "betting") return res.sendStatus(400);
  if (player.bet > 0) return res.sendStatus(400);
  if (amount > player.chips) return res.sendStatus(400);

  player.bet = amount;
  player.chips -= amount;

  const allBet = Object.values(game.players).every(p => p.bet > 0);
  if (allBet) startRound();

  res.json(game);
});

// Hit
app.post("/hit", (req, res) => {
  const { playerId } = req.body;

  if (game.state !== "playing") return res.json(game);

  const currentId = game.turnOrder[game.currentTurnIndex];
  if (playerId !== currentId) return res.json(game);

  const player = game.players[playerId];
  player.hand.push(drawCard());

  if (handValue(player.hand) > 21) {
    player.busted = true;
    nextTurn();
  }

  res.json(game);
});

// Stand
app.post("/stand", (req, res) => {
  const { playerId } = req.body;

  const currentId = game.turnOrder[game.currentTurnIndex];
  if (playerId !== currentId) return res.json(game);

  game.players[playerId].stood = true;
  nextTurn();

  res.json(game);
});

// Start next round after countdown
// app.post("/start-next-round", (req, res) => {
//   if (game.state !== "finished") return res.sendStatus(400);

//   // Clear player round data
//   for (let id in game.players) {
//     const player = game.players[id];
//     player.hand = [];
//     player.result = null;
//     player.bet = 0;
//     player.stood = false;
//     player.busted = false;
//   }

//   // Clear dealer
//   game.dealer.hand = [];

//   // 🔥 FULL RESET OF TURN SYSTEM
//   resetRoundState();
//   game.nextRoundStartsAt = null;
//   game.state = "betting";

//   res.json(game);
// });

// Get current state
app.get("/state", (req, res) => res.json(game));

// Test endpoint
app.get("/", (req, res) => res.send("Server is working!"));

// ===============================
// GAME LOGIC
// ===============================

function startRound() {
  game.state = "playing";
  resetRoundState()

  game.deck = createDeck();
  shuffle(game.deck);

  game.dealer.hand = [];
  game.roundOver = false;

  // Deal 2 cards to each player
  for (let id in game.players) {
    const player = game.players[id];
    player.hand = [];
    player.result = null;
    player.busted = false;
    player.stood = false;

    player.hand.push(drawCard());
    player.hand.push(drawCard());

    game.turnOrder.push(id);
  }

  // Dealer 2 cards
  game.dealer.hand.push(drawCard());
  game.dealer.hand.push(drawCard());

  // Start first turn timer
  startTurnTimer();
}

function resetRoundState() {
  game.turnOrder = [];
  game.currentTurnIndex = 0;
  game.turnEndsAt = null;
}

function startTurnTimer() {
  clearTimeout(turnTimer);
  if (!game.turnOrder[game.currentTurnIndex]) return;

  game.turnEndsAt = Date.now() + 15000; // 15-second turn
  turnTimer = setTimeout(autoStand, 15000);
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

async function dealerPlay() {
  while (handValue(game.dealer.hand) < 17) {
    await delay(1000);
    game.dealer.hand.push(drawCard());
  }

  finishRound();
}

async function finishRound() {
  const dealerScore = handValue(game.dealer.hand);

  for (let id of game.turnOrder) {
    const player = game.players[id];
    const score = handValue(player.hand);

    if (player.busted) player.result = "Busted";
    else if (dealerScore > 21 || score > dealerScore) {
      player.result = "Win";
      player.chips += player.bet * 2;
    } else if (score === dealerScore) {
      player.result = "Push";
      player.chips += player.bet;
    } else player.result = "Lose";
  }

  game.state = "finished";
  game.nextRoundStartsAt = Date.now() + 5000;

  // 🔥 SERVER controls next round automatically
  setTimeout(() => {
    startNextRound();
  }, 5000);
}

function startNextRound() {
  // Reset players
  for (let id in game.players) {
    const player = game.players[id];
    player.hand = [];
    player.result = null;
    player.bet = 0;
    player.stood = false;
    player.busted = false;
  }

  game.dealer.hand = [];

  game.turnOrder = [];
  game.currentTurnIndex = 0;
  game.turnEndsAt = null;
  game.nextRoundStartsAt = null;

  game.state = "betting";
}
 
// ===============================
// SERVER
// ===============================
app.listen(3210, () => console.log("Server running on http://localhost:3210"));