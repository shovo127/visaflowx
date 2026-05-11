"use strict";

window.VisaFlowXNotify = (() => {
  let lastNotificationAt = {};

  async function sendRuntimeMessage(message) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      window.VisaFlowXLogger.warn("runtime-message-failed", {
        type: message && message.type,
        error: error && error.message
      });
      return null;
    }
  }

  async function status(patch) {
    await sendRuntimeMessage({
      type: "STATUS_UPDATE",
      status: patch
    });
  }

  async function notification(id, title, message, minGapMs = 5000) {
    const now = Date.now();
    if (lastNotificationAt[id] && now - lastNotificationAt[id] < minGapMs) {
      return;
    }
    lastNotificationAt[id] = now;
    await sendRuntimeMessage({
      type: "SHOW_NOTIFICATION",
      id,
      title,
      message
    });
  }

  async function playAlarm() {
    await sendRuntimeMessage({ type: "PLAY_ALARM" });
  }

  async function stopAlarm() {
    await sendRuntimeMessage({ type: "STOP_ALARM" });
  }

  return {
    sendRuntimeMessage,
    status,
    notification,
    playAlarm,
    stopAlarm
  };
})();
