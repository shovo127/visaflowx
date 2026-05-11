/* global chrome, importScripts */
"use strict";

importScripts(
  "../utils/storage.js",
  "../utils/scheduler.js",
  "../utils/notifications.js",
  "../utils/parser.js",
  "../utils/timers.js"
);

const { Notifications, Scheduler, Storage } = self.VisaFlowX;

const IVAC_SIGNIN_URL = "https://appointment.ivacbd.com/signin";

const CONTENT_FILES = [
  "utils/storage.js",
  "utils/sounds.js",
  "utils/timers.js",
  "utils/parser.js",
  "utils/dom-utils.js",
  "content/notification-handler.js",
  "content/detector.js",
  "content/retry-engine.js",
  "content/otp-monitor.js",
  "content/automation.js"
];

function isIvacUrl(url = "") {
  return /^https:\/\/appointment\.ivacbd\.com\//i.test(url);
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function findIvacTab() {
  const tabs = await chrome.tabs.query({ url: "https://appointment.ivacbd.com/*" });
  return tabs[0] || null;
}

async function updateStatus(patch) {
  const current = await Storage.ensureDefaults();
  const status = await Storage.saveStatus({
    ...current.status,
    ...patch,
    updatedAt: new Date().toISOString()
  });
  await broadcast({ type: "STATUS_UPDATE", status });
  return status;
}

async function broadcast(message) {
  try {
    await chrome.runtime.sendMessage(message);
  } catch (_) {
    // Popup may be closed; storage remains the source of truth.
  }
}

async function notify(kind, title, message) {
  return Notifications.send(Storage, kind, title, message);
}

async function waitForTabReady(tabId, timeoutMs = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab?.status === "complete" && isIvacUrl(tab.url || "")) return tab;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error("Waiting for page load");
}

async function sendToContent(tabId, message, { reinject = true } = {}) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    if (!reinject) throw new Error("IVAC page not ready");
    await waitForTabReady(tabId).catch(() => null);
    await ensureContent(tabId);
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (_) {
      throw new Error("IVAC page not ready");
    }
  }
}

async function ensureContent(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab?.id || !isIvacUrl(tab.url || "")) {
    throw new Error("Open https://appointment.ivacbd.com/signin before starting VisaFlowX.");
  }

  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "PING" });
    if (response?.ready) return { injected: false, url: tab.url };
  } catch (_) {
    // Expected when content scripts are not attached yet.
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: CONTENT_FILES
  });

  const response = await chrome.tabs.sendMessage(tabId, { type: "PING" });
  if (!response?.ready) throw new Error("Content script injection failed.");
  return { injected: true, url: tab.url };
}

async function getOrOpenIvacTab() {
  const active = await getActiveTab();
  if (active?.id && isIvacUrl(active.url || "")) return active;

  const existing = await findIvacTab();
  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true, url: IVAC_SIGNIN_URL });
    if (existing.windowId) await chrome.windows.update(existing.windowId, { focused: true });
    return chrome.tabs.get(existing.id);
  }

  return chrome.tabs.create({ url: IVAC_SIGNIN_URL, active: true });
}

async function startAutomation({ source = "manual" } = {}) {
  const state = await Storage.ensureDefaults();
  const tab = await getOrOpenIvacTab();

  await updateStatus({
    state: "RUNNING",
    activeTabId: tab.id,
    page: tab.url || IVAC_SIGNIN_URL,
    lastAction: source === "schedule" ? "Scheduled run started" : "Automation starting",
    lastError: ""
  });

  const launch = async () => {
    const injection = await ensureContent(tab.id);
    await sendToContent(tab.id, {
      type: "START_AUTOMATION",
      credentials: state.credentials,
      retry: state.retry,
      settings: state.settings,
      source
    });
    await updateStatus({
      state: "RUNNING",
      activeTabId: tab.id,
      page: injection.url,
      schedulerState: source === "schedule" ? "Started" : state.schedule.enabled ? "Scheduled" : "Not scheduled",
      lastAction: source === "schedule" ? "Scheduled automation started" : "Automation started",
      lastError: ""
    });
    if (source === "schedule") {
      await notify("schedule", "VisaFlowX scheduled run", "Scheduled IVAC workflow has started.");
    }
    return { ok: true, tabId: tab.id, injection };
  };

  if (tab.status === "loading") {
    await waitForTabReady(tab.id).catch(() => null);
  }
  return launch();
}

