const ROWS = 3;
const COLS = 5;

const SYMBOLS = [
  { id: "star", label: "★", color: "#fbbf24", weight: 1, payouts: { 3: 20, 4: 60, 5: 200 } },
  { id: "planet", label: "✦", color: "#38bdf8", weight: 2, payouts: { 3: 10, 4: 30, 5: 80 } },
  { id: "gem", label: "◆", color: "#22c55e", weight: 3, payouts: { 3: 8, 4: 20, 5: 50 } },
  { id: "moon", label: "☾", color: "#a855f7", weight: 4, payouts: { 3: 5, 4: 14, 5: 35 } },
  { id: "comet", label: "✧", color: "#f97316", weight: 5, payouts: { 3: 4, 4: 10, 5: 25 } },
  { id: "dust", label: "•", color: "#e5e7eb", weight: 7, payouts: { 3: 2, 4: 5, 5: 12 } }
];

const PAYLINES = [
  [0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 0, 0],
  [1, 2, 2, 2, 1],
  [2, 2, 1, 2, 2],
  [1, 0, 0, 0, 1],
  [0, 1, 1, 1, 2]
];

const MIN_BET = 1;
const MAX_BET = 20;
const MIN_LINES = 1;
const MAX_LINES = PAYLINES.length;
const START_BALANCE = 1000;
const STORAGE_KEY = "galaxy-slots-balance-v1";

const reelsEl = document.getElementById("reels");
const spinButton = document.getElementById("spinButton");
const balanceDisplay = document.getElementById("balanceDisplay");
const betDisplay = document.getElementById("betDisplay");
const linesDisplay = document.getElementById("linesDisplay");
const lastWinDisplay = document.getElementById("lastWinDisplay");
const messageText = document.getElementById("messageText");
const betDown = document.getElementById("betDown");
const betUp = document.getElementById("betUp");
const linesDown = document.getElementById("linesDown");
const linesUp = document.getElementById("linesUp");
const helpButton = document.getElementById("helpButton");
const helpModal = document.getElementById("helpModal");
const closeHelp = document.getElementById("closeHelp");

let balance = loadBalance();
let betPerLine = 2;
let activeLines = 10;
let lastWin = 0;
let isSpinning = false;
let audioCtx;

const weightedIndexes = buildWeightedIndexes();

init();

function init() {
  buildInitialReels();
  updateAllDisplays();
  attachHandlers();
  updateMessage("Press Spin to play.");
}

function attachHandlers() {
  spinButton.addEventListener("click", () => {
    handleSpinClick();
  });

  betDown.addEventListener("click", () => {
    changeBet(-1);
  });

  betUp.addEventListener("click", () => {
    changeBet(1);
  });

  linesDown.addEventListener("click", () => {
    changeLines(-1);
  });

  linesUp.addEventListener("click", () => {
    changeLines(1);
  });

  helpButton.addEventListener("click", () => {
    toggleHelp(true);
  });

  closeHelp.addEventListener("click", () => {
    toggleHelp(false);
  });

  helpModal.addEventListener("click", event => {
    if (event.target === helpModal) {
      toggleHelp(false);
    }
  });
}

function toggleHelp(show) {
  if (!helpModal) {
    return;
  }
  if (show) {
    helpModal.classList.add("visible");
  } else {
    helpModal.classList.remove("visible");
  }
}

function loadBalance() {
  try {
    if (typeof window !== "undefined" && window.wallet && typeof window.wallet.getBalance === "function") {
      const value = window.wallet.getBalance();
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        return Math.floor(value);
      }
    }
  } catch (error) {}
  return START_BALANCE;
}

function saveBalance() {
  try {
    if (typeof window !== "undefined" && window.wallet && typeof window.wallet.setBalance === "function") {
      window.wallet.setBalance(balance);
    }
  } catch (error) {}
}

function buildWeightedIndexes() {
  const result = [];
  for (let i = 0; i < SYMBOLS.length; i += 1) {
    const symbol = SYMBOLS[i];
    for (let w = 0; w < symbol.weight; w += 1) {
      result.push(i);
    }
  }
  return result;
}

function randomSymbolIndex() {
  const index = Math.floor(Math.random() * weightedIndexes.length);
  return weightedIndexes[index];
}

function buildInitialReels() {
  const columns = reelsEl.querySelectorAll(".reel-column");
  columns.forEach(column => {
    const colIndex = Number(column.dataset.col || 0);
    column.innerHTML = "";
    for (let row = 0; row < ROWS; row += 1) {
      const symbolIndex = randomSymbolIndex();
      const cell = document.createElement("div");
      cell.className = "symbol";
      cell.dataset.row = String(row);
      cell.dataset.col = String(colIndex);
      applySymbolVisual(cell, SYMBOLS[symbolIndex]);
      column.appendChild(cell);
    }
  });
}

