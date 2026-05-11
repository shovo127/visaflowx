"use strict";

const constants = window.VisaFlowXConstants || {};
const WORKFLOW_STATES = constants.WORKFLOW_STATES || {};
const STATE_LABELS = constants.STATE_LABELS || {};
const WORKFLOW_STAGES = constants.WORKFLOW_STAGES || [];

const ui = {
  automationBadge: document.getElementById("automationBadge"),
  primaryStatusText: document.getElementById("primaryStatusText"),
  startAutomation: document.getElementById("startAutomation"),
  stopAutomation: document.getElementById("stopAutomation"),
  workflowStages: document.getElementById("workflowStages"),
  actionRequired: document.getElementById("actionRequired"),
  credentialBadge: document.getElementById("credentialBadge"),
  contactNumber: document.getElementById("contactNumber"),
  password: document.getElementById("password"),
  saveCredentials: document.getElementById("saveCredentials"),
  testAutofill: document.getElementById("testAutofill"),
  deleteCredentials: document.getElementById("deleteCredentials"),
  currentPage: document.getElementById("currentPage"),
  statusState: document.getElementById("statusState"),
  captchaState: document.getElementById("captchaState"),
  otpState: document.getElementById("otpState"),
  lastMessage: document.getElementById("lastMessage"),
  lastError: document.getElementById("lastError"),
  testDetection: document.getElementById("testDetection"),
  timerStatus: document.getElementById("timerStatus"),
  retryEndsAt: document.getElementById("retryEndsAt"),
  resetTimers: document.getElementById("resetTimers"),
  notificationState: document.getElementById("notificationState"),
  volume: document.getElementById("volume"),
  mute: document.getElementById("mute"),
  testSound: document.getElementById("testSound"),
  stopAlarm: document.getElementById("stopAlarm"),
  delayModeLabel: document.getElementById("delayModeLabel"),
  autofillDelay: document.getElementById("autofillDelay"),
  signInDelay: document.getElementById("signInDelay"),
  retryDelay: document.getElementById("retryDelay"),
  domWaitDelay: document.getElementById("domWaitDelay"),
  saveDelays: document.getElementById("saveDelays")
};

let latestStatus = null;
let latestSettings = null;
let countdownTimer = null;

