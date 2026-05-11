"use strict";

window.VisaFlowXStorage = (() => {
  const KEYS = {
    credentials: "visaflowx.credentials",
    settings: "visaflowx.settings",
    status: "visaflowx.status",
    retryState: "visaflowx.retryState",
    scheduleState: "visaflowx.scheduleState",
    notificationState: "visaflowx.notificationState"
  };

  const DEFAULT_SETTINGS = {
    automationEnabled: false,
    delayMode: "balanced",
    delays: {
      fast: {
        autofill: 120,
        signIn: 450,
        retryBuffer: 1000,
        domWait: 300
      },
      balanced: {
        autofill: 250,
        signIn: 900,
        retryBuffer: 2000,
        domWait: 600
      },
      safe: {
        autofill: 500,
        signIn: 1500,
        retryBuffer: 3500,
        domWait: 1000
      }
    },
    sound: {
      volume: 1,
      muted: false
    },
    notifications: {
      otp: true,
      retry: true,
      captcha: true,
      errors: true,
      login: true
    }
  };

  const DEFAULT_STATUS = {
    workflowState: "IDLE",
    state: "Idle",
    actionRequired: "Press Start Automation when ready.",
    currentPage: "Unknown",
    automationEnabled: false,
    activeAutomationTabId: null,
    timerStatus: "None",
    retryEndsAt: null,
    lastLoginAttempt: null,
    scheduleEnabled: false,
    scheduledAt: null,
    captchaState: "Unknown",
    otpDetected: false,
    lastError: "",
    debug: {
      activeTabUrl: "",
      injectionSuccess: false,
      detectorState: "Unknown",
      workflowState: "IDLE",
      contentScriptStatus: "Not checked",
      lastRuntimeMessage: "",
      lastError: ""
    },
    lastEventAt: null,
    lastMessage: "Ready"
  };

  const DEFAULT_SCHEDULE_STATE = {
    enabled: false,
    scheduledAt: null,
    createdAt: null,
    lastStartedAt: null,
    lastClearedAt: null,
    lastError: ""
  };

  function mergeDeep(base, patch) {
    if (!patch || typeof patch !== "object") {
      return base;
    }

    const output = Array.isArray(base) ? [...base] : { ...base };
    Object.keys(patch).forEach((key) => {
      const value = patch[key];
      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        base &&
        typeof base[key] === "object" &&
        !Array.isArray(base[key])
      ) {
        output[key] = mergeDeep(base[key], value);
        return;
      }
      output[key] = value;
    });
    return output;
  }

  async function get(key, fallback) {
    const data = await chrome.storage.local.get(key);
    return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : fallback;
  }

  async function set(key, value) {
    await chrome.storage.local.set({ [key]: value });
    return value;
  }

  async function remove(key) {
    await chrome.storage.local.remove(key);
  }

  async function getCredentials() {
    return get(KEYS.credentials, {
      contactNumber: "",
      password: "",
      updatedAt: null
    });
  }

  async function saveCredentials(credentials) {
    const safeCredentials = {
      contactNumber: String(credentials.contactNumber || "").trim(),
      password: String(credentials.password || ""),
      updatedAt: new Date().toISOString()
    };
    return set(KEYS.credentials, safeCredentials);
  }

  async function deleteCredentials() {
    await remove(KEYS.credentials);
  }

  async function getSettings() {
    const saved = await get(KEYS.settings, {});
    return mergeDeep(DEFAULT_SETTINGS, saved || {});
  }

  async function saveSettings(patch) {
    const current = await getSettings();
    const next = mergeDeep(current, patch || {});
    return set(KEYS.settings, next);
  }

  async function getStatus() {
    const saved = await get(KEYS.status, {});
    return mergeDeep(DEFAULT_STATUS, saved || {});
  }

  async function saveStatus(patch) {
    const current = await getStatus();
    const next = {
      ...current,
      ...(patch || {}),
      lastEventAt: new Date().toISOString()
    };
    return set(KEYS.status, next);
  }

  async function getRetryState() {
    return get(KEYS.retryState, null);
  }

  async function getScheduleState() {
    const saved = await get(KEYS.scheduleState, {});
    return mergeDeep(DEFAULT_SCHEDULE_STATE, saved || {});
  }

  async function clearRetryState() {
    await remove(KEYS.retryState);
  }

  return {
    KEYS,
    DEFAULT_SETTINGS,
    DEFAULT_STATUS,
    DEFAULT_SCHEDULE_STATE,
    get,
    set,
    remove,
    getCredentials,
    saveCredentials,
    deleteCredentials,
    getSettings,
    saveSettings,
    getStatus,
    saveStatus,
    getRetryState,
    getScheduleState,
    clearRetryState
  };
})();
