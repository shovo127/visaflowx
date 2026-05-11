"use strict";

importScripts("../utils/constants.js");

const VF_CONSTANTS = self.VisaFlowXConstants;
const VF_STATES = VF_CONSTANTS.WORKFLOW_STATES;
const VF_STATE_LABELS = VF_CONSTANTS.STATE_LABELS;

const VF_KEYS = {
  credentials: "visaflowx.credentials",
  settings: "visaflowx.settings",
  status: "visaflowx.status",
  retryState: "visaflowx.retryState",
  scheduleState: "visaflowx.scheduleState",
  notificationState: "visaflowx.notificationState"
};

const IVAC_SIGNIN_URL = "https://appointment.ivacbd.com/signin";
const SCHEDULE_ALARM_NAME = "visaflowx-scheduled-start";

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

async function storageGet(key, fallback) {
  const data = await chrome.storage.local.get(key);
  return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : fallback;
}

async function storageSet(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

async function getSettings() {
  const saved = await storageGet(VF_KEYS.settings, {});
  return mergeDeep(DEFAULT_SETTINGS, saved || {});
}

async function setSettings(patch) {
  const current = await getSettings();
  const next = mergeDeep(current, patch || {});
  await storageSet(VF_KEYS.settings, next);
  return next;
}

async function getStatus() {
  const saved = await storageGet(VF_KEYS.status, {});
  return mergeDeep(DEFAULT_STATUS, saved || {});
}

async function getScheduleState() {
  const saved = await storageGet(VF_KEYS.scheduleState, {});
  return mergeDeep(DEFAULT_SCHEDULE_STATE, saved || {});
}

async function setScheduleState(patch) {
  const current = await getScheduleState();
  const next = {
    ...current,
    ...(patch || {})
  };
  await storageSet(VF_KEYS.scheduleState, next);
  return next;
}

async function setStatus(patch) {
  const current = await getStatus();
  const debug = patch && patch.debug ? mergeDeep(current.debug || DEFAULT_STATUS.debug, patch.debug) : current.debug;
  const next = {
    ...current,
    ...(patch || {}),
    debug,
    lastEventAt: new Date().toISOString()
  };
  await storageSet(VF_KEYS.status, next);
  return next;
}

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

function retryAlarmName(tabId) {
  return `visaflowx-retry-${tabId}`;
}

function formatScheduleTime(timestamp) {
  if (!timestamp) {
    return "No schedule set";
  }
  return new Date(timestamp).toLocaleString();
}

async function notify(notificationId, title, message) {
  await chrome.notifications.create(notificationId || `visaflowx-${Date.now()}`, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("assets/icons/icon-128.png"),
    title,
    message,
    priority: 2
  });
}

function hasCredentials(credentials) {
  return Boolean(
    credentials &&
      String(credentials.contactNumber || "").trim() &&
      String(credentials.password || "")
  );
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });
  return tabs[0] || null;
}

function isIvAcSigninUrl(url) {
  return /https:\/\/appointment\.ivacbd\.com\/signin(?:[/?#]|$)/i.test(String(url || ""));
}

function isIvAcUrl(url) {
  return /^https:\/\/appointment\.ivacbd\.com\//i.test(String(url || ""));
}

async function ensureOffscreenDocument() {
  if (!chrome.offscreen) {
    return false;
  }

  const url = chrome.runtime.getURL("background/offscreen.html");
  const contexts = chrome.runtime.getContexts
    ? await chrome.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"],
        documentUrls: [url]
      })
    : [];

  if (contexts.length > 0) {
    return true;
  }

  await chrome.offscreen.createDocument({
    url: "background/offscreen.html",
    reasons: ["AUDIO_PLAYBACK"],
    justification: "Play a looping OTP alarm until the user manually stops it."
  });
  return true;
}

async function playAlarm(options = {}) {
  const settings = await getSettings();
  const sound = {
    ...settings.sound,
    ...(options.sound || {})
  };
  const ready = await ensureOffscreenDocument();
  if (!ready) {
    return;
  }
  await chrome.runtime.sendMessage({
    type: "OFFSCREEN_PLAY_ALARM",
    sound
  });
}

async function stopAlarm() {
  await chrome.runtime.sendMessage({ type: "OFFSCREEN_STOP_ALARM" }).catch(() => {});
}

async function updateAlarmSound(sound) {
  const settings = await setSettings({ sound });
  await chrome.runtime
    .sendMessage({
      type: "OFFSCREEN_UPDATE_SOUND",
      sound: settings.sound
    })
    .catch(() => {});
  return settings.sound;
}

