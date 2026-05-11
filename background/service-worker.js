/* global chrome, importScripts */
"use strict";

importScripts(
  "../utils/constants.js",
  "../utils/logger.js",
  "../utils/timers.js",
  "../utils/parser.js",
  "../utils/storage.js"
);

const { Constants, Logger, Parser, Storage } = self.VisaFlowXUniversal;
const { MESSAGE, STATE, STORAGE_KEYS } = Constants;

const CONTENT_FILES = [
  "utils/constants.js",
  "utils/logger.js",
  "utils/timers.js",
  "utils/dom-utils.js",
  "utils/parser.js",
  "rules/rule-engine.js",
  "rules/action-runner.js",
  "content/otp-detector.js",
  "content/notification-handler.js",
  "content/overlay-selector.js",
  "content/monitor.js",
  "content/bootstrap.js"
];

function chromeCallback(fn) {
  return new Promise((resolve, reject) => {
    fn((result) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(result);
    });
  });
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

function isInjectableUrl(url = "") {
  return /^https?:\/\//i.test(url) || /^file:\/\//i.test(url);
}

async function getAppState() {
  const defaults = await Storage.ensureDefaults();
  const current = await Storage.get({
    [STORAGE_KEYS.PROFILES]: defaults.profiles,
    [STORAGE_KEYS.ACTIVE_PROFILE_ID]: defaults.activeProfileId,
    [STORAGE_KEYS.SETTINGS]: defaults.settings,
    [STORAGE_KEYS.STATUS]: defaults.status,
    [STORAGE_KEYS.LOGS]: defaults.logs,
    [STORAGE_KEYS.SCHEDULES]: defaults.schedules
  });

  const profiles = current[STORAGE_KEYS.PROFILES] || [];
  const activeProfileId = current[STORAGE_KEYS.ACTIVE_PROFILE_ID] || profiles[0]?.id || "";
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) || profiles[0] || null;

  return {
    profiles,
    activeProfileId,
    activeProfile,
    settings: current[STORAGE_KEYS.SETTINGS] || {},
    status: current[STORAGE_KEYS.STATUS] || {},
    logs: current[STORAGE_KEYS.LOGS] || [],
    schedules: current[STORAGE_KEYS.SCHEDULES] || []
  };
}

async function appendLog(log) {
  const state = await getAppState();
  const logs = [log, ...state.logs].slice(0, state.settings.maxLogs || 80);
  await Storage.set({ [STORAGE_KEYS.LOGS]: logs });
  await broadcast({ type: MESSAGE.LOG_EVENT, log });
}

async function log(level, event, details = {}) {
  const entry = Logger.create(level, event, details);
  await appendLog(entry);
  return entry;
}

async function updateStatus(patch) {
  const state = await getAppState();
  const status = {
    ...state.status,
    ...patch,
    updatedAt: new Date().toISOString()
  };
  await Storage.set({ [STORAGE_KEYS.STATUS]: status });
  await broadcast({ type: MESSAGE.STATUS_UPDATE, status });
  return status;
}

async function broadcast(message) {
  try {
    await chrome.runtime.sendMessage(message);
  } catch (_) {
    // Popup may be closed; storage still holds the source of truth.
  }
}

async function notify(title, message) {
  const state = await getAppState();
  if (!state.settings.notifications) return;
  await chrome.notifications.create({
    type: "basic",
    iconUrl: "assets/icons/icon128.png",
    title,
    message
  });
}

async function ensureContent(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab || !isInjectableUrl(tab.url || "")) {
    throw new Error("Active tab is not a supported web page.");
  }

  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: MESSAGE.PING });
    if (response?.ready) {
      return { injected: false, ready: true, url: tab.url };
    }
  } catch (_) {
    // Expected when the content script has not been attached yet.
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: CONTENT_FILES
  });

  const response = await chrome.tabs.sendMessage(tabId, { type: MESSAGE.PING });
  if (!response?.ready) {
    throw new Error("Content script injection completed but the page did not respond.");
  }
  return { injected: true, ready: true, url: tab.url };
}

function findProfileForUrl(profiles, url) {
  return profiles.find((profile) => profile.enabled !== false && Parser.urlMatches(url, profile.urlPatterns || [])) || profiles[0] || null;
}

async function sendToTab(tabId, message) {
  return chrome.tabs.sendMessage(tabId, message);
}

