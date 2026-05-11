(function initPopup(global) {
  "use strict";

  const { Constants, Timers } = global.VisaFlowXUniversal;
  const { ACTIONS, CONDITIONS, MESSAGE, REFRESH_MODES, STATE } = Constants;

  const $ = (id) => document.getElementById(id);
  const elements = {
    actionType: $("actionType"),
    activeSite: $("activeSite"),
    baseDelay: $("baseDelay"),
    clearLogsBtn: $("clearLogsBtn"),
    clearScheduleBtn: $("clearScheduleBtn"),
    conditionText: $("conditionText"),
    conditionType: $("conditionType"),
    currentRule: $("currentRule"),
    debugContent: $("debugContent"),
    debugMessage: $("debugMessage"),
    debugUrl: $("debugUrl"),
    deleteProfileBtn: $("deleteProfileBtn"),
    lastActionMetric: $("lastActionMetric"),
    lastError: $("lastError"),
    logs: $("logs"),
    maxAttempts: $("maxAttempts"),
    monitoredText: $("monitoredText"),
    notificationsEnabled: $("notificationsEnabled"),
    profileName: $("profileName"),
    profileSelect: $("profileSelect"),
    refreshMode: $("refreshMode"),
    retryEnabled: $("retryEnabled"),
    retryModeBadge: $("retryModeBadge"),
    retryTimer: $("retryTimer"),
    ruleCount: $("ruleCount"),
    ruleList: $("ruleList"),
    runRuleBtn: $("runRuleBtn"),
    saveProfileBtn: $("saveProfileBtn"),
    saveRuleBtn: $("saveRuleBtn"),
    scheduleBadge: $("scheduleBadge"),
    scheduleBtn: $("scheduleBtn"),
    scheduleDateTime: $("scheduleDateTime"),
    scheduleRecurring: $("scheduleRecurring"),
    selectAreaBtn: $("selectAreaBtn"),
    soundEnabled: $("soundEnabled"),
    startBtn: $("startBtn"),
    startUrl: $("startUrl"),
    stateBadge: $("stateBadge"),
    statusText: $("statusText"),
    stopAlarmBtn: $("stopAlarmBtn"),
    stopBtn: $("stopBtn"),
    targetSelector: $("targetSelector"),
    targetText: $("targetText"),
    testAlarmBtn: $("testAlarmBtn"),
    testNotificationBtn: $("testNotificationBtn"),
    urlPatterns: $("urlPatterns"),
    volume: $("volume"),
    workflowStage: $("workflowStage")
  };

  let appState = null;
  let countdownTimer = null;

  function send(type, payload = {}) {
    return chrome.runtime.sendMessage({ type, ...payload }).then((response) => {
      elements.debugMessage.textContent = type;
      if (!response?.ok && response?.error) throw new Error(response.error);
      return response;
    });
  }

  function activeProfile() {
    if (!appState) return null;
    return appState.profiles.find((profile) => profile.id === appState.activeProfileId) || appState.profiles[0] || null;
  }

  function setError(error) {
    const message = error?.message || String(error || "");
    elements.lastError.textContent = message || "-";
    elements.statusText.textContent = message || "Something went wrong.";
    elements.stateBadge.textContent = "Error";
    elements.stateBadge.className = "state-badge error";
  }

  function classForState(state = "") {
    if ([STATE.MONITORING, STATE.RUNNING_RULE, STATE.DETECTING].includes(state)) return "monitoring";
    if ([STATE.RETRY_WAIT].includes(state)) return "retry";
    if ([STATE.PROTECTED_CHALLENGE_WAIT, STATE.WAITING, STATE.SCHEDULED].includes(state)) return "waiting";
    if ([STATE.ERROR].includes(state)) return "error";
    return "idle";
  }

  function labelForState(state = "IDLE") {
    return String(state).toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function renderStatus(status = {}) {
    const state = status.state || STATE.IDLE;
    const profile = activeProfile();
    const monitoredRule = (profile?.rules || []).find((rule) => rule.condition?.text);
    elements.stateBadge.textContent = labelForState(state);
    elements.stateBadge.className = `state-badge ${classForState(state)}`;
    elements.statusText.textContent = status.lastAction || "Ready to monitor and automate safe workflow actions.";
    elements.activeSite.textContent = status.activeSite || appState?.activeTab?.url?.replace(/^https?:\/\//, "").split("/")[0] || "-";
    elements.workflowStage.textContent = status.workflowStage || "Idle";
    elements.currentRule.textContent = status.currentRule || "-";
    elements.monitoredText.textContent = status.monitoredText || monitoredRule?.condition?.text || "-";
    elements.lastActionMetric.textContent = status.lastAction || "-";
    elements.lastError.textContent = status.lastError || "-";
    elements.debugUrl.textContent = status.currentUrl || appState?.activeTab?.url || "-";
    renderCountdown(status.retryCountdownEndsAt);
  }

  function renderCountdown(endsAt) {
    if (countdownTimer) clearInterval(countdownTimer);
    const update = () => {
      if (!endsAt) {
        elements.retryTimer.textContent = "-";
        return;
      }
      const remaining = Number(endsAt) - Date.now();
      elements.retryTimer.textContent = remaining > 0 ? Timers.formatDuration(remaining) : "Retrying";
    };
    update();
    if (endsAt) countdownTimer = setInterval(update, 1000);
  }

  function renderProfiles() {
    const profiles = appState?.profiles || [];
    elements.profileSelect.innerHTML = profiles.map((profile) => `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name)}</option>`).join("");
    elements.profileSelect.value = appState.activeProfileId || profiles[0]?.id || "";
    const profile = activeProfile();
    if (!profile) return;
    elements.profileName.value = profile.name || "";
    elements.startUrl.value = profile.startUrl || "";
    elements.urlPatterns.value = (profile.urlPatterns || []).join(", ");
    elements.maxAttempts.value = profile.retry?.maxAttempts ?? 5;
    elements.baseDelay.value = Math.round((profile.retry?.baseDelayMs || 15000) / 1000);
    elements.refreshMode.value = profile.retry?.refreshMode || REFRESH_MODES.SOFT;
    elements.retryEnabled.checked = profile.retry?.enabled !== false;
    elements.retryModeBadge.textContent = `${elements.refreshMode.options[elements.refreshMode.selectedIndex]?.text || "Soft refresh"}`;
    renderRules(profile);
  }

  function renderRules(profile) {
    const rules = profile?.rules || [];
    elements.ruleCount.textContent = `${rules.length} rule${rules.length === 1 ? "" : "s"}`;
    elements.ruleList.innerHTML = rules.length
      ? rules.map((rule) => {
        const action = rule.actions?.[0] || {};
        return `<article class="rule-item">
          <strong>${escapeHtml(rule.name)}</strong>
          <span>IF ${escapeHtml(rule.condition?.type || "")} ${escapeHtml(rule.condition?.text || rule.condition?.selector || rule.condition?.pattern || "")}</span>
          <span>THEN ${escapeHtml(action.type || "")} ${escapeHtml(action.selector || action.text || action.url || "")}</span>
        </article>`;
      }).join("")
      : `<article class="rule-item"><strong>No custom rules yet</strong><span>Add a rule to start monitoring text, selectors, buttons, URLs, or error states.</span></article>`;
  }

  function renderSchedules() {
    const schedules = appState?.schedules || [];
    const next = schedules.filter((schedule) => schedule.enabled).sort((a, b) => a.nextRunAt - b.nextRunAt)[0];
    elements.scheduleBadge.textContent = next ? new Date(next.nextRunAt).toLocaleString() : "No schedule";
  }

  function renderSettings() {
    const settings = appState?.settings || Constants.DEFAULT_SETTINGS;
    elements.notificationsEnabled.checked = settings.notifications !== false;
    elements.soundEnabled.checked = settings.soundEnabled !== false;
    elements.volume.value = settings.volume ?? 0.9;
  }

  function renderLogs() {
    const logs = appState?.logs || [];
    elements.logs.innerHTML = logs.length
      ? logs.slice(0, 25).map((log) => `<li><time>${new Date(log.timestamp).toLocaleString()}</time><strong>${escapeHtml(log.event)}</strong> ${escapeHtml(log.level)} ${escapeHtml(JSON.stringify(log.details || {}))}</li>`).join("")
      : `<li>No logs yet.</li>`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"
    })[char]);
  }

  async function loadState() {
    appState = await send(MESSAGE.GET_STATE);
    elements.debugContent.textContent = "Storage loaded";
    renderProfiles();
    renderSchedules();
    renderSettings();
    renderLogs();
    renderStatus(appState.status || {});
  }

  function collectProfile() {
    const profile = activeProfile() || {};
    return {
      ...profile,
      id: profile.id || `profile-${Date.now()}`,
      name: elements.profileName.value.trim() || "Untitled Profile",
      startUrl: elements.startUrl.value.trim(),
      urlPatterns: elements.urlPatterns.value.split(",").map((item) => item.trim()).filter(Boolean),
      retry: {
        ...profile.retry,
        enabled: elements.retryEnabled.checked,
        maxAttempts: Number(elements.maxAttempts.value || 5),
        baseDelayMs: Number(elements.baseDelay.value || 15) * 1000,
        refreshMode: elements.refreshMode.value
      }
    };
  }

  function createRule(profile) {
    const conditionType = elements.conditionType.value;
    const actionType = elements.actionType.value;
    const condition = { type: conditionType };
    const text = elements.conditionText.value.trim();
    const selector = elements.targetSelector.value.trim();
    const targetText = elements.targetText.value.trim();

    if ([CONDITIONS.TEXT_APPEARS, CONDITIONS.TEXT_MISSING].includes(conditionType)) condition.text = text;
    if ([CONDITIONS.SELECTOR_EXISTS, CONDITIONS.SELECTOR_MISSING, CONDITIONS.BUTTON_ENABLED].includes(conditionType)) condition.selector = selector;
    if (conditionType === CONDITIONS.BUTTON_ENABLED) condition.text = targetText || text;
    if (conditionType === CONDITIONS.URL_MATCHES) condition.patterns = text ? [text] : [location.href];

    const action = { type: actionType };
    if ([ACTIONS.CLICK, ACTIONS.FOCUS, ACTIONS.FILL, ACTIONS.SCROLL_TO_ELEMENT, ACTIONS.WAIT_FOR_SELECTOR].includes(actionType)) {
      action.selector = selector || "button, a, input, textarea, select, [role='button']";
    }
    if ([ACTIONS.CLICK, ACTIONS.WAIT_FOR_TEXT].includes(actionType) && targetText) action.text = targetText;
    if (actionType === ACTIONS.FILL) action.value = elements.actionValue.value;
    if (actionType === ACTIONS.OPEN_URL) action.url = elements.actionValue.value.trim();

    return {
      id: `rule-${Date.now()}`,
      name: `${conditionType} -> ${actionType}`,
      enabled: true,
      cooldownMs: 3000,
      condition,
      actions: [action]
    };
  }

  function bindEvents() {
    elements.startBtn.addEventListener("click", () => {
      elements.startBtn.textContent = "Running";
      elements.stateBadge.textContent = "Detecting";
      elements.stateBadge.className = "state-badge monitoring";
      send(MESSAGE.START).then(loadState).catch(setError);
    });
    elements.stopBtn.addEventListener("click", () => send(MESSAGE.STOP, { reason: "popup" }).then(loadState).catch(setError));
    elements.selectAreaBtn.addEventListener("click", () => send(MESSAGE.START_AREA_SELECTOR).then(() => {
      elements.statusText.textContent = "Area selector started on the active tab.";
    }).catch(setError));
    elements.testNotificationBtn.addEventListener("click", () => send(MESSAGE.TEST_NOTIFICATION).catch(setError));
    elements.testAlarmBtn.addEventListener("click", () => send(MESSAGE.TEST_ALARM).catch(setError));
    elements.stopAlarmBtn.addEventListener("click", () => send(MESSAGE.STOP_ALARM).catch(setError));
    elements.clearLogsBtn.addEventListener("click", () => send(MESSAGE.CLEAR_LOGS).then(loadState).catch(setError));

    elements.profileSelect.addEventListener("change", () => {
      send(MESSAGE.SET_ACTIVE_PROFILE, { profileId: elements.profileSelect.value }).then(loadState).catch(setError);
    });

    elements.saveProfileBtn.addEventListener("click", () => {
      send(MESSAGE.SAVE_PROFILE, { profile: collectProfile() }).then(loadState).catch(setError);
    });

    elements.deleteProfileBtn.addEventListener("click", () => {
      const profile = activeProfile();
      if (profile) send(MESSAGE.DELETE_PROFILE, { profileId: profile.id }).then(loadState).catch(setError);
    });

    elements.saveRuleBtn.addEventListener("click", () => {
      const profile = collectProfile();
      profile.rules = [...(profile.rules || []), createRule(profile)];
      send(MESSAGE.SAVE_PROFILE, { profile }).then(loadState).catch(setError);
    });

    elements.runRuleBtn.addEventListener("click", () => send(MESSAGE.RUN_RULE_ONCE).catch(setError));

    elements.scheduleBtn.addEventListener("click", () => {
      const profile = activeProfile();
      if (!elements.scheduleDateTime.value) {
        setError(new Error("Choose a schedule date and time."));
        return;
      }
      send(MESSAGE.SCHEDULE_SAVE, {
        schedule: {
          profileId: profile?.id,
          runAt: new Date(elements.scheduleDateTime.value).toISOString(),
          recurring: elements.scheduleRecurring.value,
          enabled: true
        }
      }).then(loadState).catch(setError);
    });

    elements.clearScheduleBtn.addEventListener("click", () => send(MESSAGE.SCHEDULE_CLEAR).then(loadState).catch(setError));

    ["retryEnabled", "maxAttempts", "baseDelay", "refreshMode"].forEach((id) => {
      elements[id].addEventListener("change", () => send(MESSAGE.SAVE_PROFILE, { profile: collectProfile() }).then(loadState).catch(setError));
    });

    ["notificationsEnabled", "soundEnabled", "volume"].forEach((id) => {
      elements[id].addEventListener("change", () => send(MESSAGE.SET_SETTINGS, {
        settings: {
          notifications: elements.notificationsEnabled.checked,
          soundEnabled: elements.soundEnabled.checked,
          volume: Number(elements.volume.value)
        }
      }).then(loadState).catch(setError));
    });
  }

  chrome.runtime.onMessage.addListener((message) => {
    elements.debugMessage.textContent = message?.type || "-";
    if (message?.type === MESSAGE.STATUS_UPDATE) {
      appState = appState || {};
      appState.status = message.status;
      renderStatus(message.status);
    }
    if (message?.type === MESSAGE.LOG_EVENT) {
      loadState().catch(() => {});
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    loadState().catch(setError);
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