function applySymbolVisual(element, symbol) {
  element.textContent = symbol.label;
  element.style.color = symbol.color;
}

function updateAllDisplays() {
  balanceDisplay.textContent = formatCurrency(balance);
  betDisplay.textContent = formatCurrency(betPerLine);
  linesDisplay.textContent = String(activeLines);
  lastWinDisplay.textContent = formatCurrency(lastWin);
}

function updateBalanceDisplay() {
  balanceDisplay.textContent = formatCurrency(balance);
}

function updateBetDisplay() {
  betDisplay.textContent = formatCurrency(betPerLine);
}

function updateLinesDisplay() {
  linesDisplay.textContent = String(activeLines);
}

function updateLastWinDisplay() {
  lastWinDisplay.textContent = formatCurrency(lastWin);
}

function formatCurrency(amount) {
  return "$" + amount.toLocaleString("en-US");
}

function changeBet(delta) {
  if (isSpinning) {
    return;
  }
  const next = Math.max(MIN_BET, Math.min(MAX_BET, betPerLine + delta));
  betPerLine = next;
  updateBetDisplay();
}

function changeLines(delta) {
  if (isSpinning) {
    return;
  }
  const next = Math.max(MIN_LINES, Math.min(MAX_LINES, activeLines + delta));
  activeLines = next;
  updateLinesDisplay();
}

function handleSpinClick() {
  if (isSpinning) {
    return;
  }

  const totalBet = betPerLine * activeLines;
  const walletApi = typeof window !== "undefined" ? window.wallet : undefined;

  if (totalBet <= 0) {
    updateMessage("Increase your bet or lines.");
    flashPanel("danger");
    return;
  }

  if (walletApi && typeof walletApi.canSpend === "function") {
    if (!walletApi.canSpend(totalBet)) {
      updateMessage("Not enough balance. Lower your bet or lines.");
      flashPanel("danger");
      return;
    }
  } else if (totalBet > balance) {
    updateMessage("Not enough balance. Lower your bet or lines.");
    flashPanel("danger");
    return;
  }

  isSpinning = true;
  setSpinState(true);
  clearWins();

  let spent = false;
  if (walletApi && typeof walletApi.spend === "function") {
    if (!walletApi.spend(totalBet)) {
      isSpinning = false;
      setSpinState(false);
      updateMessage("Not enough balance. Lower your bet or lines.");
      flashPanel("danger");
      return;
    }
    if (typeof walletApi.getBalance === "function") {
      balance = walletApi.getBalance();
    }
    spent = true;
  }

  if (!spent) {
    balance -= totalBet;
    saveBalance();
  }

  updateBalanceDisplay();
  lastWin = 0;
  updateLastWinDisplay();
  updateMessage("Spinning...");
  playSound("spin");

  const grid = generateSpinResult();

  animateReelsTo(grid).then(() => {
    const result = evaluateGrid(grid);
    const winAmount = result.totalWin;
    if (winAmount > 0) {
      if (walletApi && typeof walletApi.add === "function") {
        walletApi.add(winAmount);
        if (typeof walletApi.getBalance === "function") {
          balance = walletApi.getBalance();
        }
      } else {
        balance += winAmount;
        saveBalance();
      }
      lastWin = winAmount;
      updateBalanceDisplay();
      updateLastWinDisplay();
      highlightWins(result.winPositions);
      updateMessage("You won " + formatCurrency(winAmount) + ".");
      flashPanel("win");
      playSound("win");
    } else {
      lastWin = 0;
      updateLastWinDisplay();
      updateMessage("No win. Try again.");
    }
    isSpinning = false;
    setSpinState(false);
  });
}

function setSpinState(spinning) {
  spinButton.disabled = spinning;
  betDown.disabled = spinning;
  betUp.disabled = spinning;
  linesDown.disabled = spinning;
  linesUp.disabled = spinning;
  if (spinning) {
    spinButton.classList.add("spinning");
    spinButton.textContent = "SPINNING";
  } else {
    spinButton.classList.remove("spinning");
    spinButton.textContent = "SPIN";
  }
}

function generateSpinResult() {
  const grid = [];
  for (let row = 0; row < ROWS; row += 1) {
    const rowArr = [];
    for (let col = 0; col < COLS; col += 1) {
      rowArr.push(randomSymbolIndex());
    }
    grid.push(rowArr);
  }
  return grid;
}