const CONTENT_SCRIPT_FILES = [
  "utils/constants.js",
  "utils/logger.js",
  "utils/storage.js",
  "utils/timers.js",
  "utils/dom-utils.js",
  "utils/parser.js",
  "content/notification-handler.js",
  "content/detector.js",
  "content/autofill.js",
  "content/retry-engine.js",
  "content/otp-monitor.js",
  "content/automation.js"
];

async function injectContentScripts(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: CONTENT_SCRIPT_FILES
  });
}

async function waitForTabReady(tabId, timeoutMs = 20000) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab && tab.status === "complete") {
    return tab;
  }

  return new Promise((resolve) => {
    let finished = false;
    const timeout = setTimeout(async () => {
      if (finished) {
        return;
      }
      finished = true;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(await chrome.tabs.get(tabId).catch(() => null));
    }, timeoutMs);

    function listener(updatedTabId, changeInfo, updatedTab) {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") {
        return;
      }
      finished = true;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(updatedTab);
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function focusOrOpenSigninTab() {
  const tabs = await chrome.tabs.query({ url: "https://appointment.ivacbd.com/*" });
  let tab = tabs.find((candidate) => isIvAcSigninUrl(candidate.url)) || null;

  if (!tab) {
    tab = await chrome.tabs.create({
      url: IVAC_SIGNIN_URL,
      active: true
    });
  } else {
    await chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId != null) {
      await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
    }
  }

  await waitForTabReady(tab.id);
  return chrome.tabs.get(tab.id);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function pingContentScript(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "PING_CONTENT" });
    return response && response.ok ? response : null;
  } catch (error) {
    return null;
  }
}

async function ensureContentScripts(tabId, activeTabUrl) {
  const initialPing = await pingContentScript(tabId);
  if (initialPing) {
    await setStatus({
      debug: {
        activeTabUrl,
        injectionSuccess: true,
        detectorState: initialPing.page || "Unknown",
        workflowState: initialPing.workflowState || "IDLE",
        contentScriptStatus: "Already attached",
        lastRuntimeMessage: "PING_CONTENT"
      }
    });
    return {
      ok: true,
      injected: false,
      ping: initialPing
    };
  }

  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await injectContentScripts(tabId);
      await sleep(150 * attempt);
      const ping = await pingContentScript(tabId);
      if (ping) {
        await setStatus({
          debug: {
            activeTabUrl,
            injectionSuccess: true,
            detectorState: ping.page || "Unknown",
            workflowState: ping.workflowState || "IDLE",
            contentScriptStatus: `Injected successfully on attempt ${attempt}`,
            lastRuntimeMessage: "PING_CONTENT"
          }
        });
        return {
          ok: true,
          injected: true,
          attempt,
          ping
        };
      }
      lastError = `Content script ping failed after injection attempt ${attempt}.`;
    } catch (error) {
      lastError = error && error.message ? error.message : "Content script injection failed.";
    }
  }

  await setStatus({
    debug: {
      activeTabUrl,
      injectionSuccess: false,
      contentScriptStatus: "Injection failed",
      lastRuntimeMessage: "PING_CONTENT",
      lastError
    }
  });
  return {
    ok: false,
    error: lastError || "Content script did not respond after injection."
  };
}

async function sendToActiveIvAcTab(message, options = {}) {
  const tab = await getActiveTab();
  if (!tab || !tab.id) {
    return {
      ok: false,
      error: "Open the IVAC appointment page in the active tab."
    };
  }

  const activeTabUrl = tab.url || "";
  await setStatus({
    debug: {
      activeTabUrl,
      lastRuntimeMessage: message.type || "UNKNOWN"
    }
  });

  if (options.requireSignin && !isIvAcSigninUrl(activeTabUrl)) {
    const error = "Open https://appointment.ivacbd.com/signin in the active tab.";
    return {
      ok: false,
      error,
      tabId: tab.id,
      activeTabUrl
    };
  }

  if (!isIvAcUrl(activeTabUrl)) {
    const error = "The active tab is not an IVAC appointment page.";
    return {
      ok: false,
      error,
      tabId: tab.id,
      activeTabUrl
    };
  }

  const ready = options.injectIfMissing
    ? await ensureContentScripts(tab.id, activeTabUrl)
    : { ok: Boolean(await pingContentScript(tab.id)) };

  if (!ready.ok) {
    return {
      tabId: tab.id,
      activeTabUrl,
      ok: false,
      error: ready.error || "Content script is not ready."
    };
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, message);
    await setStatus({
      debug: {
        activeTabUrl,
        injectionSuccess: true,
        detectorState: response && response.page ? response.page : undefined,
        workflowState: response && response.workflowState ? response.workflowState : undefined,
        contentScriptStatus: "Message delivered",
        lastRuntimeMessage: message.type || "UNKNOWN",
        lastError: ""
      }
    });
    return {
      ok: true,
      response,
      tabId: tab.id,
      activeTabUrl,
      injected: Boolean(ready.injected)
    };
  } catch (error) {
    const messageText = error && error.message ? error.message : "Content script message failed.";
    await setStatus({
      debug: {
        activeTabUrl,
        contentScriptStatus: "Message failed",
        lastRuntimeMessage: message.type || "UNKNOWN",
        lastError: messageText
      }
    });
    return {
      ok: false,
      error: messageText,
      tabId: tab.id,
      activeTabUrl
    };
  }
}

