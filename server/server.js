const express = require("express");
const http = require("http");
const crypto = require("crypto");
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);
const io = new Server(server);

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
  return new Promise((resolve, reject) => {
    if (typeof ms !== "number") {
      reject("Delay requires a number");
    } else {
      setTimeout(resolve, ms);
    }
  });
}

// ===============================
// ROUTES
// ===============================

// Join the game
app.post("/join", (req, res) => {
  const { name } = req.body;
  
  console.log(name + " tried to join")
  if (!name || (game.state !== "join" && game.state !== "lobby")) return res.sendStatus(400);
  console.log("success")

  game.state = "lobby";
  const playerId = crypto.randomUUID();
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
    eliminated: false,
    isHost: isFirstPlayer
  };

  io.emit("gameState", game);
  res.json({ playerId, ...game });
});

app.post("/start", (req, res) => {
  const { playerId } = req.body;

  if (!playerId) return res.sendStatus(400);
  if (!game.players[playerId]?.isHost) return res.sendStatus(403);
  if (game.state !== "lobby") return res.sendStatus(400);

  // Reset player stats for the beginning of the match
  for (let id in game.players) {
    game.players[id].chips = 1000;
    game.players[id].bet = 0;
    game.players[id].hand = [];
    game.players[id].eliminated = false;
  }

  game.dealer.hand = [];
  game.state = "betting";
  game.tableMessage = ""; // 👈 Clear the "Game Over" message here
  io.emit("gameState", game);
  res.json(game);
});

