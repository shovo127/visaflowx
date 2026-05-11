(function initVisaFlowXPopup(global) {
  "use strict";

  const { Storage, Timers } = global.VisaFlowX;
  const $ = (id) => document.getElementById(id);

  const elements = {
    baseDelay: $("baseDelay"),
    clearScheduleBtn: $("clearScheduleBtn"),
    contactNumber: $("contactNumber"),
    currentPage: $("currentPage"),
    lastAction: $("lastAction"),
    lastError: $("lastError"),
    maxAttempts: $("maxAttempts"),
    muteAlarmBtn: $("muteAlarmBtn"),
    notificationsEnabled: $("notificationsEnabled"),
    otpState: $("otpState"),
    password: $("password"),
    refreshMode: $("refreshMode"),
    retryCountdown: $("retryCountdown"),
    saveCredentialsBtn: $("saveCredentialsBtn"),
    saveSettingsBtn: $("saveSettingsBtn"),
    scheduleBtn: $("scheduleBtn"),
    scheduleEnabled: $("scheduleEnabled"),
    schedulerState: $("schedulerState"),
    scheduleRunAt: $("scheduleRunAt"),
    soundEnabled: $("soundEnabled"),
    startBtn: $("startBtn"),
    stateBadge: $("stateBadge"),
    stateText: $("stateText"),
    stopAlarmBtn: $("stopAlarmBtn"),
    stopBtn: $("stopBtn"),
    testAlarmBtn: $("testAlarmBtn"),
    testNotificationBtn: $("testNotificationBtn"),
    verificationState: $("verificationState"),
    volume: $("volume")
  };

  let appState = null;
  let countdownTimer = null;

  function send(type, payload = {}) {
    return chrome.runtime.sendMessage({ type, ...payload }).then((response) => {
      if (!response?.ok) throw new Error(response?.error || "Command failed");
      return response;
    });
  }

  function stateClass(state = "IDLE") {
    if (["DETECTING_PAGE", "AUTOFILLING", "SIGNING_IN"].includes(state)) return "active";
    if (["WAITING_FOR_VERIFICATION", "RETRY_COUNTDOWN", "SCHEDULED"].includes(state)) return "waiting";
    if (state === "OTP_DETECTED") return "otp";
    if (state === "COMPLETED") return "done";
    if (state === "ERROR") return "error";
    return "idle";
  }

  function stateLabel(state = "IDLE") {
    return String(state).toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function renderCountdown(endsAt) {
    if (countdownTimer) clearInterval(countdownTimer);
    const update = () => {
      if (!endsAt) {
        elements.retryCountdown.textContent = "-";
        return;
      }
      const remaining = Number(endsAt) - Date.now();
      elements.retryCountdown.textContent = remaining > 0 ? Timers.formatDuration(remaining) : "Retrying";
    };
    update();
    if (endsAt) countdownTimer = setInterval(update, 1000);
  }

  function renderStatus(status = {}) {
    const state = status.state || "IDLE";
    elements.stateBadge.textContent = stateLabel(state);
    elements.stateBadge.className = `state-badge ${stateClass(state)}`;
    elements.stateText.textContent = stateLabel(state);
    elements.currentPage.textContent = status.page ? status.page.replace(/^https?:\/\//, "") : "-";
    elements.verificationState.textContent = status.verificationState || "Idle";
    elements.otpState.textContent = status.otpState || "Idle";
    elements.schedulerState.textContent = status.schedulerState || appState?.status?.schedulerState || "Not scheduled";
    elements.lastAction.textContent = status.lastAction || "Ready";
    elements.lastError.textContent = status.lastError || "-";
    renderCountdown(status.retryCountdownEndsAt);
  }

  function toLocalInputValue(timestamp) {
    if (!timestamp) return "";
    const date = new Date(Number(timestamp));
    if (Number.isNaN(date.getTime())) return "";
    const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
    return local.toISOString().slice(0, 16);
  }

  function renderForm(state) {
    elements.contactNumber.value = state.credentials.contactNumber || "";
    elements.password.value = state.credentials.password || "";
    elements.scheduleEnabled.checked = state.schedule.enabled === true;
    elements.scheduleRunAt.value = state.schedule.nextRunAt ? toLocalInputValue(state.schedule.nextRunAt) : "";
    elements.notificationsEnabled.checked = state.settings.notifications !== false;
    elements.soundEnabled.checked = state.settings.soundEnabled !== false;
    elements.volume.value = state.settings.volume ?? 1;
    elements.maxAttempts.value = state.retry.maxAttempts ?? 5;
    elements.baseDelay.value = Math.round((state.retry.baseDelayMs || 15000) / 1000);
    elements.refreshMode.value = state.retry.refreshMode || "soft";
  }

  async function loadState() {
    appState = await send("GET_STATE");
    renderForm(appState);
    renderStatus(appState.status);
  }

  async function saveCredentials() {
    await send("SAVE_CREDENTIALS", {
      credentials: {
        contactNumber: elements.contactNumber.value,
        password: elements.password.value
      }
    });
    await loadState();
  }

  async function saveSettings() {
    await send("SAVE_SETTINGS", {
      settings: {
        notifications: elements.notificationsEnabled.checked,
        soundEnabled: elements.soundEnabled.checked,
        volume: Number(elements.volume.value)
      }
    });
    await send("SAVE_RETRY", {
      retry: {
        enabled: true,
        maxAttempts: Number(elements.maxAttempts.value || 5),
        baseDelayMs: Number(elements.baseDelay.value || 15) * 1000,
        refreshMode: elements.refreshMode.value
      }
    });
    await loadState();
  }

  async function saveSchedule() {
    if (!elements.scheduleEnabled.checked) {
      await send("CLEAR_SCHEDULE");
      await loadState();
      return;
    }
    if (!elements.scheduleRunAt.value) throw new Error("Choose a schedule time.");
    await send("SAVE_SCHEDULE", {
      schedule: {
        enabled: true,
        runAt: new Date(elements.scheduleRunAt.value).toISOString()
      }
    });
    await loadState();
  }

  function bind() {
    elements.startBtn.addEventListener("click", () => send("START_AUTOMATION").then(loadState).catch(showError));
    elements.stopBtn.addEventListener("click", () => send("STOP_AUTOMATION", { reason: "popup" }).then(loadState).catch(showError));
    elements.saveCredentialsBtn.addEventListener("click", () => saveCredentials().catch(showError));
    elements.scheduleBtn.addEventListener("click", () => saveSchedule().catch(showError));
    elements.clearScheduleBtn.addEventListener("click", () => send("CLEAR_SCHEDULE").then(loadState).catch(showError));
    elements.saveSettingsBtn.addEventListener("click", () => saveSettings().catch(showError));
    elements.testNotificationBtn.addEventListener("click", () => send("TEST_NOTIFICATION").catch(showError));
    elements.testAlarmBtn.addEventListener("click", () => send("TEST_ALARM", { volume: Number(elements.volume.value) }).catch(showError));
    elements.muteAlarmBtn.addEventListener("click", () => send("MUTE_ALARM").catch(showError));
    elements.stopAlarmBtn.addEventListener("click", () => send("STOP_ALARM").catch(showError));
    elements.volume.addEventListener("input", () => send("SET_ALARM_VOLUME", { volume: Number(elements.volume.value) }).catch(() => {}));
    [elements.notificationsEnabled, elements.soundEnabled, elements.maxAttempts, elements.baseDelay, elements.refreshMode].forEach((element) => {
      element.addEventListener("change", () => saveSettings().catch(showError));
    });
  }

  function showError(error) {
    const message = error?.message || String(error || "Unknown error");
    elements.stateBadge.textContent = "Error";
    elements.stateBadge.className = "state-badge error";
    elements.stateText.textContent = "Error";
    elements.lastAction.textContent = "Command failed";
    elements.lastError.textContent = message;
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "STATUS_UPDATE") {
      appState = appState || {};
      appState.status = message.status;
      renderStatus(message.status);
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    bind();
    loadState().catch(showError);
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