async function setAutomation(enabled) {
  if (enabled) {
    const credentials = await storageGet(VF_KEYS.credentials, null);
    if (!hasCredentials(credentials)) {
      await setStatus({
        workflowState: VF_STATES.ERROR,
        state: VF_STATE_LABELS.ERROR,
        automationEnabled: false,
        lastError: "Save contact number and password first.",
        actionRequired: "Save credentials, then press Start Automation again.",
        lastMessage: "Credentials are required before automation can start."
      });
      return {
        ok: false,
        error: "Save contact number and password first."
      };
    }
  }

  const settings = await setSettings({ automationEnabled: enabled });
  await setStatus({
    automationEnabled: enabled,
    activeAutomationTabId: enabled ? null : null,
    workflowState: VF_STATES.IDLE,
    state: VF_STATE_LABELS.IDLE,
    actionRequired: enabled
      ? "Keep the IVAC tab open. VisaFlowX is starting observers."
      : "Press Start Automation when ready.",
    lastError: "",
    lastMessage: enabled ? "Automation enabled" : "Automation stopped"
  });

  if (!enabled) {
    await sendToActiveIvAcTab({
      type: "STOP_AUTOMATION",
      settings
    }).catch(() => null);
    return {
      ok: true,
      settings
    };
  }

  const tabResult = await sendToActiveIvAcTab({
    type: "START_AUTOMATION",
    settings
  }, { injectIfMissing: enabled, requireSignin: true });

  if (!tabResult.ok) {
    await setSettings({ automationEnabled: false });
    await setStatus({
      workflowState: VF_STATES.ERROR,
      state: VF_STATE_LABELS.ERROR,
      automationEnabled: false,
      lastError: tabResult.error,
      actionRequired: "Open the IVAC sign-in page and press Start Automation.",
      lastMessage: tabResult.error,
      debug: {
        activeTabUrl: tabResult.activeTabUrl || "",
        contentScriptStatus: "Start failed",
        lastRuntimeMessage: "START_AUTOMATION",
        lastError: tabResult.error
      }
    });
    return tabResult;
  }

  await setStatus({
    automationEnabled: true,
    activeAutomationTabId: tabResult.tabId,
    scheduleEnabled: false,
    scheduledAt: null,
    lastMessage: "Automation running"
  });

  return {
    ok: true,
    settings,
    tabId: tabResult.tabId,
    activeTabUrl: tabResult.activeTabUrl,
    injected: Boolean(tabResult.injected)
  };
}

