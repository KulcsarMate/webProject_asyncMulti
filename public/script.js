/* ===============================
   GLOBAL STATE
================================= */

let playerId = null;
let currentState = null;

/* ===============================
   POLLING (async / await)
================================= */

setInterval(fetchState, 1000);

async function fetchState() {
  try {
    const res = await fetch("/state");
    currentState = await res.json();
    render();
  } catch (err) {
    console.error("Failed to fetch state:", err);
  }
}

/* ===============================
   JOIN GAME
================================= */

async function joinGame() {
  const nameInput = document.getElementById("playerName");
  const name = nameInput.value.trim();

  if (!name) return alert("Enter a name");

  const res = await fetch("/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });

  const data = await res.json();
  playerId = data.playerId;
  currentState = data;

  render();
}

/* ===============================
   START GAME
================================= */

async function startGame() {
  await fetch("/start", { method: "POST" });
}

/* ===============================
   BETTING
================================= */

async function placeBet() {
  const betInput = document.getElementById("betAmount");
  const amount = parseInt(betInput.value);

  if (!amount || amount <= 0) {
    alert("Enter valid bet");
    return;
  }

  await fetch("/place-bet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      playerId,
      amount
    })
  });
}

/* ===============================
   HIT / STAND
================================= */

async function hit() {
  await fetch("/hit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerId })
  });
}

async function stand() {
  await fetch("/stand", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerId })
  });
}

/* ===============================
   RENDER ROUTER
================================= */

function render() {
  if (!currentState) return;

  // Not joined yet
  if (!playerId) {
    showJoin();
    return;
  }

  const state = currentState.state;

  if (state === "lobby") {
    showLobby();
    renderLobby();
    return;
  }

  showGame();
  renderGame();
}

/* ===============================
   SCREEN VISIBILITY
================================= */

function showJoin() {
  document.getElementById("joinScreen").style.display = "block";
  document.getElementById("lobby").style.display = "none";
  document.getElementById("game").style.display = "none";
}

function showLobby() {
  document.getElementById("joinScreen").style.display = "none";
  document.getElementById("lobby").style.display = "block";
  document.getElementById("game").style.display = "none";
}

function showGame() {
  document.getElementById("joinScreen").style.display = "none";
  document.getElementById("lobby").style.display = "none";
  document.getElementById("game").style.display = "block";
}

/* ===============================
   LOBBY RENDER
================================= */

function renderLobby() {
  const lobbyList = document.getElementById("lobbyList");
  lobbyList.innerHTML = "";

  for (let id in currentState.players) {
    const player = currentState.players[id];

    const li = document.createElement("li");
    li.textContent = player.name;

    lobbyList.appendChild(li);
  }
}

/* ===============================
   GAME RENDER
================================= */

function renderGame() {
  renderDealer();
  renderPlayers();
  renderControls();
  renderResults();
}

/* ===============================
   DEALER RENDER
================================= */

function renderDealer() {
  const dealerDiv = document.getElementById("dealerCards");
  dealerDiv.innerHTML = "";

  if (!currentState.dealer) return;

  currentState.dealer.hand.forEach((card, index) => {
    const img = document.createElement("img");

    // Hide second card while playing
    if (
      currentState.state === "playing" &&
      index === 1
    ) {
      img.src = "assets/back.png";
    } else {
      img.src = `assets/${card.value}_${card.suit}.png`;
    }

    img.classList.add("card");
    dealerDiv.appendChild(img);
  });
}

/* ===============================
   PLAYERS RENDER
================================= */

function renderPlayers() {
  const playersDiv = document.getElementById("playersArea");
  playersDiv.innerHTML = "";

  for (let id in currentState.players) {
    const player = currentState.players[id];

    const container = document.createElement("div");
    container.classList.add("playerBox");

    if (id === currentState.turnOrder?.[currentState.currentTurnIndex]) {
      container.classList.add("activePlayer");
    }

    const title = document.createElement("h3");
    title.textContent =
      `${player.name} (Chips: ${player.chips})`;
    container.appendChild(title);

    const handDiv = document.createElement("div");

    player.hand.forEach(card => {
      const img = document.createElement("img");
      img.src = `assets/${card.value}_${card.suit}.png`;
      img.classList.add("card");
      handDiv.appendChild(img);
    });

    container.appendChild(handDiv);

    if (player.bet > 0) {
      const betText = document.createElement("p");
      betText.textContent = `Bet: ${player.bet}`;
      container.appendChild(betText);
    }

    playersDiv.appendChild(container);
  }
}

/* ===============================
   CONTROLS RENDER
================================= */

function renderControls() {
  const controls = document.getElementById("controls");

  if (currentState.state === "betting") {
    controls.style.display = "block";
    document.getElementById("betControls").style.display = "block";
    document.getElementById("actionControls").style.display = "none";
    return;
  }

  if (
    currentState.state === "playing" &&
    currentState.turnOrder[currentState.currentTurnIndex] === playerId
  ) {
    controls.style.display = "block";
    document.getElementById("betControls").style.display = "none";
    document.getElementById("actionControls").style.display = "block";
    return;
  }

  controls.style.display = "none";
}

/* ===============================
   RESULTS RENDER
================================= */

function renderResults() {
  const resultsDiv = document.getElementById("roundResults");
  resultsDiv.innerHTML = "";

  if (currentState.state !== "finished") return;

  for (let id in currentState.players) {
    const player = currentState.players[id];

    const line = document.createElement("div");
    line.classList.add("resultLine");

    line.textContent =
      `${player.name}: ${player.result.toUpperCase()} | Chips: ${player.chips}`;

    resultsDiv.appendChild(line);
  }
}