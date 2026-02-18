let playerId = null;
let currentState = null;

async function joinGame() {
  const name = document.getElementById("nameInput").value;

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
  await fetch("/start", { method: "POST" });
  document.getElementById("lobby").style.display = "none";
  document.getElementById("game").style.display = "block";
}


async function placeBet() {
  const amount = parseInt(document.getElementById("betInput").value);

  await fetch("/place-bet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerId, amount })
  });
}


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


async function pollState() {
  while (true) {
    const res = await fetch("/state");
    currentState = await res.json();

    render();
    await new Promise(r => setTimeout(r, 1000));
  }
}

pollState();

function handleTurnButtons(currentTurnPlayer) {
  const hitBtn = document.getElementById("hitBtn");
  const standBtn = document.getElementById("standBtn");

  const isMyTurn = playerId === currentTurnPlayer;

  hitBtn.disabled = !isMyTurn;
  standBtn.disabled = !isMyTurn;
}


function render() {
  if (!currentState) return;

  if (!currentState.gameStarted) {
    renderLobby();
    return;
  }

  renderGame();
}

function renderTurnTimer() {
  const timerDiv = document.getElementById("timer");

  if (!currentState.turnEndsAt) {
    timerDiv.innerText = "";
    return;
  }

  const seconds = Math.max(
    0,
    Math.ceil((currentState.turnEndsAt - Date.now()) / 1000)
  );

  timerDiv.innerText = `Time left: ${seconds}s`;
}

function renderLobby() {
  const lobbyList = document.getElementById("lobbyList");
  lobbyList.innerHTML = "";

  for (let id in currentState.players) {
    const p = currentState.players[id];
    lobbyList.innerHTML += `
  <li ${id === playerId ? 'style="color:#00ffcc;"' : ""}>
    ${p.name} ${id === playerId ? "(You)" : ""}
  </li>`;
  }
}

function renderGame() {
  const playersDiv = document.getElementById("gamePlayers");
  playersDiv.innerHTML = "";

  const currentTurnPlayer =
    currentState.turnOrder?.[currentState.currentTurnIndex];

  for (let id in currentState.players) {
    const p = currentState.players[id];

    const isCurrent = id === currentTurnPlayer;

    playersDiv.innerHTML += `
      <div class="${isCurrent ? "current-turn" : ""}">
        <strong>${p.name}</strong>
        | Chips: ${p.chips}
        | Bet: ${p.bet}
        | Cards: ${p.hand.map(c => c.value + c.suit).join(" ")}
        | Result: ${p.result || ""}
      </div>
    `;
  }

  // Dealer
  const dealerDiv = document.getElementById("dealer");
  dealerDiv.innerHTML =
    currentState.dealer.hand.map(c => c.value + c.suit).join(" ");

  handleTurnButtons(currentTurnPlayer);
  renderTurnTimer();
}