async function startAutomationFromSchedule() {
  const schedule = await getScheduleState();
  await setScheduleState({
    enabled: false,
    scheduledAt: null,
    lastStartedAt: Date.now(),
    lastError: ""
  });

  await setStatus({
    workflowState: VF_STATES.SCHEDULED,
    state: VF_STATE_LABELS.SCHEDULED,
    scheduleEnabled: false,
    scheduledAt: null,
    actionRequired: "Scheduled run started. Opening IVAC sign-in page.",
    lastMessage: "Scheduled run started"
  });

  await notify(
    "visaflowx-scheduled-started",
    "VisaFlowX Scheduled Run Started",
    "Opening the IVAC sign-in workflow now."
  );

  try {
    const tab = await focusOrOpenSigninTab();
    await setStatus({
      debug: {
        activeTabUrl: tab && tab.url ? tab.url : IVAC_SIGNIN_URL,
        lastRuntimeMessage: "SCHEDULE_RUN"
      }
    });
    const result = await setAutomation(true);
    if (!result.ok) {
      await setScheduleState({
        ...schedule,
        enabled: false,
        scheduledAt: null,
        lastStartedAt: Date.now(),
        lastError: result.error || "Scheduled start failed."
      });
      await notify("visaflowx-schedule-error", "Scheduled Run Error", result.error || "Scheduled start failed.");
    }
    return result;
  } catch (error) {
    const message = error && error.message ? error.message : "Scheduled start failed.";
    await setScheduleState({
      enabled: false,
      scheduledAt: null,
      lastStartedAt: Date.now(),
      lastError: message
    });
    await setStatus({
      workflowState: VF_STATES.ERROR,
      state: VF_STATE_LABELS.ERROR,
      lastError: message,
      actionRequired: "Open the IVAC sign-in page and start manually.",
      lastMessage: message
    });
    await notify("visaflowx-schedule-error", "Scheduled Run Error", message);
    return {
      ok: false,
      error: message
    };
  }
}

async function scheduleRun(scheduledAt) {
  const when = Number(scheduledAt);
  const credentials = await storageGet(VF_KEYS.credentials, null);
  if (!hasCredentials(credentials)) {
    const error = "Save contact number and password before scheduling.";
    await setStatus({
      workflowState: VF_STATES.ERROR,
      state: VF_STATE_LABELS.ERROR,
      lastError: error,
      actionRequired: "Save credentials, then schedule the run.",
      lastMessage: error
    });
    return { ok: false, error };
  }

  if (!Number.isFinite(when) || when <= Date.now() + 15000) {
    const error = "Choose a future date and time at least 15 seconds from now.";
    await setStatus({
      workflowState: VF_STATES.ERROR,
      state: VF_STATE_LABELS.ERROR,
      lastError: error,
      actionRequired: "Choose a valid future schedule time.",
      lastMessage: error
    });
    return { ok: false, error };
  }

  await chrome.alarms.clear(SCHEDULE_ALARM_NAME);
  await chrome.alarms.create(SCHEDULE_ALARM_NAME, { when });
  const scheduleState = await setScheduleState({
    enabled: true,
    scheduledAt: when,
    createdAt: Date.now(),
    lastError: ""
  });
  await setStatus({
    workflowState: VF_STATES.SCHEDULED,
    state: VF_STATE_LABELS.SCHEDULED,
    scheduleEnabled: true,
    scheduledAt: when,
    actionRequired: "No action required. VisaFlowX will start at the scheduled time.",
    lastError: "",
    lastMessage: `Scheduled run set for ${formatScheduleTime(when)}`
  });
  await notify(
    "visaflowx-schedule-set",
    "VisaFlowX Scheduled",
    `Scheduled run set for ${formatScheduleTime(when)}`
  );
  return {
    ok: true,
    scheduleState
  };
}

async function clearSchedule() {
  await chrome.alarms.clear(SCHEDULE_ALARM_NAME);
  const scheduleState = await setScheduleState({
    enabled: false,
    scheduledAt: null,
    lastClearedAt: Date.now(),
    lastError: ""
  });
  const status = await getStatus();
  await setStatus({
    workflowState: status.automationEnabled ? status.workflowState : VF_STATES.IDLE,
    state: status.automationEnabled ? status.state : VF_STATE_LABELS.IDLE,
    scheduleEnabled: false,
    scheduledAt: null,
    actionRequired: status.automationEnabled
      ? status.actionRequired
      : "Schedule cleared. Press Start Automation or schedule a new run.",
    lastMessage: "Schedule cleared"
  });
  return {
    ok: true,
    scheduleState
  };
}

async function restoreScheduleAlarm() {
  const scheduleState = await getScheduleState();
  if (!scheduleState.enabled || !scheduleState.scheduledAt) {
    return;
  }

  if (scheduleState.scheduledAt <= Date.now()) {
    await clearSchedule();
    return;
  }

  await chrome.alarms.create(SCHEDULE_ALARM_NAME, { when: scheduleState.scheduledAt });
  await setStatus({
    workflowState: VF_STATES.SCHEDULED,
    state: VF_STATE_LABELS.SCHEDULED,
    scheduleEnabled: true,
    scheduledAt: scheduleState.scheduledAt,
    actionRequired: "No action required. VisaFlowX will start at the scheduled time.",
    lastMessage: `Scheduled run restored for ${formatScheduleTime(scheduleState.scheduledAt)}`
  });
}

