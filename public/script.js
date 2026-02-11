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
}


async function startGame() {
  await fetch("/start", { method: "POST" });
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


function render() {
  if (!currentState) return;

  const playersDiv = document.getElementById("players");
  playersDiv.innerHTML = "";

  for (let id in currentState.players) {
    const p = currentState.players[id];

    playersDiv.innerHTML += `
      <div>
        <strong>${p.name}</strong>
        | Chips: ${p.chips}
        | Bet: ${p.bet}
        | Cards: ${p.hand.map(c => c.value + c.suit).join(" ")}
        | Result: ${p.result || ""}
      </div>
    `;
  }

  const dealerDiv = document.getElementById("dealer");
  dealerDiv.innerHTML =
    "Dealer: " +
    currentState.dealer.hand.map(c => c.value + c.suit).join(" ");

  renderTurnTimer();
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
