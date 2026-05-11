(function initVisaFlowXOtpMonitor(global) {
  "use strict";

  const { Detector, DomUtils, NotificationHandler } = global.VisaFlowX;

  async function trigger(pageState, settings = {}) {
    const otp = pageState?.otp || Detector.detectOtp(document);
    if (otp.input) {
      DomUtils.focusElement(otp.input);
      DomUtils.pulseHighlight(otp.input, true);
    }

    if (settings.soundEnabled !== false) {
      try {
        await NotificationHandler.playAlarm({
          volume: settings.volume ?? 1,
          muted: settings.alarmMuted === true
        });
      } catch (_) {
        // Browser autoplay policy may block audio until the user interacts with the page.
      }
    }

    await chrome.runtime.sendMessage({
      type: "OTP_DETECTED",
      reason: otp.reason || "otp_page",
      url: location.href
    }).catch(() => {});

    return { ok: true, otp };
  }

  const OtpMonitor = Object.freeze({ trigger });
  global.VisaFlowX = Object.assign(global.VisaFlowX || {}, { OtpMonitor });
})(typeof globalThis !== "undefined" ? globalThis : this);