async function sendCommandToIvAcTab(message) {
  const tabResult = await sendToActiveIvAcTab(message, { injectIfMissing: true });
  if (!tabResult.ok) {
    await setStatus({
      workflowState: VF_STATES.ERROR,
      state: VF_STATE_LABELS.ERROR,
      lastError: tabResult.error,
      actionRequired: "Open the IVAC sign-in page and try again.",
      lastMessage: tabResult.error
    });
    return tabResult;
  }
  return tabResult;
}

async function resetRuntimeAutomation(reason) {
  const settings = await setSettings({ automationEnabled: false });
  await setStatus({
    workflowState: VF_STATES.IDLE,
    state: VF_STATE_LABELS.IDLE,
    automationEnabled: false,
    timerStatus: "None",
    retryEndsAt: null,
    actionRequired: "Press Start Automation when ready.",
    lastMessage: reason || "Automation is idle."
  });
  return settings;
}

async function scheduleRetry(tabId, seconds, reason) {
  if (!tabId || !seconds || seconds < 1) {
    return;
  }

  const when = Date.now() + seconds * 1000;
  const alarmName = retryAlarmName(tabId);
  await chrome.alarms.clear(alarmName);
  await chrome.alarms.create(alarmName, { when });

  const retryState = {
    tabId,
    alarmName,
    retryEndsAt: when,
    seconds,
    reason: reason || "Cooldown detected"
  };
  await storageSet(VF_KEYS.retryState, retryState);
  await setStatus({
    workflowState: VF_STATES.RETRY_WAIT,
    state: VF_STATE_LABELS.RETRY_WAIT,
    timerStatus: "Running",
    retryEndsAt: when,
    actionRequired: "No action required. VisaFlowX will retry automatically.",
    lastMessage: retryState.reason
  });
}

