(function initVisaFlowXNotifications(global) {
  "use strict";

  function hasNotifications() {
    return Boolean(global.chrome?.notifications?.create);
  }

  function createNotification(id, options) {
    return new Promise((resolve) => {
      if (!hasNotifications()) {
        resolve({ ok: false, reason: "notifications_unavailable" });
        return;
      }
      try {
        chrome.notifications.create(id, options, () => {
          const error = chrome.runtime?.lastError;
          if (error) resolve({ ok: false, reason: error.message });
          else resolve({ ok: true });
        });
      } catch (error) {
        resolve({ ok: false, reason: error.message });
      }
    });
  }

  async function send(Storage, kind, title, message) {
    const state = await Storage.ensureDefaults();
    if (state.settings.notifications === false) return { ok: false, reason: "disabled" };
    return createNotification(`vfx-${kind}-${Date.now()}`, {
      type: "basic",
      iconUrl: "assets/icons/icon128.png",
      title,
      message
    });
  }

  const Notifications = Object.freeze({
    createNotification,
    send
  });

  global.VisaFlowX = Object.assign(global.VisaFlowX || {}, { Notifications });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Notifications;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
