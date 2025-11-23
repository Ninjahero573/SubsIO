(function () {
  const STORAGE_KEY = "webgames-wallet-balance-v1";
  const START_BALANCE = 1000;
  let memoryBalance = START_BALANCE;

  function parseValue(raw) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
    }
    return Math.floor(parsed);
  }

  function read() {
    try {
      if (typeof window === "undefined" || !window.localStorage) {
        return memoryBalance;
      }
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === null) {
        return memoryBalance;
      }
      const parsed = parseValue(raw);
      if (parsed === null) {
        return memoryBalance;
      }
      memoryBalance = parsed;
      return parsed;
    } catch (error) {
      return memoryBalance;
    }
  }

  function write(value) {
    const numeric = Number(value);
    const clamped = Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : memoryBalance;
    memoryBalance = clamped;
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, String(clamped));
      }
    } catch (error) {}
    return clamped;
  }

  function ensureInitial() {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw === null) {
          write(START_BALANCE);
          return;
        }
        const parsed = parseValue(raw);
        if (parsed === null) {
          write(START_BALANCE);
          return;
        }
        memoryBalance = parsed;
        return;
      }
    } catch (error) {}
    memoryBalance = START_BALANCE;
  }

  function getBalance() {
    return read();
  }

  function setBalance(value) {
    return write(value);
  }

  function add(amount) {
    const current = read();
    const numeric = Number(amount);
    if (!Number.isFinite(numeric)) {
      return current;
    }
    return write(current + numeric);
  }

  function canSpend(amount) {
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return false;
    }
    return read() >= numeric;
  }

  function spend(amount) {
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return false;
    }
    if (!canSpend(numeric)) {
      return false;
    }
    const current = read();
    write(current - numeric);
    return true;
  }

  function reset() {
    return write(START_BALANCE);
  }

  ensureInitial();

  const api = {
    getBalance,
    setBalance,
    add,
    canSpend,
    spend,
    reset,
    START_BALANCE
  };

  if (typeof window !== "undefined") {
    window.wallet = api;
  }
})();
