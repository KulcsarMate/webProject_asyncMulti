let playerId = null;
let currentState = null;

// ===============================
// JOIN & START
// ===============================
async function joinGame() {
  const name = document.getElementById("nameInput").value;
  if (!name) return;

  const res = await fetch("/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });

  const data = await res.json();
  playerId = data.playerId;

  document.getElementById("joinScreen").style.display = "none";
  document.getElementById("lobby").style.display = "block";
}

async function startGame() {
  await fetch("/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerId })
  });
}

// ===============================
// BETTING
// ===============================
async function placeBet() {
  const amount = parseInt(document.getElementById("betInput").value);
  const res = await fetch("/place-bet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerId, amount })
  });

  if (!res.ok) {
    alert("Cannot bet (already bet or invalid amount)");
  }
}

function handleTurnButtons(currentTurnPlayer) {
  const hitBtn = document.getElementById("hitBtn");
  const standBtn = document.getElementById("standBtn");
  const actionControls = document.getElementById("actionControls");

  const isMyTurn = playerId === currentTurnPlayer;

  hitBtn.disabled = !isMyTurn;
  standBtn.disabled = !isMyTurn;

  // 🔥 Only show the action div if it's your turn
  actionControls.style.display = isMyTurn ? "block" : "none";
}

// ===============================
// ACTIONS
// ===============================
async function hit() {
  await fetch("/hit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerId }) });
}

async function stand() {
  await fetch("/stand", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerId }) });
}

// ===============================
// POLLING
// ===============================
async function pollState() {
  while (true) {
    try {
      const res = await fetch("/state");
      currentState = await res.json();
      render();
    } catch (err) {
      console.error("Failed to fetch state:", err);
    }
    await new Promise(r => setTimeout(r, 1000));
  }
}
pollState();

// ===============================
// RENDER
// ===============================
function render() {
  if (!currentState) return;

  if (currentState.state === "join") {
    return; // still waiting for player to join
  }

  if (currentState.state === "lobby") {
    renderLobby();
  } else {
    renderGame();
  }

  if (currentState.message && currentState.state === "lobby") {
    const msgDiv = document.getElementById("tableMessage");
    msgDiv.innerText = currentState.message;
    msgDiv.style.display = "block";
  }

  renderTurnTimer();
  renderNextRoundTimer();
}

// ===============================
// LOBBY
// ===============================
function renderLobby() {
  document.getElementById("lobby").style.display = "block";
  document.getElementById("game").style.display = "none";

  const lobbyList = document.getElementById("lobbyList");
  lobbyList.innerHTML = "";

  for (let id in currentState.players) {
    const p = currentState.players[id];

    lobbyList.innerHTML += `
      <li ${id === playerId ? 'style="color:#00ffcc;"' : ""}>
        ${p.name}
        ${id === playerId ? " (You)" : ""}
        ${p.isHost ? " 👑" : ""}
      </li>
    `;
  }

  const startBtn = document.getElementById("startBtn");

  // 🔥 Only host sees Start button
  if (currentState.players[playerId]?.isHost) {
    startBtn.style.display = "inline-block";
  } else {
    startBtn.style.display = "none";
  }
}

// ===============================
// GAME
// ===============================
function renderGame() {
  document.getElementById("lobby").style.display = "none";
  document.getElementById("game").style.display = "block"; // 🔥 make sure the game section is visible
  document.getElementById("tableMessage").style.display = "none";

  renderPlayers();
  renderDealer();
  renderControls();
}

