(function initStorage(global) {
  "use strict";

  const Constants = global.VisaFlowXUniversal?.Constants || {};
  const memoryStore = new Map();

  function hasChromeStorage() {
    return Boolean(global.chrome?.storage?.local);
  }

  async function get(keys) {
    if (!hasChromeStorage()) {
      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map((key) => [key, memoryStore.get(key)]));
      }
      if (typeof keys === "string") return { [keys]: memoryStore.get(keys) };
      if (keys && typeof keys === "object") {
        return Object.fromEntries(Object.entries(keys).map(([key, fallback]) => [key, memoryStore.has(key) ? memoryStore.get(key) : fallback]));
      }
      return Object.fromEntries(memoryStore.entries());
    }
    return chrome.storage.local.get(keys);
  }

  async function set(values) {
    if (!hasChromeStorage()) {
      Object.entries(values || {}).forEach(([key, value]) => memoryStore.set(key, value));
      return;
    }
    return chrome.storage.local.set(values);
  }

  async function remove(keys) {
    if (!hasChromeStorage()) {
      (Array.isArray(keys) ? keys : [keys]).forEach((key) => memoryStore.delete(key));
      return;
    }
    return chrome.storage.local.remove(keys);
  }

  async function ensureDefaults() {
    const { STORAGE_KEYS, DEFAULT_PROFILES, DEFAULT_SETTINGS } = Constants;
    const current = await get({
      [STORAGE_KEYS.PROFILES]: null,
      [STORAGE_KEYS.ACTIVE_PROFILE_ID]: null,
      [STORAGE_KEYS.SETTINGS]: null,
      [STORAGE_KEYS.STATUS]: null,
      [STORAGE_KEYS.LOGS]: [],
      [STORAGE_KEYS.SCHEDULES]: []
    });

    const profiles = current[STORAGE_KEYS.PROFILES] || DEFAULT_PROFILES || [];
    const activeProfileId = current[STORAGE_KEYS.ACTIVE_PROFILE_ID] || profiles[0]?.id || "";
    const settings = { ...(DEFAULT_SETTINGS || {}), ...(current[STORAGE_KEYS.SETTINGS] || {}) };
    const status = current[STORAGE_KEYS.STATUS] || {
      state: "IDLE",
      activeSite: "",
      workflowStage: "Idle",
      currentRule: "",
      retryCountdownEndsAt: null,
      lastAction: "Ready",
      lastError: "",
      monitoring: false,
      protectedChallenge: false,
      updatedAt: new Date().toISOString()
    };

    await set({
      [STORAGE_KEYS.PROFILES]: profiles,
      [STORAGE_KEYS.ACTIVE_PROFILE_ID]: activeProfileId,
      [STORAGE_KEYS.SETTINGS]: settings,
      [STORAGE_KEYS.STATUS]: status,
      [STORAGE_KEYS.LOGS]: current[STORAGE_KEYS.LOGS] || [],
      [STORAGE_KEYS.SCHEDULES]: current[STORAGE_KEYS.SCHEDULES] || []
    });

    return { profiles, activeProfileId, settings, status, logs: current[STORAGE_KEYS.LOGS] || [], schedules: current[STORAGE_KEYS.SCHEDULES] || [] };
  }

  const Storage = Object.freeze({ ensureDefaults, get, remove, set });

  global.VisaFlowXUniversal = Object.assign(global.VisaFlowXUniversal || {}, { Storage });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Storage;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
