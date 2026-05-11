(function initVisaFlowXPopup(global) {
  "use strict";

  const { Scheduler, Timers } = global.VisaFlowX;
  const $ = (id) => document.getElementById(id);

  const elements = {
    baseDelay: $("baseDelay"),
    clearCredentialsBtn: $("clearCredentialsBtn"),
    clearScheduleBtn: $("clearScheduleBtn"),
    contactNumber: $("contactNumber"),
    credentialState: $("credentialState"),
    currentPage: $("currentPage"),
    lastAction: $("lastAction"),
    lastError: $("lastError"),
    muteAlarmBtn: $("muteAlarmBtn"),
    notificationsEnabled: $("notificationsEnabled"),
    otpState: $("otpState"),
    password: $("password"),
    quickSaveBtn: $("quickSaveBtn"),
    refreshMode: $("refreshMode"),
    retryCountdown: $("retryCountdown"),
    saveCredentialsBtn: $("saveCredentialsBtn"),
    saveSettingsBtn: $("saveSettingsBtn"),
    scheduleBtn: $("scheduleBtn"),
    scheduleDate: $("scheduleDate"),
    scheduleEnabled: $("scheduleEnabled"),
    schedulerState: $("schedulerState"),
    schedulePreview: $("schedulePreview"),
    scheduleTime: $("scheduleTime"),
    soundEnabled: $("soundEnabled"),
    startBtn: $("startBtn"),
    stateBadge: $("stateBadge"),
    stateText: $("stateText"),
    stopAlarmBtn: $("stopAlarmBtn"),
    stopBtn: $("stopBtn"),
    testAlarmBtn: $("testAlarmBtn"),
    testNotificationBtn: $("testNotificationBtn"),
    toastViewport: $("toastViewport"),
    updateCredentialsBtn: $("updateCredentialsBtn"),
    verificationState: $("verificationState"),
    volume: $("volume")
  };

  let appState = null;
  let countdownTimer = null;

  function friendlyError(error) {
    const message = error?.message || String(error || "");
    if (/receiving end|could not establish connection|message port|Extension context invalidated/i.test(message)) return "IVAC page not ready";
    if (/loading|page load/i.test(message)) return "Waiting for page load";
    if (/verification/i.test(message)) return "Verification pending";
    if (/schedule date/i.test(message)) return "Choose a schedule date";
    if (/schedule time/i.test(message)) return "Choose a valid future schedule time";
    return message || "Something went wrong";
  }

  function send(type, payload = {}) {
    return chrome.runtime.sendMessage({ type, ...payload }).then((response) => {
      if (!response?.ok) throw new Error(response?.error || "IVAC page not ready");
      return response;
    });
  }

  function toast(message, kind = "success") {
    const item = document.createElement("div");
    item.className = `toast ${kind}`;
    item.textContent = message;
    elements.toastViewport.appendChild(item);
    requestAnimationFrame(() => item.classList.add("is-visible"));
    setTimeout(() => {
      item.classList.remove("is-visible");
      setTimeout(() => item.remove(), 240);
    }, 2600);
  }

  function stateClass(state = "IDLE") {
    if (state === "RUNNING") return "active";
    if (["WAITING_VERIFICATION", "RETRYING", "SCHEDULED"].includes(state)) return "waiting";
    if (state === "OTP_DETECTED") return "otp";
    if (state === "COMPLETED") return "done";
    if (state === "ERROR") return "error";
    return "idle";
  }

  function stateLabel(state = "IDLE") {
    const labels = {
      IDLE: "Idle",
      RUNNING: "Running",
      WAITING_VERIFICATION: "Waiting Verification",
      RETRYING: "Retrying",
      OTP_DETECTED: "OTP Detected",
      SCHEDULED: "Scheduled",
      ERROR: "Error",
      COMPLETED: "Completed"
    };
    return labels[state] || "Running";
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
    elements.schedulerState.textContent = status.schedulerState || Scheduler.preview(appState?.schedule);
    elements.lastAction.textContent = status.lastAction || "Ready";
    elements.lastError.textContent = status.lastError || "-";
    renderCountdown(status.retryCountdownEndsAt);
  }

  function renderForm(state) {
    elements.contactNumber.value = state.credentials.contactNumber || "";
    elements.password.value = state.credentials.password || "";
    elements.credentialState.textContent = state.credentials.contactNumber && state.credentials.password ? "Saved" : "Not saved";
    elements.scheduleEnabled.checked = state.schedule.enabled === true;
    elements.scheduleDate.value = state.schedule.date || "";
    elements.scheduleTime.value = state.schedule.time || "";
    elements.schedulePreview.textContent = Scheduler.preview(state.schedule);
    elements.notificationsEnabled.checked = state.settings.notifications !== false;
    elements.soundEnabled.checked = state.settings.soundEnabled !== false;
    elements.volume.value = state.settings.volume ?? 1;
    elements.baseDelay.value = Math.round((state.retry.baseDelayMs || 15000) / 1000);
    elements.refreshMode.value = state.retry.refreshMode || "soft";
  }

  async function loadState() {
    appState = await send("GET_STATE");
    renderForm(appState);
    renderStatus(appState.status);
  }

  function validateCredentials() {
    const contactNumber = elements.contactNumber.value.trim();
    const password = elements.password.value;
    if (!contactNumber) throw new Error("Enter the IVAC contact number");
    if (!password) throw new Error("Enter the IVAC password");
    return { contactNumber, password };
  }

  async function saveCredentials(label = "Credentials saved") {
    await send("SAVE_CREDENTIALS", { credentials: validateCredentials() });
    await loadState();
    toast(label);
  }

  async function clearCredentials() {
    await send("CLEAR_CREDENTIALS");
    await loadState();
    toast("Credentials cleared");
  }

  async function saveSettings({ quiet = false } = {}) {
    await send("SAVE_SETTINGS", {
      settings: {
        notifications: elements.notificationsEnabled.checked,
        soundEnabled: elements.soundEnabled.checked,
        volume: Number(elements.volume.value)
      }
    });
    await send("SAVE_RETRY", {
      retry: {
        baseDelayMs: Number(elements.baseDelay.value || 15) * 1000,
        refreshMode: elements.refreshMode.value
      }
    });
    await loadState();
    if (!quiet) toast("Settings saved");
  }

  async function saveSchedule() {
    if (!elements.scheduleEnabled.checked) {
      await send("CLEAR_SCHEDULE");
      await loadState();
      toast("Scheduler disabled");
      return;
    }
    await send("SAVE_SCHEDULE", {
      schedule: {
        enabled: true,
        date: elements.scheduleDate.value,
        time: elements.scheduleTime.value
      }
    });
    await loadState();
    toast("Scheduler saved");
  }

  function updateSchedulePreview() {
    if (!elements.scheduleEnabled.checked) {
      elements.schedulePreview.textContent = "Not scheduled";
      return;
    }
    try {
      const nextRunAt = Scheduler.parseLocalRun(elements.scheduleDate.value, elements.scheduleTime.value);
      elements.schedulePreview.textContent = Scheduler.preview({ enabled: true, nextRunAt });
    } catch (error) {
      elements.schedulePreview.textContent = friendlyError(error);
    }
  }

  function bind() {
    elements.startBtn.addEventListener("click", () => send("START_AUTOMATION").then(() => loadState()).then(() => toast("Automation started")).catch(showError));
    elements.stopBtn.addEventListener("click", () => send("STOP_AUTOMATION", { reason: "popup" }).then(() => loadState()).then(() => toast("Automation stopped")).catch(showError));
    elements.quickSaveBtn.addEventListener("click", () => saveCredentials().catch(showError));
    elements.saveCredentialsBtn.addEventListener("click", () => saveCredentials("Credentials saved").catch(showError));
    elements.updateCredentialsBtn.addEventListener("click", () => saveCredentials("Credentials updated").catch(showError));
    elements.clearCredentialsBtn.addEventListener("click", () => clearCredentials().catch(showError));
    elements.scheduleBtn.addEventListener("click", () => saveSchedule().catch(showError));
    elements.clearScheduleBtn.addEventListener("click", () => send("CLEAR_SCHEDULE").then(loadState).then(() => toast("Schedule cleared")).catch(showError));
    elements.saveSettingsBtn.addEventListener("click", () => saveSettings().catch(showError));
    elements.testNotificationBtn.addEventListener("click", () => send("TEST_NOTIFICATION").then(() => toast("Notification sent")).catch(showError));
    elements.testAlarmBtn.addEventListener("click", () => send("TEST_ALARM", { volume: Number(elements.volume.value) }).then(() => toast("Alarm started")).catch(showError));
    elements.muteAlarmBtn.addEventListener("click", () => send("MUTE_ALARM").then(() => toast("Alarm muted")).catch(showError));
    elements.stopAlarmBtn.addEventListener("click", () => send("STOP_ALARM").then(() => toast("Alarm stopped")).catch(showError));
    elements.volume.addEventListener("input", () => send("SET_ALARM_VOLUME", { volume: Number(elements.volume.value) }).catch(() => {}));
    [elements.notificationsEnabled, elements.soundEnabled, elements.baseDelay, elements.refreshMode].forEach((element) => {
      element.addEventListener("change", () => saveSettings({ quiet: true }).catch(showError));
    });
    [elements.scheduleDate, elements.scheduleTime, elements.scheduleEnabled].forEach((element) => {
      element.addEventListener("change", updateSchedulePreview);
    });
  }

  function showError(error) {
    const message = friendlyError(error);
    elements.stateBadge.textContent = "Error";
    elements.stateBadge.className = "state-badge error";
    elements.stateText.textContent = "Error";
    elements.lastAction.textContent = message;
    elements.lastError.textContent = message;
    toast(message, "error");
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "STATUS_UPDATE") {
      appState = appState || {};
      appState.status = message.status;
      renderStatus(message.status);
      if (message.status?.state === "OTP_DETECTED") toast("OTP detected. Automation stopped.", "error");
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    bind();
    loadState().catch(showError);
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