// Players layout
function renderPlayers() {
  const playersDiv = document.getElementById("players");
  playersDiv.innerHTML = "";
  playersDiv.style.display = "flex";
  playersDiv.style.flexWrap = "wrap";
  playersDiv.style.gap = "20px";
  playersDiv.style.justifyContent = "center";

  const currentTurnPlayer = currentState.turnOrder?.[currentState.currentTurnIndex];

  for (let id in currentState.players) {
    const player = currentState.players[id];
    const box = document.createElement("div");
    box.classList.add("playerBox");
    if (id === currentTurnPlayer) box.classList.add("activePlayer");
    if (player.isHost) box.classList.add("hostPlayer");

    const title = document.createElement("h3");
    title.textContent = `${player.name} (Chips: ${player.chips})`;
    box.appendChild(title);

    const handDiv = document.createElement("div");
    handDiv.classList.add("card-row");

    player.hand.forEach((card, i) => {
      const img = document.createElement("img");
      img.classList.add("card");

      // Hide other players cards until round finishes
      if (id !== playerId && currentState.state !== "finished") {
        img.src = "assets/back.png";
      } else {
        img.src = `assets/${card.value}-${card.suit}.png`;
      }

      handDiv.appendChild(img);
    });

    if (player.eliminated) {
    title.textContent = `${player.name} (💀 BROKE)`;
  }

    box.appendChild(handDiv);
    playersDiv.appendChild(box);

    const resultText = document.createElement("div");
    if (currentState.state === "finished" && player.result) {
      resultText.textContent = `Result: ${player.result}`;
      resultText.style.marginTop = "5px";
      resultText.style.fontWeight = "bold";
      resultText.style.color = player.result === "Win" ? "#0f0" :
                           player.result === "Lose" ? "#f00" : "#ff0";
    }
    box.appendChild(resultText);
  }
}

// Dealer
function renderDealer() {
  const dealerDiv = document.getElementById("dealer");
  dealerDiv.innerHTML = ""; // clear everything

  if (!currentState.dealer.hand || currentState.dealer.hand.length === 0) return;

  const title = document.createElement("h3");
  title.textContent = "Dealer";
  dealerDiv.appendChild(title);

  const row = document.createElement("div");
  row.classList.add("card-row");

  currentState.dealer.hand.forEach((card, i) => {
    const img = document.createElement("img");
    img.classList.add("card");

    if (i === 0 && currentState.state !== "finished") img.src = "assets/back.png";
    else img.src = `assets/${card.value}-${card.suit}.png`;

    row.appendChild(img);
  });

  dealerDiv.appendChild(row);
}

// Controls
function renderControls() {
  const betControls = document.getElementById("betControls");
  const player = currentState.players[playerId];

  if (currentState.state === "betting" && player.bet === 0 && !player.eliminated) {
    betControls.style.display = "block";
  } else {
    betControls.style.display = "none";
  }

  handleTurnButtons(currentState.turnOrder?.[currentState.currentTurnIndex]);
}

// ===============================
// TIMERS
// ===============================

function renderTurnTimer() {
  const timerDiv = document.getElementById("turnTimer");
  if (!currentState.turnEndsAt || currentState.state !== "playing") {
    timerDiv.innerText = "";
    return;
  }
  const seconds = Math.max(0, Math.ceil((currentState.turnEndsAt - Date.now())/1000));
  timerDiv.innerText = `⏱ Time left: ${seconds}s`;
}

// Next-round countdown
function renderNextRoundTimer() {
  const timerDiv = document.getElementById("turnTimer");
  if (!currentState.nextRoundStartsAt || currentState.state !== "finished") return;

  const seconds = Math.max(0, Math.ceil((currentState.nextRoundStartsAt - Date.now()) / 1000));
  timerDiv.innerText = `Next round in: ${seconds}s`;

  // ✅ Only trigger fetch when countdown just hits 0
  if (seconds === 0 && !timerDiv.dataset.startedNextRound) {
    timerDiv.dataset.startedNextRound = "true"; // mark that we already sent request
    // fetch("/start-next-round", { method: "POST" });
  }
}

// ===============================
// Optional: update timer smoothly
// ===============================
setInterval(() => {
  renderTurnTimer();
  renderNextRoundTimer();
}, 250);