async function stopAutomation({ reason = "manual" } = {}) {
  const state = await Storage.ensureDefaults();
  const tabId = state.status.activeTabId;
  if (tabId) {
    await sendToContent(tabId, { type: "STOP_AUTOMATION", reason }, { reinject: false }).catch(() => {});
  }
  const status = await updateStatus({
    state: "IDLE",
    retryCountdownEndsAt: null,
    verificationState: "Idle",
    otpState: "Idle",
    lastAction: `Automation stopped (${reason})`,
    lastError: ""
  });
  await notify("stopped", "VisaFlowX stopped", `Automation stopped (${reason}).`);
  return { ok: true, status };
}

async function saveSchedule(schedule) {
  const when = Scheduler.parseLocalRun(schedule.date, schedule.time);
  const value = await Storage.saveSchedule({
    enabled: true,
    date: schedule.date,
    time: schedule.time,
    nextRunAt: when
  });
  await chrome.alarms.create(Scheduler.alarmName(), { when });
  await updateStatus({
    state: "SCHEDULED",
    schedulerState: Scheduler.preview(value),
    lastAction: "Scheduled automation saved",
    lastError: ""
  });
  return { ok: true, schedule: value };
}

async function clearSchedule() {
  await chrome.alarms.clear(Scheduler.alarmName());
  const schedule = await Storage.saveSchedule({ enabled: false, date: "", time: "", nextRunAt: null });
  await updateStatus({
    state: "IDLE",
    schedulerState: "Not scheduled",
    lastAction: "Schedule cleared"
  });
  return { ok: true, schedule };
}

async function handleStatusUpdate(message, sender) {
  const incoming = message.status || {};
  const status = await updateStatus({
    ...incoming,
    activeTabId: sender.tab?.id || incoming.activeTabId || null,
    page: incoming.page || sender.tab?.url || ""
  });

  if (message.notify === "verification") {
    await notify("verification", "Verification required", "Complete the IVAC verification manually. VisaFlowX will continue afterward.");
  } else if (message.notify === "retry") {
    await notify("retry", "Retry countdown started", incoming.lastAction || "VisaFlowX will retry automatically.");
  } else if (message.notify === "otp") {
    await notify("otp", "OTP detected", "Automation stopped. Enter the OTP manually.");
  }

  return { ok: true, status };
}

async function handleOtpDetected(message, sender) {
  if (sender.tab?.id) {
    await chrome.tabs.update(sender.tab.id, { active: true }).catch(() => {});
    if (sender.tab.windowId) await chrome.windows.update(sender.tab.windowId, { focused: true }).catch(() => {});
  }
  const status = await updateStatus({
    state: "OTP_DETECTED",
    activeTabId: sender.tab?.id || null,
    page: sender.tab?.url || message.url || "",
    retryCountdownEndsAt: null,
    verificationState: "Completed",
    otpState: "Detected",
    lastAction: "OTP detected. Automation stopped for manual entry.",
    lastError: ""
  });
  await notify("otp", "OTP detected", "VisaFlowX stopped automation and focused the OTP field.");
  return { ok: true, status };
}