async function cancelRetry(tabId) {
  if (tabId) {
    await chrome.alarms.clear(retryAlarmName(tabId));
  } else {
    const retryState = await storageGet(VF_KEYS.retryState, null);
    if (retryState && retryState.alarmName) {
      await chrome.alarms.clear(retryState.alarmName);
    }
  }

  await chrome.storage.local.remove(VF_KEYS.retryState);
  await setStatus({
    timerStatus: "None",
    retryEndsAt: null,
    actionRequired: "Retry timer reset.",
    lastMessage: "Retry timer reset"
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  await storageSet(VF_KEYS.settings, { ...settings, automationEnabled: false });
  await setStatus({
    ...DEFAULT_STATUS,
    lastMessage: "VisaFlowX installed. Press Start Automation when ready."
  });
  await restoreScheduleAlarm();
});

chrome.runtime.onStartup.addListener(async () => {
  await resetRuntimeAutomation("Browser started. Press Start Automation when ready.");
  await restoreScheduleAlarm();
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-automation") {
    return;
  }
  const settings = await getSettings();
  const nextEnabled = !settings.automationEnabled;
  await setAutomation(nextEnabled);
  await notify(
    "visaflowx-hotkey-toggle",
    "VisaFlowX",
    nextEnabled ? "Automation started" : "Automation stopped"
  );
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === SCHEDULE_ALARM_NAME) {
    await startAutomationFromSchedule();
    return;
  }

  if (!alarm.name.startsWith("visaflowx-retry-")) {
    return;
  }

  const tabId = Number(alarm.name.replace("visaflowx-retry-", ""));
  await chrome.storage.local.remove(VF_KEYS.retryState);
  await setStatus({
    workflowState: VF_STATES.IDLE,
    state: VF_STATE_LABELS.IDLE,
    timerStatus: "Retry ready",
    retryEndsAt: null,
    actionRequired: "No action required. VisaFlowX is retrying now.",
    lastMessage: "Retry countdown finished"
  });

  if (tabId) {
    await chrome.tabs.sendMessage(tabId, { type: "RETRY_ALARM_FIRED" }).catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const status = await getStatus();
  if (!status.automationEnabled || status.activeAutomationTabId !== tabId) {
    return;
  }

  await setSettings({ automationEnabled: false });
  await setStatus({
    workflowState: VF_STATES.IDLE,
    state: VF_STATE_LABELS.IDLE,
    automationEnabled: false,
    activeAutomationTabId: null,
    actionRequired: "Automation stopped because the IVAC tab was closed.",
    lastMessage: "Automation Stopped",
    lastError: ""
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message && message.type) {
      case "GET_STATE": {
        const activeTab = await getActiveTab();
        const status = await getStatus();
        sendResponse({
          settings: await getSettings(),
          status: {
            ...status,
            debug: {
              ...(status.debug || DEFAULT_STATUS.debug),
              activeTabUrl: activeTab && activeTab.url ? activeTab.url : ""
            }
          },
          retryState: await storageGet(VF_KEYS.retryState, null),
          scheduleState: await getScheduleState()
        });
        break;
      }

      case "SAVE_SETTINGS": {
        const settings = await setSettings(message.settings || {});
        sendResponse({ ok: true, settings });
        break;
      }

      case "START_AUTOMATION": {
        const result = await setAutomation(true);
        sendResponse(result);
        break;
      }

      case "SCHEDULE_RUN": {
        const result = await scheduleRun(message.scheduledAt);
        sendResponse(result);
        break;
      }

      case "CLEAR_SCHEDULE": {
        const result = await clearSchedule();
        sendResponse(result);
        break;
      }

      case "STOP_AUTOMATION": {
        const result = await setAutomation(false);
        sendResponse(result.ok === false ? result : { ok: true, settings: result.settings });
        break;
      }

      case "TEST_DETECTION":
      case "TEST_AUTOFILL": {
        const result = await sendCommandToIvAcTab(message);
        sendResponse(result.ok ? { ok: true, response: result.response } : result);
        break;
      }

      case "STATUS_UPDATE": {
        const status = await setStatus(message.status || {});
        sendResponse({ ok: true, status });
        break;
      }

      case "CONTENT_READY": {
        const senderUrl = sender && sender.tab && sender.tab.url ? sender.tab.url : "";
        const status = await setStatus({
          currentPage: message.page || "UNKNOWN_PAGE",
          workflowState: message.workflowState || VF_STATES.IDLE,
          state: VF_STATE_LABELS[message.workflowState] || VF_STATE_LABELS.IDLE,
          debug: {
            activeTabUrl: senderUrl,
            injectionSuccess: true,
            detectorState: message.page || "UNKNOWN_PAGE",
            workflowState: message.workflowState || VF_STATES.IDLE,
            contentScriptStatus: "Ready",
            lastRuntimeMessage: "CONTENT_READY",
            lastError: ""
          },
          lastMessage: "Content script ready"
        });
        sendResponse({ ok: true, status });
        break;
      }

      case "SHOW_NOTIFICATION": {
        await notify(message.id, message.title || "VisaFlowX", message.message || "");
        sendResponse({ ok: true });
        break;
      }

      case "PLAY_ALARM": {
        await playAlarm({ sound: message.sound });
        await storageSet(VF_KEYS.notificationState, {
          alarmPlaying: true,
          updatedAt: Date.now()
        });
        sendResponse({ ok: true });
        break;
      }

      case "STOP_ALARM": {
        await stopAlarm();
        await storageSet(VF_KEYS.notificationState, {
          alarmPlaying: false,
          updatedAt: Date.now()
        });
        sendResponse({ ok: true });
        break;
      }

      case "UPDATE_SOUND": {
        const sound = await updateAlarmSound(message.sound || {});
        sendResponse({ ok: true, sound });
        break;
      }

      case "TEST_ALARM": {
        await playAlarm({ sound: message.sound });
        setTimeout(() => {
          stopAlarm();
        }, 2500);
        sendResponse({ ok: true });
        break;
      }

      case "TEST_NOTIFICATIONS": {
        await notify(
          "visaflowx-test-notification",
          "VisaFlowX Test Notification",
          "Notifications are working."
        );
        sendResponse({ ok: true });
        break;
      }

      case "SCHEDULE_RETRY": {
        const tabId = sender && sender.tab && sender.tab.id;
        await scheduleRetry(tabId, Number(message.seconds), message.reason);
        if (message.notify !== false) {
          await notify(
            "visaflowx-retry",
            "VisaFlowX Retry Started",
            message.reason || "Retry countdown started"
          );
        }
        sendResponse({ ok: true });
        break;
      }

      case "CANCEL_RETRY": {
        const tabId = sender && sender.tab && sender.tab.id;
        await cancelRetry(tabId);
        sendResponse({ ok: true });
        break;
      }

      default:
        sendResponse({ ok: false, error: "Unknown message type" });
    }
  })().catch((error) => {
    sendResponse({
      ok: false,
      error: error && error.message ? error.message : "Unknown error"
    });
  });
  return true;
});
