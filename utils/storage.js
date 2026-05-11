(function initVisaFlowXStorage(global) {
  "use strict";

  const STORAGE_KEYS = Object.freeze({
    CREDENTIALS: "vfx.credentials",
    RETRY: "vfx.retry",
    SCHEDULE: "vfx.schedule",
    SETTINGS: "vfx.settings",
    STATUS: "vfx.status"
  });

  const DEFAULTS = Object.freeze({
    credentials: {
      contactNumber: "",
      password: "",
      updatedAt: ""
    },
    retry: {
      enabled: true,
      maxAttempts: 5,
      baseDelayMs: 15000,
      maxDelayMs: 180000,
      refreshMode: "soft"
    },
    schedule: {
      enabled: false,
      runAt: "",
      nextRunAt: null
    },
    settings: {
      notifications: true,
      soundEnabled: true,
      alarmMuted: false,
      volume: 1,
      openSigninOnStart: true
    },
    status: {
      state: "IDLE",
      page: "",
      retryCountdownEndsAt: null,
      verificationState: "Idle",
      otpState: "Idle",
      schedulerState: "Not scheduled",
      lastAction: "Ready",
      lastError: "",
      activeTabId: null,
      updatedAt: ""
    }
  });

  function hasChromeStorage() {
    return Boolean(global.chrome?.storage?.local);
  }

  async function get(keys) {
    if (hasChromeStorage()) return chrome.storage.local.get(keys);
    const memory = global.__VisaFlowXMemoryStore || (global.__VisaFlowXMemoryStore = {});
    if (Array.isArray(keys)) return Object.fromEntries(keys.map((key) => [key, memory[key]]));
    if (typeof keys === "string") return { [keys]: memory[keys] };
    if (keys && typeof keys === "object") {
      return Object.fromEntries(Object.entries(keys).map(([key, fallback]) => [key, Object.hasOwn(memory, key) ? memory[key] : fallback]));
    }
    return { ...memory };
  }

  async function set(values) {
    if (hasChromeStorage()) return chrome.storage.local.set(values);
    const memory = global.__VisaFlowXMemoryStore || (global.__VisaFlowXMemoryStore = {});
    Object.assign(memory, values || {});
    return undefined;
  }

  function cleanCredentials(credentials = {}) {
    return {
      contactNumber: String(credentials.contactNumber || "").trim(),
      password: String(credentials.password || ""),
      updatedAt: credentials.updatedAt || new Date().toISOString()
    };
  }

  function cleanRetry(retry = {}) {
    return {
      ...DEFAULTS.retry,
      ...retry,
      enabled: retry.enabled !== false,
      maxAttempts: Math.max(0, Math.min(20, Number(retry.maxAttempts ?? DEFAULTS.retry.maxAttempts))),
      baseDelayMs: Math.max(1000, Number(retry.baseDelayMs ?? DEFAULTS.retry.baseDelayMs)),
      maxDelayMs: Math.max(5000, Number(retry.maxDelayMs ?? DEFAULTS.retry.maxDelayMs)),
      refreshMode: ["none", "soft", "hard"].includes(retry.refreshMode) ? retry.refreshMode : DEFAULTS.retry.refreshMode
    };
  }

  function cleanSchedule(schedule = {}) {
    return {
      ...DEFAULTS.schedule,
      ...schedule,
      enabled: schedule.enabled === true,
      runAt: String(schedule.runAt || ""),
      nextRunAt: schedule.nextRunAt ? Number(schedule.nextRunAt) : null
    };
  }

  function cleanSettings(settings = {}) {
    return {
      ...DEFAULTS.settings,
      ...settings,
      notifications: settings.notifications !== false,
      soundEnabled: settings.soundEnabled !== false,
      alarmMuted: settings.alarmMuted === true,
      volume: Math.max(0, Math.min(1, Number(settings.volume ?? DEFAULTS.settings.volume))),
      openSigninOnStart: settings.openSigninOnStart !== false
    };
  }

  function cleanStatus(status = {}) {
    return {
      ...DEFAULTS.status,
      ...status,
      updatedAt: status.updatedAt || new Date().toISOString()
    };
  }

  async function ensureDefaults() {
    const current = await get({
      [STORAGE_KEYS.CREDENTIALS]: null,
      [STORAGE_KEYS.RETRY]: null,
      [STORAGE_KEYS.SCHEDULE]: null,
      [STORAGE_KEYS.SETTINGS]: null,
      [STORAGE_KEYS.STATUS]: null
    });

    const state = {
      credentials: cleanCredentials(current[STORAGE_KEYS.CREDENTIALS] || DEFAULTS.credentials),
      retry: cleanRetry(current[STORAGE_KEYS.RETRY] || DEFAULTS.retry),
      schedule: cleanSchedule(current[STORAGE_KEYS.SCHEDULE] || DEFAULTS.schedule),
      settings: cleanSettings(current[STORAGE_KEYS.SETTINGS] || DEFAULTS.settings),
      status: cleanStatus(current[STORAGE_KEYS.STATUS] || DEFAULTS.status)
    };

    await set({
      [STORAGE_KEYS.CREDENTIALS]: state.credentials,
      [STORAGE_KEYS.RETRY]: state.retry,
      [STORAGE_KEYS.SCHEDULE]: state.schedule,
      [STORAGE_KEYS.SETTINGS]: state.settings,
      [STORAGE_KEYS.STATUS]: state.status
    });

    return state;
  }

  async function saveCredentials(credentials) {
    const value = cleanCredentials(credentials);
    await set({ [STORAGE_KEYS.CREDENTIALS]: value });
    return value;
  }

  async function saveRetry(retry) {
    const value = cleanRetry(retry);
    await set({ [STORAGE_KEYS.RETRY]: value });
    return value;
  }

  async function saveSchedule(schedule) {
    const value = cleanSchedule(schedule);
    await set({ [STORAGE_KEYS.SCHEDULE]: value });
    return value;
  }

  async function saveSettings(settings) {
    const value = cleanSettings(settings);
    await set({ [STORAGE_KEYS.SETTINGS]: value });
    return value;
  }

  async function saveStatus(status) {
    const value = cleanStatus(status);
    await set({ [STORAGE_KEYS.STATUS]: value });
    return value;
  }

  const Storage = Object.freeze({
    DEFAULTS,
    STORAGE_KEYS,
    cleanCredentials,
    cleanRetry,
    cleanSchedule,
    cleanSettings,
    cleanStatus,
    ensureDefaults,
    get,
    saveCredentials,
    saveRetry,
    saveSchedule,
    saveSettings,
    saveStatus,
    set
  });

  global.VisaFlowX = Object.assign(global.VisaFlowX || {}, { Storage });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Storage;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