async function handleMessage(message, sender = {}) {
  switch (message?.type) {
    case "GET_STATE":
      return { ok: true, ...(await Storage.ensureDefaults()), activeTab: await getActiveTab().catch(() => null) };
    case "SAVE_CREDENTIALS": {
      const credentials = await Storage.saveCredentials(message.credentials || {});
      await updateStatus({ lastAction: "Credentials saved", lastError: "" });
      return { ok: true, credentials: { contactNumber: credentials.contactNumber, hasPassword: Boolean(credentials.password) } };
    }
    case "CLEAR_CREDENTIALS": {
      await Storage.clearCredentials();
      await updateStatus({ lastAction: "Credentials cleared", lastError: "" });
      return { ok: true };
    }
    case "SAVE_RETRY":
      return { ok: true, retry: await Storage.saveRetry(message.retry || {}) };
    case "SAVE_SETTINGS":
      return { ok: true, settings: await Storage.saveSettings(message.settings || {}) };
    case "SAVE_SCHEDULE":
      return saveSchedule(message.schedule || {});
    case "CLEAR_SCHEDULE":
      return clearSchedule();
    case "START_AUTOMATION":
      return startAutomation({ source: message.source || "manual" });
    case "STOP_AUTOMATION":
      return stopAutomation({ reason: message.reason || "manual" });
    case "STATUS_UPDATE":
      return handleStatusUpdate(message, sender);
    case "OTP_DETECTED":
      return handleOtpDetected(message, sender);
    case "TEST_NOTIFICATION":
      await notify("test", "VisaFlowX", "Notifications are working.");
      return { ok: true };
    case "TEST_ALARM":
    case "STOP_ALARM":
    case "MUTE_ALARM":
    case "SET_ALARM_VOLUME": {
      const state = await Storage.ensureDefaults();
      const tabId = state.status.activeTabId || (await getActiveTab())?.id;
      if (!tabId) throw new Error("Open the IVAC page to test the alarm.");
      await ensureContent(tabId);
      await sendToContent(tabId, message);
      return { ok: true };
    }
    default:
      throw new Error(`Unknown message: ${message?.type || "empty"}`);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  Storage.ensureDefaults()
    .then((state) => {
      if (state.schedule.enabled && state.schedule.nextRunAt) {
        return chrome.alarms.create(Scheduler.alarmName(), { when: state.schedule.nextRunAt });
      }
      return null;
    })
    .catch(console.error);
});

chrome.runtime.onStartup.addListener(() => {
  Storage.ensureDefaults()
    .then((state) => {
      if (state.schedule.enabled && state.schedule.nextRunAt && state.schedule.nextRunAt > Date.now()) {
        return chrome.alarms.create(Scheduler.alarmName(), { when: state.schedule.nextRunAt });
      }
      return null;
    })
    .catch(console.error);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage.call(null, message, sender)
    .then((response) => sendResponse(response))
    .catch(async (error) => {
      await updateStatus({
        state: "ERROR",
        lastAction: "Error",
        lastError: error.message
      }).catch(() => {});
      await notify("error", "VisaFlowX error", error.message).catch(() => {});
      sendResponse({ ok: false, error: error.message });
    });
  return true;
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "toggle-automation") return;
  Storage.ensureDefaults()
    .then((state) => (state.status.state === "IDLE" || state.status.state === "SCHEDULED"
      ? startAutomation({ source: "hotkey" })
      : stopAutomation({ reason: "hotkey" })))
    .catch((error) => {
      updateStatus({ state: "ERROR", lastAction: "Hotkey failed", lastError: error.message });
    });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== Scheduler.alarmName()) return;
  Storage.saveSchedule({ enabled: false, date: "", time: "", nextRunAt: null }).catch(() => {});
  startAutomation({ source: "schedule" }).catch((error) => {
    updateStatus({ state: "ERROR", schedulerState: "Failed", lastAction: "Scheduled run failed", lastError: error.message });
    notify("error", "Scheduled run failed", error.message);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !isIvacUrl(tab.url || "")) return;
  Storage.ensureDefaults().then((state) => {
    if (state.status.activeTabId !== tabId) return;
    if (!["RUNNING", "RETRYING", "WAITING_VERIFICATION"].includes(state.status.state)) return;
    setTimeout(() => {
      startAutomation({ source: "resume" }).catch((error) => {
        updateStatus({ state: "ERROR", lastAction: "Resume failed", lastError: error.message });
      });
    }, 600);
  }).catch(() => {});
});

chrome.tabs.onRemoved.addListener((tabId) => {
  Storage.ensureDefaults().then((state) => {
    if (state.status.activeTabId === tabId && !["IDLE", "COMPLETED", "OTP_DETECTED"].includes(state.status.state)) {
      updateStatus({
        state: "IDLE",
        activeTabId: null,
        lastAction: "Automation stopped because the tab was closed",
        lastError: ""
      });
    }
  }).catch(() => {});
});
