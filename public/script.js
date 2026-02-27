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
  
  // 1. Save the ID globally immediately
  playerId = data.playerId; 
  // 2. Sync the current state returned by the fetch
  currentState = data; 

  document.getElementById("joinScreen").style.display = "none";
  document.getElementById("lobby").style.display = "block";
  
  // 3. Manually trigger a render so we don't wait for the next socket pulse
  render();
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
  const betInput = document.getElementById("betInput");
  // Force the input to be an integer before even sending
  const amount = Math.floor(parseInt(betInput.value)); 
  
  if (isNaN(amount) || amount <= 0) {
    alert("Please enter a valid whole number.");
    return;
  }
  
  if (amount > playerChips) {
    alert("You don't have enough chips!");
    return;
  }

  const res = await fetch("/place-bet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerId, amount })
  });

  if (!res.ok) {
    alert("Cannot bet (already bet or invalid amount)");
  } else {
    betInput.value = ""; // Clear input on success
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
// Remove pollState();

socket.on("connect", () => {
  console.log("Connected to server");
  // Optional: You can emit a 'requestState' here if your server supports it,
  // but usually, a good server setup emits the state to new connections automatically.
});

socket.on("gameState", (data) => {
  currentState = data;
  render();
});

// ===============================
// RENDER
// ===============================
function render() {
  if (!currentState || !currentState.state) return;

  const msgDiv = document.getElementById("tableMessage");

  // Logic: Show if message exists AND we aren't in a state where it's irrelevant
  if (currentState.tableMessage && currentState.tableMessage !== "") {
    msgDiv.innerText = currentState.tableMessage;
    msgDiv.style.display = "block";
  } else {
    msgDiv.style.display = "none";
    msgDiv.innerText = ""; // Clear text to be safe
  }

  if (currentState.state === "lobby") {
    renderLobby();
    document.getElementById("game").style.display = "none";
    document.getElementById("lobby").style.display = "block";
  } else {
    document.getElementById("lobby").style.display = "none";
    document.getElementById("game").style.display = "block";
    
    // 🔥 Remove the line that says: 
    // document.getElementById("tableMessage").style.display = "none";
    // inside renderGame() so it doesn't fight with the logic above.
    renderGame();
  }
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
  const player = currentState.players[playerId];
  
  // Only show the "You are broke" message if the round is actually over 
  // and they didn't win anything back.
  if (player && player.chips <= 0 && currentState.state === "betting") {
     document.getElementById("tableMessage").innerText = "You are out of chips!";
     document.getElementById("tableMessage").style.display = "block";
  }

  document.getElementById("lobby").style.display = "none";
  document.getElementById("game").style.display = "block";

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

  currentState.dealer.hand.forEach((card) => {
    const img = document.createElement("img");
    img.classList.add("card");

    if (card.hidden) {
      img.src = "assets/back.png";
    } else {
      img.src = `assets/${card.value}-${card.suit}.png`;
    }

    row.appendChild(img);
  });

  dealerDiv.appendChild(row);
}

// Controls
function renderControls() {
  const betControls = document.getElementById("betControls");
  const actionControls = document.getElementById("actionControls");
  const player = currentState.players[playerId];

  if (!player) return;

  // 1. Show betting UI ONLY during betting phase
  if (currentState.state === "betting" && player.bet === 0 && !player.eliminated) {
    betControls.style.display = "block";
  } else {
    betControls.style.display = "none";
  }

  // 2. Show Action UI ONLY during playing phase AND when it's your turn
  const currentTurnId = currentState.turnOrder?.[currentState.currentTurnIndex];
  if (currentState.state === "playing" && currentTurnId === playerId) {
    actionControls.style.display = "block";
    
    // Enable/Disable buttons based on turn
    document.getElementById("hitBtn").disabled = false;
    document.getElementById("standBtn").disabled = false;
  } else {
    actionControls.style.display = "none";
  }
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
  // Only try to update timers if we actually have game data
  if (currentState) {
    renderTurnTimer();
    renderNextRoundTimer();
  }
}, 250);