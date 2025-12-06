const walletBalanceEl = document.getElementById("walletBalance");
const walletResetButton = document.getElementById("walletReset");
if (walletResetButton) {
  walletResetButton.remove();
}

function formatCurrency(amount) {
  return "$" + amount.toLocaleString("en-US");
}

function safeGetBalance() {
  try {
    if (typeof window !== "undefined" && window.wallet && typeof window.wallet.getBalance === "function") {
      const value = window.wallet.getBalance();
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        return Math.floor(value);
      }
    }
  } catch (error) {}
  return 0;
}

function updateWalletDisplay() {
  if (!walletBalanceEl) {
    return;
  }
  const balance = safeGetBalance();
  walletBalanceEl.textContent = formatCurrency(balance);
}
const searchInput = document.getElementById("gameSearch");
const categoryFilter = document.getElementById("categoryFilter");
const sortOrder = document.getElementById("sortOrder");
const gamesGrid = document.getElementById("gamesGrid");
const gamesCountEl = document.getElementById("gamesCount");

let games = [];

function initGames() {
  if (!gamesGrid) {
    return;
  }
  const cards = Array.from(gamesGrid.querySelectorAll(".game-card"));
  games = cards.map((node, index) => {
    const rawTitle = (node.dataset.title || node.textContent || "").trim();
    const titleLower = rawTitle.toLowerCase();
    const category = node.dataset.category || "all";
    const featured = node.dataset.featured === "true";
    const popularityRaw = Number(node.dataset.popularity || String(index));
    const popularity = Number.isFinite(popularityRaw) ? popularityRaw : index;
    return {
      node: node,
      title: titleLower,
      displayTitle: rawTitle,
      category: category,
      featured: featured,
      popularity: popularity
    };
  });

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      applyGameFilters();
    });
  }

  if (categoryFilter) {
    categoryFilter.addEventListener("change", () => {
      applyGameFilters();
    });
  }

  if (sortOrder) {
    sortOrder.addEventListener("change", () => {
      applyGameFilters();
    });
  }

  applyGameFilters();
}

function applyGameFilters() {
  if (!gamesGrid || games.length === 0) {
    if (gamesCountEl) {
      gamesCountEl.textContent = "0 games";
    }
    return;
  }

  const searchTerm = searchInput && searchInput.value ? searchInput.value.toLowerCase().trim() : "";
  const selectedCategory = categoryFilter && categoryFilter.value ? categoryFilter.value : "all";
  const sort = sortOrder && sortOrder.value ? sortOrder.value : "featured";

  const filtered = games.filter(game => {
    if (selectedCategory !== "all" && game.category !== selectedCategory) {
      return false;
    }
    if (searchTerm && game.title.indexOf(searchTerm) === -1) {
      return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    if (sort === "alpha") {
      if (a.displayTitle < b.displayTitle) return -1;
      if (a.displayTitle > b.displayTitle) return 1;
      return 0;
    }
    if (sort === "featured") {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      if (b.popularity !== a.popularity) {
        return b.popularity - a.popularity;
      }
      return 0;
    }
    return 0;
  });

  games.forEach(game => {
    if (game.node.parentElement === gamesGrid) {
      gamesGrid.removeChild(game.node);
    }
  });

  filtered.forEach(game => {
    gamesGrid.appendChild(game.node);
  });

  if (gamesCountEl) {
    const count = filtered.length;
    gamesCountEl.textContent = count === 1 ? "1 game" : String(count) + " games";
  }
}

window.addEventListener("focus", () => {
  updateWalletDisplay();
  applyGameFilters();
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    updateWalletDisplay();
    applyGameFilters();
  }
});

updateWalletDisplay();
initGames();
