const FISH_COUNT = 6;
const MIN_DEPTH = 0.2;
const MAX_DEPTH = 0.9;
const BOAT_SPEED = 0.5; // fraction of width per second
const CATCH_RADIUS_X = 0.08;
const COINS_PER_FISH = 25;

const boatEl = document.getElementById("boat");
const waterEl = document.getElementById("water");
const fishLayer = document.getElementById("fishLayer");
const shotLayer = document.getElementById("shotLayer");
const chargeFill = document.getElementById("chargeFill");
const messageEl = document.getElementById("message");
const walletDisplay = document.getElementById("walletDisplay");
const caughtDisplay = document.getElementById("caughtDisplay");
const lastCatchDisplay = document.getElementById("lastCatchDisplay");

let boatX = 0.5;
let moveLeft = false;
let moveRight = false;
let charging = false;
let chargeLevel = 0;
let chargeSpeed = 0.8; // seconds to max
let lastTimestamp = undefined;
let fish = [];
let shots = [];
let caughtCount = 0;
let lastCatch = 0;
let shotCooldown = 0;

initFishing();

function initFishing() {
  initFish();
  updateBoatPosition();
  updateWalletDisplay();
  updateCaughtDisplay();
  updateLastCatchDisplay();
  attachInputHandlers();
  requestAnimationFrame(loop);
}

function initFish() {
  fishLayer.innerHTML = "";
  fish = [];
  for (let i = 0; i < FISH_COUNT; i += 1) {
    const f = createFish(i);
    const el = document.createElement("div");
    el.className = "fish";
    fishLayer.appendChild(el);
    f.el = el;
    fish.push(f);
  }
  syncFishElements();
}

function createFish(index) {
  const depth = 0.25 + Math.random() * 0.6;
  const speed = 0.05 + Math.random() * 0.08;
  const dir = Math.random() < 0.5 ? -1 : 1;
  const x = 0.15 + Math.random() * 0.7;
  return {
    id: index,
    x: x,
    y: depth,
    speed: speed,
    dir: dir
  };
}

function syncFishElements() {
  fish.forEach(f => {
    if (!f.el) {
      return;
    }
    f.el.style.left = String(f.x * 100) + "%";
    f.el.style.top = String(f.y * 100) + "%";
  });
}

function attachInputHandlers() {
  document.addEventListener("keydown", event => {
    if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") {
      moveLeft = true;
    } else if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") {
      moveRight = true;
    } else if (event.key === " " || event.code === "Space") {
      if (event.repeat) {
        return;
      }
      event.preventDefault();
      if (!charging) {
        charging = true;
        chargeLevel = 0;
      }
    }
  });

  document.addEventListener("keyup", event => {
    if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") {
      moveLeft = false;
    } else if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") {
      moveRight = false;
    } else if (event.key === " " || event.code === "Space") {
      event.preventDefault();
      if (charging) {
        fireShot();
      }
      charging = false;
      chargeLevel = 0;
      updateChargeBar();
    }
  });

  window.addEventListener("blur", () => {
    moveLeft = false;
    moveRight = false;
    charging = false;
    chargeLevel = 0;
    updateChargeBar();
  });
}

function loop(timestamp) {
  if (lastTimestamp === undefined) {
    lastTimestamp = timestamp;
  }
  const dt = Math.min((timestamp - lastTimestamp) / 1000, 0.033);
  lastTimestamp = timestamp;

  updateBoat(dt);
  updateCharge(dt);
  updateFish(dt);
  updateShots(dt);

  requestAnimationFrame(loop);
}

function updateBoat(dt) {
  let direction = 0;
  if (moveLeft) {
    direction -= 1;
  }
  if (moveRight) {
    direction += 1;
  }
  if (direction !== 0) {
    boatX += direction * BOAT_SPEED * dt;
    if (boatX < 0.05) {
      boatX = 0.05;
    } else if (boatX > 0.95) {
      boatX = 0.95;
    }
    updateBoatPosition();
  }
}

function updateBoatPosition() {
  boatEl.style.left = String(boatX * 100) + "%";
}

