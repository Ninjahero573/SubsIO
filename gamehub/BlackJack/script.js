const walletDisplay = document.getElementById("walletDisplay");
const betInput = document.getElementById("betInput");
const dealButton = document.getElementById("dealButton");
const hitButton = document.getElementById("hitButton");
const standButton = document.getElementById("standButton");
const playerCardsEl = document.getElementById("playerCards");
const aiCardsEl = document.getElementById("aiCards");
const communityCardsEl = document.getElementById("communityCards");
const statusText = document.getElementById("statusText");
const handInfo = document.getElementById("handInfo");

const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const SUITS = ["♠", "♥", "♦", "♣"];

let gameState = "idle"; // idle, playerTurn, dealerTurn, gameOver
let deck = [];
let playerHand = [];
let dealerHand = [];
let currentBet = 0;

init();

function init() {
  if (dealButton) {
    dealButton.addEventListener("click", () => {
      handleDealClick();
    });
  }

  if (hitButton) {
    hitButton.addEventListener("click", () => {
      handleHit();
    });
  }

  if (standButton) {
    standButton.addEventListener("click", () => {
      handleStand();
    });
  }

  window.addEventListener("focus", () => {
    updateWalletDisplay();
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      updateWalletDisplay();
    }
  });

  if (hitButton) {
    hitButton.disabled = true;
  }

  if (standButton) {
    standButton.disabled = true;
  }

  updateWalletDisplay();
  setStatus("Enter a bet and deal a new hand.");
  updateView();
}

function getWallet() {
  try {
    if (typeof window !== "undefined" && window.wallet) {
      return window.wallet;
    }
  } catch (error) {}
  return null;
}

function safeGetBalance() {
  const wallet = getWallet();
  if (!wallet || typeof wallet.getBalance !== "function") {
    return 0;
  }
  try {
    const value = wallet.getBalance();
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return Math.floor(value);
    }
  } catch (error) {}
  return 0;
}

function updateWalletDisplay() {
  if (!walletDisplay) {
    return;
  }
  const balance = safeGetBalance();
  walletDisplay.textContent = formatCurrency(balance);
}

function formatCurrency(amount) {
  return "$" + amount.toLocaleString("en-US");
}

function setStatus(text) {
  if (statusText) {
    statusText.textContent = text;
  }
}

function setHandInfo(text) {
  if (handInfo) {
    handInfo.textContent = text;
  }
}

function handleDealClick() {
  if (gameState !== "idle") {
    return;
  }

  const wallet = getWallet();
  if (!wallet) {
    setStatus("Wallet not available. Open this game from the main portal.");
    return;
  }

  const rawBet = betInput ? Number(betInput.value) : NaN;
  const bet = Number.isFinite(rawBet) ? Math.floor(rawBet) : NaN;

  if (!Number.isFinite(bet) || bet <= 0) {
    setStatus("Enter a bet greater than zero.");
    return;
  }

  if (typeof wallet.canSpend === "function" && !wallet.canSpend(bet)) {
    setStatus("You don't have enough in your wallet for that bet.");
    return;
  }

  if (typeof wallet.spend === "function") {
    const ok = wallet.spend(bet);
    if (!ok) {
      setStatus("Could not place bet. Check your balance.");
      updateWalletDisplay();
      return;
    }
  }

  currentBet = bet;

  if (betInput) {
    betInput.disabled = true;
  }

  resetHands();
  buildShuffledDeck();

  playerHand.push(drawCard());
  dealerHand.push(drawCard());
  playerHand.push(drawCard());
  dealerHand.push(drawCard());

  const playerValue = calculateHandValue(playerHand);
  const dealerValue = calculateHandValue(dealerHand);

  if (playerValue === 21) {
    if (dealerValue === 21) {
      endGame("push");
    } else {
      endGame("blackjack");
    }
    return;
  }

  gameState = "playerTurn";
  if (hitButton) {
    hitButton.disabled = false;
  }
  if (standButton) {
    standButton.disabled = false;
  }
  if (dealButton) {
    dealButton.disabled = true;
  }

  setStatus("Your turn. Hit or Stand?");
  setHandInfo(`Your hand: ${playerValue}`);
  updateWalletDisplay();
  updateView();
}

function resetHands() {
  deck = [];
  playerHand = [];
  dealerHand = [];
} 