async function startMonitoring({ tabId, profileId, source = "manual" } = {}) {
  const tab = tabId ? await chrome.tabs.get(tabId) : await getActiveTab();
  if (!tab?.id) throw new Error("No active tab found.");
  if (!isInjectableUrl(tab.url || "")) throw new Error("Open a normal website tab before starting automation.");

  const state = await getAppState();
  let profile = profileId ? state.profiles.find((item) => item.id === profileId) : state.activeProfile;
  if (!profile || !Parser.urlMatches(tab.url || "", profile.urlPatterns || [])) {
    profile = findProfileForUrl(state.profiles, tab.url || "");
  }
  if (!profile) throw new Error("No workflow profile is available.");

  await Storage.set({ [STORAGE_KEYS.ACTIVE_PROFILE_ID]: profile.id });
  const injection = await ensureContent(tab.id);
  const status = await updateStatus({
    state: STATE.MONITORING,
    activeSite: new URL(tab.url).hostname,
    activeTabId: tab.id,
    activeProfileId: profile.id,
    workflowStage: "Monitoring",
    currentRule: "",
    lastAction: source === "schedule" ? "Scheduled workflow started" : "Workflow started",
    lastError: "",
    monitoring: true
  });

  await sendToTab(tab.id, {
    type: MESSAGE.START,
    profile,
    settings: state.settings,
    source
  });

  await log("info", "monitoring_started", { source, tabId: tab.id, url: tab.url, profileId: profile.id, injection });
  await notify("VisaFlowX Universal started", `Monitoring profile: ${profile.name}`);
  return { ok: true, injection, status, profileId: profile.id };
}

async function stopMonitoring({ tabId, reason = "manual" } = {}) {
  const activeTab = tabId ? { id: tabId } : await getActiveTab();
  if (activeTab?.id) {
    try {
      await sendToTab(activeTab.id, { type: MESSAGE.STOP, reason });
    } catch (_) {
      // Tab may already be closed or restricted.
    }
  }
  const status = await updateStatus({
    state: STATE.STOPPED,
    workflowStage: "Stopped",
    currentRule: "",
    retryCountdownEndsAt: null,
    lastAction: `Automation stopped (${reason})`,
    monitoring: false
  });
  await log("info", "monitoring_stopped", { reason, tabId: activeTab?.id || null });
  return { ok: true, status };
}

function normalizeProfile(profile) {
  const now = Date.now();
  return {
    id: profile.id || `profile-${now}`,
    name: String(profile.name || "Untitled Profile").trim(),
    enabled: profile.enabled !== false,
    startUrl: String(profile.startUrl || "").trim(),
    urlPatterns: Array.isArray(profile.urlPatterns) && profile.urlPatterns.length ? profile.urlPatterns : ["*"],
    monitorRegion: profile.monitorRegion || null,
    retry: { ...Constants.DEFAULT_RETRY, ...(profile.retry || {}) },
    schedule: { enabled: false, recurring: "none", runAt: "", ...(profile.schedule || {}) },
    rules: Array.isArray(profile.rules) ? profile.rules : []
  };
}

async function saveProfile(profile) {
  const state = await getAppState();
  const normalized = normalizeProfile(profile);
  const profiles = state.profiles.some((item) => item.id === normalized.id)
    ? state.profiles.map((item) => (item.id === normalized.id ? normalized : item))
    : [...state.profiles, normalized];
  await Storage.set({
    [STORAGE_KEYS.PROFILES]: profiles,
    [STORAGE_KEYS.ACTIVE_PROFILE_ID]: normalized.id
  });
  await log("info", "profile_saved", { profileId: normalized.id, name: normalized.name });
  return { ok: true, profile: normalized, profiles };
}

async function deleteProfile(profileId) {
  const state = await getAppState();
  if (state.profiles.length <= 1) throw new Error("At least one profile must remain.");
  const profiles = state.profiles.filter((profile) => profile.id !== profileId);
  const activeProfileId = state.activeProfileId === profileId ? profiles[0]?.id || "" : state.activeProfileId;
  await Storage.set({ [STORAGE_KEYS.PROFILES]: profiles, [STORAGE_KEYS.ACTIVE_PROFILE_ID]: activeProfileId });
  await clearSchedulesForProfile(profileId);
  await log("info", "profile_deleted", { profileId });
  return { ok: true, profiles, activeProfileId };
}

