(function initContentBootstrap(global) {
  "use strict";

  if (global.__VisaFlowXUniversalBootstrapReady) {
    return;
  }
  global.__VisaFlowXUniversalBootstrapReady = true;

  const { Constants, NotificationHandler, OverlaySelector, monitor } = global.VisaFlowXUniversal;
  const { MESSAGE } = Constants;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    (async () => {
      switch (message?.type) {
        case MESSAGE.PING:
          return {
            ready: true,
            url: location.href,
            title: document.title,
            monitoring: Boolean(monitor.running)
          };
        case MESSAGE.START:
          await monitor.start(message.profile, message.settings || {});
          return { ok: true };
        case MESSAGE.STOP:
          monitor.stop(message.reason || "manual");
          NotificationHandler.stopAlarm();
          return { ok: true };
        case MESSAGE.START_AREA_SELECTOR:
          OverlaySelector.start();
          return { ok: true };
        case MESSAGE.RUN_RULE_ONCE:
          if (!monitor.running && message.profile) {
            await monitor.start(message.profile, {});
          }
          await monitor.runRuleOnce(message.ruleId);
          return { ok: true };
        case MESSAGE.TEST_ALARM:
          await NotificationHandler.playAlarm({ loop: true, volume: 0.9 });
          return { ok: true };
        case MESSAGE.STOP_ALARM:
          NotificationHandler.stopAlarm();
          return { ok: true };
        default:
          return { ok: false, error: "Unknown content message" };
      }
    })()
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  });

  chrome.runtime.sendMessage({
    type: MESSAGE.STATUS_UPDATE,
    status: {
      state: "IDLE",
      workflowStage: "Content ready",
      activeSite: location.hostname,
      currentUrl: location.href,
      monitoring: false,
      lastAction: "Content script ready"
    }
  }).catch(() => {});
})(typeof globalThis !== "undefined" ? globalThis : this);