function titleCase(value) {
  return String(value || "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTime(value) {
  if (!value) {
    return "Never";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Never";
  }
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function normalizeState(status = {}) {
  if (status.workflowState) {
    return status.workflowState;
  }

  const labelToState = Object.entries(STATE_LABELS).find(([, label]) => label === status.state);
  return labelToState ? labelToState[0] : WORKFLOW_STATES.IDLE || "IDLE";
}

function runtimeMessage(message) {
  return chrome.runtime.sendMessage(message).catch((error) => ({
    ok: false,
    error: error && error.message ? error.message : "Runtime message failed"
  }));
}

function setTemporaryMessage(message) {
  ui.primaryStatusText.textContent = message;
  ui.lastMessage.textContent = message;
}

function buildWorkflowStages() {
  ui.workflowStages.textContent = "";
  WORKFLOW_STAGES.forEach((stage, index) => {
    const item = document.createElement("li");
    item.className = "workflow-step";
    item.dataset.stageId = stage.id;

    const dot = document.createElement("span");
    dot.className = "workflow-dot";
    dot.textContent = String(index + 1);

    const label = document.createElement("span");
    label.textContent = stage.label;

    const state = document.createElement("em");
    state.className = "workflow-state";
    state.textContent = "Waiting";

    item.append(dot, label, state);
    ui.workflowStages.appendChild(item);
  });
}

function setWorkflowState(status) {
  const currentState = normalizeState(status);
  const stageIndex = WORKFLOW_STAGES.findIndex((stage) => stage.states.includes(currentState));

  Array.from(ui.workflowStages.children).forEach((item, index) => {
    item.classList.remove("active", "done");
    const stateLabel = item.querySelector(".workflow-state");
    if (stageIndex >= 0 && index < stageIndex) {
      item.classList.add("done");
      stateLabel.textContent = "Done";
      return;
    }
    if (stageIndex >= 0 && index === stageIndex) {
      item.classList.add("active");
      stateLabel.textContent = "Active";
      return;
    }
    stateLabel.textContent = "Waiting";
  });
}

function setBadge(status, settings) {
  const state = normalizeState(status);
  ui.automationBadge.classList.remove("running", "alert", "error");

  if (state === WORKFLOW_STATES.ERROR) {
    ui.automationBadge.textContent = "Error";
    ui.automationBadge.classList.add("error");
    return;
  }

  if (state === WORKFLOW_STATES.OTP_DETECTED || status.otpDetected) {
    ui.automationBadge.textContent = "OTP";
    ui.automationBadge.classList.add("alert");
    return;
  }

  if (settings.automationEnabled || status.automationEnabled) {
    ui.automationBadge.textContent = "Running";
    ui.automationBadge.classList.add("running");
    return;
  }

  ui.automationBadge.textContent = "Idle";
}

function renderStartButton(status, settings) {
  const isRunning = Boolean(settings.automationEnabled || status.automationEnabled);
  ui.startAutomation.classList.toggle("running", isRunning);
  ui.startAutomation.disabled = isRunning;
  ui.startAutomation.querySelector("span").textContent = isRunning ? "Running" : "Start Automation";
  ui.stopAutomation.disabled = !isRunning && normalizeState(status) !== WORKFLOW_STATES.OTP_DETECTED;
}

function renderCredentials(credentials) {
  const saved = Boolean(credentials.contactNumber && credentials.password);
  ui.credentialBadge.textContent = saved ? "Credentials saved securely" : "Not saved";
  ui.credentialBadge.classList.toggle("saved", saved);
  ui.contactNumber.value = credentials.contactNumber || "";
  ui.password.value = credentials.password || "";
}

function renderSettings(settings) {
  latestSettings = settings;
  const mode = settings.delayMode || "balanced";
  const delays = (settings.delays && settings.delays[mode]) || {};

  ui.delayModeLabel.textContent = titleCase(mode);
  document.querySelectorAll("[data-delay-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.delayMode === mode);
  });

  ui.autofillDelay.value = delays.autofill ?? "";
  ui.signInDelay.value = delays.signIn ?? "";
  ui.retryDelay.value = delays.retryBuffer ?? "";
  ui.domWaitDelay.value = delays.domWait ?? "";
  ui.volume.value = String(Math.round(((settings.sound && settings.sound.volume) ?? 1) * 100));
  ui.mute.checked = Boolean(settings.sound && settings.sound.muted);
}

function renderStatus(status, settings) {
  latestStatus = status;
  latestSettings = settings;
  const state = normalizeState(status);
  const stateLabel = STATE_LABELS[state] || status.state || "Idle";
  const running = Boolean(settings.automationEnabled || status.automationEnabled);

  ui.primaryStatusText.textContent = status.actionRequired || (running ? "Automation is running." : "Ready to automate IVAC login workflow.");
  ui.actionRequired.textContent = status.actionRequired || "Press Start Automation when ready.";
  ui.currentPage.textContent = status.currentPage || "Unknown";
  ui.statusState.textContent = stateLabel;
  ui.captchaState.textContent = status.captchaState || "Unknown";
  ui.otpState.textContent = status.otpDetected ? "Detected" : "No";
  ui.lastMessage.textContent = status.lastMessage || "Ready";
  ui.lastError.textContent = status.lastError || "None";
  ui.notificationState.textContent = status.otpDetected ? "Alarm active" : "Ready";

  setBadge(status, settings);
  renderStartButton(status, settings);
  setWorkflowState(status);
  updateCountdown();
}

function updateCountdown() {
  if (!latestStatus || !latestStatus.retryEndsAt) {
    ui.timerStatus.textContent = latestStatus && latestStatus.timerStatus ? latestStatus.timerStatus : "None";
    ui.retryEndsAt.textContent = "No retry scheduled";
    return;
  }

  const remaining = latestStatus.retryEndsAt - Date.now();
  if (remaining <= 0) {
    ui.timerStatus.textContent = "Retry ready";
    ui.retryEndsAt.textContent = "Retry should start now";
    return;
  }

  ui.timerStatus.textContent = window.VisaFlowXTimers.formatRemaining(remaining);
  ui.retryEndsAt.textContent = `Ends at ${formatTime(latestStatus.retryEndsAt)}`;
}

async function refresh() {
  const credentials = await window.VisaFlowXStorage.getCredentials();
  const state = await runtimeMessage({ type: "GET_STATE" });
  const settings = state && state.settings ? state.settings : await window.VisaFlowXStorage.getSettings();
  const status = state && state.status ? state.status : await window.VisaFlowXStorage.getStatus();

  renderCredentials(credentials);
  renderSettings(settings);
  renderStatus(status, settings);
}

async function saveCredentials() {
  const credentials = {
    contactNumber: ui.contactNumber.value,
    password: ui.password.value
  };
  if (!credentials.contactNumber.trim() || !credentials.password) {
    setTemporaryMessage("Enter contact number and password before saving.");
    return;
  }

  await window.VisaFlowXStorage.saveCredentials(credentials);
  setTemporaryMessage("Credentials saved securely.");
  await refresh();
}

async function deleteCredentials() {
  await window.VisaFlowXStorage.deleteCredentials();
  setTemporaryMessage("Credentials deleted.");
  await refresh();
}

async function setAutomation(enabled) {
  if (enabled) {
    const credentials = await window.VisaFlowXStorage.getCredentials();
    if (!credentials.contactNumber || !credentials.password) {
      setTemporaryMessage("Save credentials before starting automation.");
      return;
    }
  }

  const response = await runtimeMessage({ type: enabled ? "START_AUTOMATION" : "STOP_AUTOMATION" });
  if (!response || response.ok === false) {
    setTemporaryMessage(response && response.error ? response.error : "Could not update automation.");
  }
  await refresh();
}

async function commandActiveTab(type) {
  const response = await runtimeMessage({ type });
  if (!response || response.ok === false) {
    setTemporaryMessage(response && response.error ? response.error : "Open the IVAC tab and try again.");
  }
  await refresh();
}

async function setDelayMode(mode) {
  const settings = await window.VisaFlowXStorage.saveSettings({ delayMode: mode });
  await runtimeMessage({
    type: "SAVE_SETTINGS",
    settings: {
      delayMode: mode
    }
  });
  renderSettings(settings);
}

async function saveDelayValues() {
  const mode = latestSettings && latestSettings.delayMode ? latestSettings.delayMode : "balanced";
  const delays = {
    [mode]: {
      autofill: Math.max(0, Number(ui.autofillDelay.value) || 0),
      signIn: Math.max(0, Number(ui.signInDelay.value) || 0),
      retryBuffer: Math.max(0, Number(ui.retryDelay.value) || 0),
      domWait: Math.max(100, Number(ui.domWaitDelay.value) || 100)
    }
  };

  const settings = await window.VisaFlowXStorage.saveSettings({ delays });
  await runtimeMessage({
    type: "SAVE_SETTINGS",
    settings: {
      delays
    }
  });
  renderSettings(settings);
  setTemporaryMessage(`${titleCase(mode)} delay values saved.`);
}

async function updateSound() {
  const sound = {
    volume: Number(ui.volume.value) / 100,
    muted: ui.mute.checked
  };
  const settings = await window.VisaFlowXStorage.saveSettings({ sound });
  await runtimeMessage({ type: "UPDATE_SOUND", sound });
  renderSettings(settings);
}

function bindEvents() {
  ui.startAutomation.addEventListener("click", () => setAutomation(true));
  ui.stopAutomation.addEventListener("click", () => setAutomation(false));
  ui.saveCredentials.addEventListener("click", saveCredentials);
  ui.deleteCredentials.addEventListener("click", deleteCredentials);
  ui.testAutofill.addEventListener("click", () => commandActiveTab("TEST_AUTOFILL"));
  ui.testDetection.addEventListener("click", () => commandActiveTab("TEST_DETECTION"));
  ui.resetTimers.addEventListener("click", async () => {
    await runtimeMessage({ type: "CANCEL_RETRY" });
    await refresh();
  });
  ui.volume.addEventListener("input", updateSound);
  ui.mute.addEventListener("change", updateSound);
  ui.testSound.addEventListener("click", async () => {
    await updateSound();
    await runtimeMessage({
      type: "TEST_ALARM",
      sound: {
        volume: Number(ui.volume.value) / 100,
        muted: ui.mute.checked
      }
    });
  });
  ui.stopAlarm.addEventListener("click", () => runtimeMessage({ type: "STOP_ALARM" }));
  ui.saveDelays.addEventListener("click", saveDelayValues);
  document.querySelectorAll("[data-delay-mode]").forEach((button) => {
    button.addEventListener("click", () => setDelayMode(button.dataset.delayMode));
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") {
    return;
  }
  if (
    changes["visaflowx.status"] ||
    changes["visaflowx.settings"] ||
    changes["visaflowx.credentials"] ||
    changes["visaflowx.notificationState"]
  ) {
    refresh();
  }
});

buildWorkflowStages();
bindEvents();
refresh();
countdownTimer = setInterval(updateCountdown, 1000);

window.addEventListener("unload", () => {
  if (countdownTimer) {
    clearInterval(countdownTimer);
  }
});