async function setActiveProfile(profileId) {
  const state = await getAppState();
  const profile = state.profiles.find((item) => item.id === profileId);
  if (!profile) throw new Error("Profile not found.");
  await Storage.set({ [STORAGE_KEYS.ACTIVE_PROFILE_ID]: profileId });
  await updateStatus({ activeProfileId: profileId, lastAction: `Active profile: ${profile.name}` });
  return { ok: true, profile };
}

function alarmName(scheduleId) {
  return `vfu-schedule:${scheduleId}`;
}

function nextRunAt(runAt, recurring = "none") {
  const input = new Date(runAt);
  if (Number.isNaN(input.getTime())) throw new Error("Schedule date/time is invalid.");
  let time = input.getTime();
  const now = Date.now();
  if (time > now || recurring === "none") return time;
  const step = recurring === "weekly" ? 7 * 24 * 60 * 60 * 1000 : recurring === "hourly" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  while (time <= now) time += step;
  return time;
}

async function saveSchedule(schedule) {
  const state = await getAppState();
  const profileId = schedule.profileId || state.activeProfileId;
  const profile = state.profiles.find((item) => item.id === profileId);
  if (!profile) throw new Error("Profile not found for schedule.");
  const id = schedule.id || `schedule-${Date.now()}`;
  const normalized = {
    id,
    profileId,
    enabled: schedule.enabled !== false,
    runAt: schedule.runAt,
    recurring: schedule.recurring || "none",
    nextRunAt: nextRunAt(schedule.runAt, schedule.recurring || "none")
  };
  const schedules = state.schedules.some((item) => item.id === id)
    ? state.schedules.map((item) => (item.id === id ? normalized : item))
    : [...state.schedules, normalized];

  await Storage.set({ [STORAGE_KEYS.SCHEDULES]: schedules });
  await chrome.alarms.create(alarmName(id), {
    when: normalized.nextRunAt,
    periodInMinutes: normalized.recurring === "hourly" ? 60 : normalized.recurring === "daily" ? 1440 : normalized.recurring === "weekly" ? 10080 : undefined
  });
  await updateStatus({
    state: STATE.SCHEDULED,
    workflowStage: "Scheduled",
    scheduledNextRunAt: normalized.nextRunAt,
    lastAction: `Scheduled ${profile.name}`
  });
  await log("info", "schedule_saved", { schedule: normalized });
  await notify("Workflow scheduled", `${profile.name} will start at ${new Date(normalized.nextRunAt).toLocaleString()}`);
  return { ok: true, schedule: normalized, schedules };
}

async function clearSchedule(scheduleId) {
  const state = await getAppState();
  const schedules = scheduleId ? state.schedules.filter((item) => item.id !== scheduleId) : [];
  const removed = scheduleId ? state.schedules.filter((item) => item.id === scheduleId) : state.schedules;
  await Storage.set({ [STORAGE_KEYS.SCHEDULES]: schedules });
  await Promise.all(removed.map((schedule) => chrome.alarms.clear(alarmName(schedule.id))));
  await updateStatus({ scheduledNextRunAt: null, lastAction: "Schedule cleared", state: STATE.IDLE });
  await log("info", "schedule_cleared", { scheduleId: scheduleId || "all" });
  return { ok: true, schedules };
}

async function clearSchedulesForProfile(profileId) {
  const state = await getAppState();
  const removed = state.schedules.filter((schedule) => schedule.profileId === profileId);
  const schedules = state.schedules.filter((schedule) => schedule.profileId !== profileId);
  await Storage.set({ [STORAGE_KEYS.SCHEDULES]: schedules });
  await Promise.all(removed.map((schedule) => chrome.alarms.clear(alarmName(schedule.id))));
}

async function restoreSchedules() {
  const state = await getAppState();
  await Promise.all(state.schedules.filter((schedule) => schedule.enabled).map((schedule) => chrome.alarms.create(alarmName(schedule.id), {
    when: nextRunAt(schedule.runAt, schedule.recurring),
    periodInMinutes: schedule.recurring === "hourly" ? 60 : schedule.recurring === "daily" ? 1440 : schedule.recurring === "weekly" ? 10080 : undefined
  })));
}