function updateCharge(dt) {
  if (charging) {
    chargeLevel += dt / chargeSpeed;
    if (chargeLevel > 1) {
      chargeLevel = 1;
    }
    updateChargeBar();
  }
  if (shotCooldown > 0) {
    shotCooldown -= dt;
    if (shotCooldown < 0) {
      shotCooldown = 0;
    }
  }
}

function updateChargeBar() {
  const percent = Math.max(0, Math.min(1, chargeLevel)) * 100;
  chargeFill.style.width = String(percent) + "%";
}

function updateFish(dt) {
  if (fish.length === 0) {
    return;
  }
  fish.forEach(f => {
    f.x += f.dir * f.speed * dt;
    if (f.x < 0.05) {
      f.x = 0.05;
      f.dir *= -1;
    } else if (f.x > 0.95) {
      f.x = 0.95;
      f.dir *= -1;
    }
  });
  syncFishElements();
}

function updateShots(dt) {
  if (shots.length === 0) {
    return;
  }
  const still = [];
  shots.forEach(shot => {
    shot.time += dt;
    if (shot.time >= shot.lifetime) {
      if (shot.el && shot.el.parentElement === shotLayer) {
        shotLayer.removeChild(shot.el);
      }
    } else {
      still.push(shot);
    }
  });
  shots = still;
}

function fireShot() {
  if (shotCooldown > 0) {
    return;
  }
  shotCooldown = 0.25;

  const power = Math.max(0.1, Math.min(1, chargeLevel));
  const depth = MIN_DEPTH + (MAX_DEPTH - MIN_DEPTH) * power;

  const caught = findCaughtFish(depth);
  createShotVisual(depth);

  if (caught) {
    handleCatch(caught);
  } else {
    setMessage("Missed. Try adjusting your depth.");
  }
}

function findCaughtFish(depth) {
  let candidate = null;
  fish.forEach(f => {
    if (Math.abs(f.x - boatX) <= CATCH_RADIUS_X && f.y >= 0 && f.y <= depth) {
      if (!candidate || f.y < candidate.y) {
        candidate = f;
      }
    }
  });
  return candidate;
}

function createShotVisual(depth) {
  const shot = document.createElement("div");
  shot.className = "shot";
  shot.style.left = String(boatX * 100) + "%";
  shot.style.height = String(depth * 100) + "%";
  shotLayer.appendChild(shot);
  // Force layout so the transition applies.
  void shot.offsetHeight;
  shot.classList.add("visible");

  shots.push({
    el: shot,
    time: 0,
    lifetime: 0.35
  });
}

function handleCatch(f) {
  const api = typeof window !== "undefined" ? window.wallet : undefined;
  if (api && typeof api.add === "function") {
    api.add(COINS_PER_FISH);
  }

  caughtCount += 1;
  lastCatch = COINS_PER_FISH;
  updateWalletDisplay();
  updateCaughtDisplay();
  updateLastCatchDisplay();
  setMessage("You caught a fish! +" + formatCurrency(lastCatch) + ".");

  // Respawn fish at a new random position.
  const replacement = createFish(f.id);
  replacement.el = f.el;
  const index = fish.indexOf(f);
  if (index !== -1) {
    fish[index] = replacement;
  }
  syncFishElements();
}

function updateWalletDisplay() {
  try {
    if (typeof window !== "undefined" && window.wallet && typeof window.wallet.getBalance === "function") {
      const balance = window.wallet.getBalance();
      if (walletDisplay) {
        walletDisplay.textContent = formatCurrency(balance);
      }
      return;
    }
  } catch (error) {}
  if (walletDisplay) {
    walletDisplay.textContent = "$0";
  }
}

function updateCaughtDisplay() {
  if (caughtDisplay) {
    caughtDisplay.textContent = String(caughtCount);
  }
}

function updateLastCatchDisplay() {
  if (lastCatchDisplay) {
    if (lastCatch > 0) {
      lastCatchDisplay.textContent = "+" + formatCurrency(lastCatch);
    } else {
      lastCatchDisplay.textContent = "+0";
    }
  }
}

function setMessage(text) {
  if (messageEl) {
    messageEl.textContent = text;
  }
}

function formatCurrency(amount) {
  return "$" + amount.toLocaleString("en-US");
}