function animateReelsTo(grid) {
  const durationPerReel = 420;
  const stagger = 120;
  const promises = [];

  for (let col = 0; col < COLS; col += 1) {
    const promise = new Promise(resolve => {
      setTimeout(() => {
        spinColumn(col, grid, durationPerReel, resolve);
      }, col * stagger);
    });
    promises.push(promise);
  }

  return Promise.all(promises).then(() => {
    return undefined;
  });
}

function spinColumn(col, finalGrid, duration, done) {
  const columnEl = reelsEl.querySelector('.reel-column[data-col="' + col + '"]');
  if (!columnEl) {
    done();
    return;
  }
  const steps = 10;
  let step = 0;
  const interval = setInterval(() => {
    step += 1;
    if (step < steps) {
      for (let row = 0; row < ROWS; row += 1) {
        const index = randomSymbolIndex();
        applySymbolToCell(columnEl, row, col, index);
      }
    } else {
      for (let row = 0; row < ROWS; row += 1) {
        const index = finalGrid[row][col];
        applySymbolToCell(columnEl, row, col, index);
      }
      clearInterval(interval);
      done();
    }
  }, duration / steps);
}

function applySymbolToCell(columnEl, row, col, symbolIndex) {
  let cell = columnEl.querySelector('.symbol[data-row="' + row + '"]');
  if (!cell) {
    cell = document.createElement("div");
    cell.className = "symbol";
    cell.dataset.row = String(row);
    cell.dataset.col = String(col);
    columnEl.appendChild(cell);
  }
  const symbol = SYMBOLS[symbolIndex];
  applySymbolVisual(cell, symbol);
}

function clearWins() {
  const wins = reelsEl.querySelectorAll(".symbol.win");
  wins.forEach(element => {
    element.classList.remove("win");
  });
}

function evaluateGrid(grid) {
  let totalWin = 0;
  const winPositions = [];
  const seen = new Set();

  for (let lineIndex = 0; lineIndex < activeLines; lineIndex += 1) {
    const path = PAYLINES[lineIndex];
    const firstRow = path[0];
    const firstSymbolIndex = grid[firstRow][0];
    let count = 1;

    for (let col = 1; col < COLS; col += 1) {
      const row = path[col];
      if (grid[row][col] === firstSymbolIndex) {
        count += 1;
      } else {
        break;
      }
    }

    if (count >= 3) {
      const symbol = SYMBOLS[firstSymbolIndex];
      const payoutBase = symbol.payouts[count];
      if (payoutBase) {
        const amount = payoutBase * betPerLine;
        totalWin += amount;
        for (let col = 0; col < count; col += 1) {
          const row = path[col];
          const key = row + "-" + col;
          if (!seen.has(key)) {
            seen.add(key);
            winPositions.push({ row: row, col: col });
          }
        }
      }
    }
  }

  return { totalWin: totalWin, winPositions: winPositions };
}

function highlightWins(winPositions) {
  winPositions.forEach(position => {
    const columnEl = reelsEl.querySelector('.reel-column[data-col="' + position.col + '"]');
    if (!columnEl) {
      return;
    }
    const cell = columnEl.querySelector('.symbol[data-row="' + position.row + '"]');
    if (cell) {
      cell.classList.add("win");
    }
  });
}

function updateMessage(text) {
  messageText.textContent = text;
}

function flashPanel(kind) {
  const panel = document.querySelector(".status-panel");
  if (!panel) {
    return;
  }
  const cls = kind === "danger" ? "flash-danger" : "flash-win";
  panel.classList.remove("flash-danger", "flash-win");
  void panel.offsetWidth;
  panel.classList.add(cls);
}

function ensureAudioContext() {
  if (audioCtx) {
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    return audioCtx;
  }
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) {
    return undefined;
  }
  audioCtx = new Ctor();
  return audioCtx;
}

function playSound(kind) {
  const ctx = ensureAudioContext();
  if (!ctx) {
    return;
  }
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.connect(gain);
  gain.connect(ctx.destination);

  if (kind === "spin") {
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(440, ctx.currentTime);
    oscillator.frequency.linearRampToValueAtTime(620, ctx.currentTime + 0.25);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.002, ctx.currentTime + 0.3);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.32);
  } else if (kind === "win") {
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(660, ctx.currentTime);
    oscillator.frequency.setValueAtTime(880, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.09, ctx.currentTime + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.002, ctx.currentTime + 0.4);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.45);
  }
}