async function startScheduledWorkflow(scheduleId) {
  const state = await getAppState();
  const schedule = state.schedules.find((item) => item.id === scheduleId);
  if (!schedule?.enabled) return;
  const profile = state.profiles.find((item) => item.id === schedule.profileId);
  if (!profile) throw new Error("Scheduled profile was not found.");

  let tab = null;
  const tabs = await chrome.tabs.query({});
  const pattern = profile.urlPatterns || [];
  tab = tabs.find((item) => Parser.urlMatches(item.url || "", pattern)) || null;

  if (tab?.id) {
    await chrome.tabs.update(tab.id, { active: true, url: profile.startUrl || tab.url });
    await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    tab = await chrome.tabs.create({ url: profile.startUrl || "about:blank", active: true });
  }

  await updateStatus({
    state: STATE.DETECTING,
    workflowStage: "Scheduled launch",
    lastAction: `Opening ${profile.name}`
  });

  setTimeout(() => {
    startMonitoring({ tabId: tab.id, profileId: profile.id, source: "schedule" }).catch((error) => {
      updateStatus({ state: STATE.ERROR, lastError: error.message, monitoring: false });
      log("error", "scheduled_start_failed", { error: error.message, scheduleId });
      notify("Scheduled workflow failed", error.message);
    });
  }, 2500);
}

async function handleContentStatus(message, sender) {
  const tab = sender.tab || {};
  const status = await updateStatus({
    ...message.status,
    activeTabId: tab.id,
    activeSite: tab.url ? new URL(tab.url).hostname : message.status?.activeSite,
    updatedAt: new Date().toISOString()
  });
  return { ok: true, status };
}

async function saveSelectedArea(message, sender) {
  const state = await getAppState();
  const profile = state.activeProfile;
  if (!profile) throw new Error("No active profile to save the selected area.");
  const updatedProfile = normalizeProfile({
    ...profile,
    monitorRegion: {
      ...message.area,
      url: sender.tab?.url || "",
      savedAt: new Date().toISOString()
    }
  });
  await saveProfile(updatedProfile);
  await updateStatus({ lastAction: "Monitoring area saved", selectedArea: updatedProfile.monitorRegion });
  return { ok: true, area: updatedProfile.monitorRegion };
}

async function handleOtpDetected(message, sender) {
  const tab = sender.tab || {};
  const status = await updateStatus({
    state: STATE.OTP_REQUIRED,
    activeTabId: tab.id,
    activeSite: tab.url ? new URL(tab.url).hostname : message.status?.activeSite,
    currentUrl: tab.url || message.status?.currentUrl || "",
    workflowStage: "OTP required",
    currentRule: "",
    retryCountdownEndsAt: null,
    lastAction: "OTP page detected. Automation stopped for manual entry.",
    lastError: "",
    monitoring: false,
    otpDetected: true
  });
  await log("warn", "otp_detected", {
    tabId: tab.id || null,
    reason: message.reason || "",
    selector: message.selector || ""
  });
  await notify("OTP required", "Automation stopped. Enter the OTP manually to continue.");
  return { ok: true, status };
}