// Place bet
app.post("/place-bet", (req, res) => {
  const { playerId, amount } = req.body;
  const player = game.players[playerId];

  // 🛡️ Enforce Integer check
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
    return res.status(400).send("Bets must be whole numbers.");
  }

  if (!player || game.state !== "betting" || amount > player.chips) {
    return res.sendStatus(400);
  }

  player.bet = amount;
  player.chips -= amount;

  const allBet = Object.values(game.players)
    .filter(p => !p.eliminated)
    .every(p => p.bet > 0);

  if (allBet) {
    startRound(); 
    // The startRound function should handle the io.emit
  } else {
    // Just update everyone on the current bets
    io.emit("gameState", game);
  }

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

  // Check for bust
  if (handValue(player.hand) > 21) {
    player.busted = true;
    // We emit here, then nextTurn() will handle the next emit/timer
    io.emit("gameState", game); 
    nextTurn();
  } else {
    // Just a normal hit, no bust. Tell everyone to show the new card.
    io.emit("gameState", game);
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

// Get current state
app.get("/state", (req, res) => res.json(game));

// Test endpoint
app.get("/", (req, res) => res.send("Server is working!"));

// ===============================
// GAME LOGIC
// ===============================

function prepareNewGame() {
  return Promise.resolve()
    .then(() => {
      console.log("Step 1: Clearing table visuals...");
      resetRoundData(); // Wipes hands, bets, and dealer cards
      return delay(500); // Small pause for dramatic effect
    })
    .then(() => {
      console.log("Step 2: Resetting player chips and status...");
      for (let id in game.players) {
        let p = game.players[id];
        p.chips = 1000;
        p.eliminated = false;
        p.result = null;
      }
      return delay(500);
    })
    .then(() => {
      console.log("Step 3: Moving state to lobby.");
      game.state = "lobby";
      game.tableMessage = "Game Reset! Host can start whenever.";
      io.emit("gameState", game);
    })
    .catch((err) => {
      console.error("Reset Chain Failed:", err);
    });
}

function startRound() {
  game.state = "playing";
  game.tableMessage = "";
  resetRoundState(); // Clears turnOrder, index, etc.

  game.deck = createDeck();
  shuffle(game.deck);
  game.dealer.hand = [];

  // Deal to active players
  for (let id in game.players) {
    const player = game.players[id];
    if (player.eliminated || player.bet === 0) continue;

    player.hand = [drawCard(), drawCard()];
    game.turnOrder.push(id); // Populate the order!
  }

  // Dealer cards
  const firstCard = drawCard();
  firstCard.hidden = true;
  game.dealer.hand = [firstCard, drawCard()];

  // IMPORTANT: Tell the frontend the cards are dealt and turns started
  io.emit("gameState", game);
  
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
    // dealerPlay handles its own emits for each card drawn
    dealerPlay();
  } else {
    // Move to the next player
    io.emit("gameState", game); 
    startTurnTimer();
  }
}

async function dealerPlay() {
  game.state = "dealer";

  // Reveal hidden card
  const hiddenCard = game.dealer.hand.find(c => c.hidden);
  if (hiddenCard) hiddenCard.hidden = false;
  io.emit("gameState", game);

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Draw cards until 17
  while (handValue(game.dealer.hand) < 17) {
    game.dealer.hand.push(drawCard());
    io.emit("gameState", game); // Update clients so they see the draw
    await new Promise(resolve => setTimeout(resolve, 800));
  }

  // TRIGGER THE FINISH
  finishRound(); 
}

function finishRound() {
  const resultMessage = calculateResultsAndPayouts();
  game.tableMessage = resultMessage;
  game.state = "finished";
  io.emit("gameState", game);

  delay(4000)
  // Inside finishRound() ...
  .then(() => {
    const allPlayers = Object.values(game.players);
    const activePlayers = allPlayers.filter(p => p.chips > 0);

  // Logic: 
  // 1. If NO ONE has money, it's Game Over.
  // 2. If there were multiple players, but only 1 is left, it's Game Over.
  // 3. If there is only 1 player total in the game and they have money, KEEP PLAYING.
  
    const isGameOver = activePlayers.length === 0 || (allPlayers.length > 1 && activePlayers.length === 1);

    if (isGameOver) {
      game.state = "lobby";
      if (activePlayers.length === 1) {
        game.tableMessage = `GAME OVER: ${activePlayers[0].name} wins the table!`;
      } else {
        game.tableMessage = "GAME OVER: Everyone is broke!";
      }
    // Optional: use your prepareNewGame() chain here if you implemented it
    } else {
    // Round transition for single player or multiple active players
      resetRoundData();
      game.state = "betting";
      game.tableMessage = "New Round! Place your bets.";
    }

    io.emit("gameState", game);
  })
  .catch(err => {
    console.error("FinishRound Chain Error:", err);
    game.state = "lobby";
    io.emit("gameState", game);
  });
}

// -----------------------------
// Updated results function with payouts
// -----------------------------
function calculateResultsAndPayouts() {
  const dealerScore = handValue(game.dealer.hand);

  Object.values(game.players).forEach(player => {
    const score = handValue(player.hand);

    if (player.busted) {
      player.result = "Busted";
      // No chips added back
    } else if (dealerScore > 21 || score > dealerScore) {
      player.result = "Win";
      player.chips += player.bet * 2; 
    } else if (score === dealerScore) {
      player.result = "Push";
      player.chips += player.bet; 
    } else {
      player.result = "Lose";
    }

    // Reset bet for next round
    player.bet = 0;
    
    // Explicitly mark as eliminated ONLY if they still have 0 after winnings
    if (player.chips <= 0) {
        player.eliminated = true;
    } else {
        player.eliminated = false;
    }
  });

  return "Round finished!";
}

function checkForGameOver() {
  return new Promise((resolve) => {
    const activePlayers = Object.values(game.players).filter(p => p.chips > 0);

    if (activePlayers.length <= 1) {
      if (activePlayers.length === 1) {
        game.tableMessage = `${activePlayers[0].name} wins the table!`;
      } else {
        game.tableMessage = "No players left with chips. Table ends in a draw.";
      }

      io.emit("gameState", game);

      // Wait 4 seconds before resolving so players see message
      delay(4000).then(resolve);
    } else {
      resolve(); // table still has active players
    }
  });
}

function resetToLobbyIfNeeded() {
  return new Promise((resolve) => {
    const activePlayers = Object.values(game.players).filter(p => p.chips > 0);

    if (activePlayers.length <= 1) {
      game.state = "lobby";
      game.tableMessage = "";
      // do NOT overwrite game.players
      io.emit("gameState", game);
      resolve();
    } else {
      startNextRound();
      resolve();
    }
  });
}

function startNextRound() {
  resetRoundData(); 
  game.state = "betting"; 
  game.tableMessage = ""; // 👈 Ensure it's empty for the new bets
  io.emit("gameState", game);
}

function resetRoundData() {
  for (let id in game.players) {
    const player = game.players[id];
    player.hand = [];
    player.result = null;
    player.bet = 0;
    player.stood = false;
    player.busted = false;
    player.isHost = game.players[id].isHost;
    player.eliminated = game.players[id].eliminated;
    player.chips = game.players[id].chips
    // Do NOT reset chips or isHost or eliminated status
  }

  game.dealer.hand = [];
  game.turnOrder = [];
  game.currentTurnIndex = 0;
  game.turnEndsAt = null;
  game.nextRoundStartsAt = null;
  game.tableMessage = "";
}

function resetTable() {
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
}

// ===============================
// SERVER
// ===============================
server.listen(3210, () => {
  console.log("Server running on http://localhost:3210");
});