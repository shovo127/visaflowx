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
  timerStatus: "None",
  retryEndsAt: null,
  lastLoginAttempt: null,
  captchaState: "Unknown",
  otpDetected: false,
  lastError: "",
  lastEventAt: null,
  lastMessage: "Ready"
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

async function setStatus(patch) {
  const current = await getStatus();
  const next = {
    ...current,
    ...(patch || {}),
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

async function getActiveIvAcTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true,
    url: "https://appointment.ivacbd.com/*"
  });
  return tabs[0] || null;
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

async function sendToActiveIvAcTab(message, options = {}) {
  const tab = await getActiveIvAcTab();
  if (!tab || !tab.id) {
    return {
      ok: false,
      error: "Open the IVAC appointment page in the active tab."
    };
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, message);
    return {
      ok: true,
      response,
      tabId: tab.id
    };
  } catch (error) {
    if (!options.injectIfMissing) {
      return {
        ok: false,
        error: error && error.message ? error.message : "Content script is not ready."
      };
    }

    await injectContentScripts(tab.id);
    const response = await chrome.tabs.sendMessage(tab.id, message);
    return {
      ok: true,
      response,
      tabId: tab.id,
      injected: true
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
  }, { injectIfMissing: enabled });

  if (!tabResult.ok) {
    await setSettings({ automationEnabled: false });
    await setStatus({
      workflowState: VF_STATES.ERROR,
      state: VF_STATE_LABELS.ERROR,
      automationEnabled: false,
      lastError: tabResult.error,
      actionRequired: "Open the IVAC sign-in page and press Start Automation.",
      lastMessage: tabResult.error
    });
    return tabResult;
  }

  return {
    ok: true,
    settings,
    tabId: tabResult.tabId,
    injected: Boolean(tabResult.injected)
  };
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
});

chrome.runtime.onStartup.addListener(async () => {
  await resetRuntimeAutomation("Browser started. Press Start Automation when ready.");
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message && message.type) {
      case "GET_STATE": {
        sendResponse({
          settings: await getSettings(),
          status: await getStatus(),
          retryState: await storageGet(VF_KEYS.retryState, null)
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