async function handleRuntimeMessage(message, sender) {
  switch (message?.type) {
    case MESSAGE.GET_STATE: {
      const state = await getAppState();
      let activeTab = null;
      try {
        activeTab = await getActiveTab();
      } catch (_) {}
      return { ok: true, ...state, activeTab };
    }
    case MESSAGE.ENSURE_CONTENT: {
      const tab = message.tabId ? await chrome.tabs.get(message.tabId) : await getActiveTab();
      if (!tab?.id) throw new Error("No active tab found.");
      return { ok: true, ...(await ensureContent(tab.id)) };
    }
    case MESSAGE.START:
      return startMonitoring(message);
    case MESSAGE.STOP:
      return stopMonitoring(message);
    case MESSAGE.SAVE_PROFILE:
      return saveProfile(message.profile);
    case MESSAGE.DELETE_PROFILE:
      return deleteProfile(message.profileId);
    case MESSAGE.SET_ACTIVE_PROFILE:
      return setActiveProfile(message.profileId);
    case MESSAGE.SCHEDULE_SAVE:
      return saveSchedule(message.schedule);
    case MESSAGE.SCHEDULE_CLEAR:
      return clearSchedule(message.scheduleId);
    case MESSAGE.STATUS_UPDATE:
      return handleContentStatus(message, sender);
    case MESSAGE.LOG_EVENT:
      await appendLog(message.log || Logger.create("info", "unknown_event", {}));
      return { ok: true };
    case MESSAGE.AREA_SELECTED:
      return saveSelectedArea(message, sender);
    case MESSAGE.OTP_DETECTED:
      return handleOtpDetected(message, sender);
    case MESSAGE.START_AREA_SELECTOR: {
      const tab = await getActiveTab();
      if (!tab?.id) throw new Error("No active tab found.");
      await ensureContent(tab.id);
      await sendToTab(tab.id, { type: MESSAGE.START_AREA_SELECTOR });
      return { ok: true };
    }
    case MESSAGE.RUN_RULE_ONCE: {
      const tab = await getActiveTab();
      if (!tab?.id) throw new Error("No active tab found.");
      const state = await getAppState();
      await ensureContent(tab.id);
      await sendToTab(tab.id, { type: MESSAGE.RUN_RULE_ONCE, profile: state.activeProfile, ruleId: message.ruleId });
      return { ok: true };
    }
    case MESSAGE.TEST_NOTIFICATION:
      await notify("VisaFlowX Universal", "Notifications are working.");
      return { ok: true };
    case MESSAGE.CLEAR_LOGS:
      await Storage.set({ [STORAGE_KEYS.LOGS]: [] });
      return { ok: true };
    case MESSAGE.EXPORT_PROFILES: {
      const state = await getAppState();
      return { ok: true, profiles: state.profiles };
    }
    case MESSAGE.IMPORT_PROFILES: {
      const profiles = Array.isArray(message.profiles) ? message.profiles.map(normalizeProfile) : [];
      if (!profiles.length) throw new Error("No profiles were provided.");
      await Storage.set({ [STORAGE_KEYS.PROFILES]: profiles, [STORAGE_KEYS.ACTIVE_PROFILE_ID]: profiles[0].id });
      await log("info", "profiles_imported", { count: profiles.length });
      return { ok: true, profiles };
    }
    case MESSAGE.SET_SETTINGS: {
      const state = await getAppState();
      const settings = { ...state.settings, ...(message.settings || {}) };
      await Storage.set({ [STORAGE_KEYS.SETTINGS]: settings });
      await updateStatus({ lastAction: "Settings updated" });
      return { ok: true, settings };
    }
    case MESSAGE.TEST_ALARM: {
      const tab = await getActiveTab();
      if (tab?.id) {
        await ensureContent(tab.id);
        await sendToTab(tab.id, { type: MESSAGE.TEST_ALARM });
      }
      return { ok: true };
    }
    case MESSAGE.STOP_ALARM: {
      const tab = await getActiveTab();
      if (tab?.id) {
        await sendToTab(tab.id, { type: MESSAGE.STOP_ALARM }).catch(() => {});
      }
      return { ok: true };
    }
    default:
      throw new Error(`Unknown message type: ${message?.type || "empty"}`);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  Storage.ensureDefaults()
    .then(restoreSchedules)
    .then(() => log("info", "extension_installed", { version: chrome.runtime.getManifest().version }))
    .catch((error) => console.error(error));
});

chrome.runtime.onStartup.addListener(() => {
  Storage.ensureDefaults()
    .then(restoreSchedules)
    .catch((error) => console.error(error));
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleRuntimeMessage(message, sender)
    .then((response) => sendResponse(response))
    .catch(async (error) => {
      await updateStatus({
        state: STATE.ERROR,
        lastError: error.message,
        workflowStage: "Error"
      }).catch(() => {});
      await log("error", "runtime_error", { message: error.message, type: message?.type }).catch(() => {});
      sendResponse({ ok: false, error: error.message });
    });
  return true;
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "toggle-monitoring") return;
  getAppState()
    .then((state) => (state.status.monitoring ? stopMonitoring({ reason: "hotkey" }) : startMonitoring({ source: "hotkey" })))
    .catch((error) => {
      updateStatus({ state: STATE.ERROR, lastError: error.message, workflowStage: "Error" });
      notify("VisaFlowX Universal error", error.message);
    });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm.name.startsWith("vfu-schedule:")) return;
  startScheduledWorkflow(alarm.name.replace("vfu-schedule:", "")).catch((error) => {
    updateStatus({ state: STATE.ERROR, lastError: error.message, workflowStage: "Error", monitoring: false });
    notify("Scheduled workflow failed", error.message);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  getAppState().then((state) => {
    if (state.status.activeTabId === tabId && state.status.monitoring) {
      updateStatus({
        state: STATE.STOPPED,
        monitoring: false,
        workflowStage: "Stopped",
        lastAction: "Automation stopped because the tab was closed"
      });
      log("info", "tab_closed_stop", { tabId });
    }
  }).catch(() => {});
});