function buildShuffledDeck() {
  deck = [];
  for (let r = 0; r < RANKS.length; r++) {
    for (let s = 0; s < SUITS.length; s++) {
      deck.push({ rank: RANKS[r], suit: SUITS[s] });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }
}

function drawCard() {
  if (deck.length === 0) {
    buildShuffledDeck();
  }
  return deck.pop();
}

function handleHit() {
  if (gameState !== "playerTurn") {
    return;
  }

  playerHand.push(drawCard());
  const playerValue = calculateHandValue(playerHand);

  if (playerValue > 21) {
    endGame("bust");
    return;
  }

  if (playerValue === 21) {
    handleStand();
    return;
  }

  setHandInfo(`Your hand: ${playerValue}`);
  updateView();
}

function handleStand() {
  if (gameState !== "playerTurn") {
    return;
  }

  gameState = "dealerTurn";
  if (hitButton) {
    hitButton.disabled = true;
  }
  if (standButton) {
    standButton.disabled = true;
  }

  const playerValue = calculateHandValue(playerHand);
  let dealerValue = calculateHandValue(dealerHand);

  while (dealerValue < 17) {
    dealerHand.push(drawCard());
    dealerValue = calculateHandValue(dealerHand);
  }

  if (dealerValue > 21) {
    endGame("dealerBust");
  } else if (playerValue > dealerValue) {
    endGame("win");
  } else if (playerValue < dealerValue) {
    endGame("lose");
  } else {
    endGame("push");
  }
}

function calculateHandValue(hand) {
  let value = 0;
  let aces = 0;

  for (let i = 0; i < hand.length; i++) {
    const rank = hand[i].rank;
    if (rank === 14) {
      aces++;
      value += 11;
    } else if (rank >= 11 && rank <= 13) {
      value += 10;
    } else {
      value += rank;
    }
  }

  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }

  return value;
}

function endGame(result) {
  gameState = "gameOver";
  const wallet = getWallet();
  const playerValue = calculateHandValue(playerHand);
  const dealerValue = calculateHandValue(dealerHand);

  if (result === "blackjack") {
    const winnings = Math.floor(currentBet * 2.5);
    if (wallet && typeof wallet.add === "function") {
      wallet.add(winnings);
    }
    setStatus("Blackjack! You win " + formatCurrency(winnings) + "!");
  } else if (result === "win") {
    const winnings = currentBet * 2;
    if (wallet && typeof wallet.add === "function") {
      wallet.add(winnings);
    }
    setStatus("You win " + formatCurrency(winnings) + "!");
  } else if (result === "dealerBust") {
    const winnings = currentBet * 2;
    if (wallet && typeof wallet.add === "function") {
      wallet.add(winnings);
    }
    setStatus("Dealer busts! You win " + formatCurrency(winnings) + "!");
  } else if (result === "bust") {
    setStatus("Bust! You lose.");
  } else if (result === "lose") {
    setStatus("Dealer wins. You lose.");
  } else if (result === "push") {
    if (wallet && typeof wallet.add === "function") {
      wallet.add(currentBet);
    }
    setStatus("Push! Your bet is returned.");
  }

  setHandInfo(`Your hand: ${playerValue} | Dealer: ${dealerValue}`);

  updateWalletDisplay();
  updateView();

  gameState = "idle";
  currentBet = 0;
  if (hitButton) {
    hitButton.disabled = true;
  }
  if (standButton) {
    standButton.disabled = true;
  }
  if (dealButton) {
    dealButton.disabled = false;
  }
  if (betInput) {
    betInput.disabled = false;
  }
}

function updateView() {
  renderHand(playerCardsEl, playerHand, true);
  const revealDealer = gameState === "dealerTurn" || gameState === "gameOver";
  renderHand(aiCardsEl, dealerHand, revealDealer);
  if (communityCardsEl) {
    communityCardsEl.innerHTML = "";
  }
}

function renderHand(container, cards, reveal) {
  if (!container) {
    return;
  }
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (!reveal && i > 0) {
      const back = document.createElement("div");
      back.className = "card-back";
      container.appendChild(back);
      continue;
    }
    const el = document.createElement("div");
    const isRed = card.suit === "♥" || card.suit === "♦";
    el.className = "card " + (isRed ? "red" : "black");

    const top = document.createElement("div");
    top.className = "card-rank";
    top.textContent = rankToLabel(card.rank);

    const bottom = document.createElement("div");
    bottom.className = "card-suit";
    bottom.textContent = card.suit;

    el.appendChild(top);
    el.appendChild(bottom);
    container.appendChild(el);
  }
}

function rankToLabel(rank) {
  if (rank <= 10) {
    return String(rank);
  }
  if (rank === 11) return "J";
  if (rank === 12) return "Q";
  if (rank === 13) return "K";
  if (rank === 14) return "A";
  return String(rank);
}

