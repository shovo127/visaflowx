"use strict";

window.VisaFlowXOtpMonitor = (() => {
  let handled = false;

  async function handleOtpPage(pageInfo) {
    if (handled) {
      return {
        alreadyHandled: true
      };
    }

    handled = true;
    const otpInput = (pageInfo && pageInfo.otpInput) || window.VisaFlowXDetector.detectOtpInput();
    if (otpInput) {
      window.VisaFlowXDom.highlight(
        otpInput,
        "visaflowx-otp-focus",
        "OTP page detected. Enter OTP manually."
      );
      otpInput.focus({ preventScroll: true });
    }

    await window.VisaFlowXNotify.status({
      state: "OTP Detected",
      currentPage: "OTP page",
      automationEnabled: false,
      otpDetected: true,
      timerStatus: "None",
      lastMessage: "OTP page detected. Automation stopped."
    });
    await window.VisaFlowXNotify.notification(
      "visaflowx-login-success",
      "Login Successful",
      "OTP page reached. Enter the OTP manually.",
      1000
    );
    await window.VisaFlowXNotify.notification(
      "visaflowx-otp-detected",
      "OTP Page Detected",
      "Enter the OTP manually. Alarm will continue until stopped.",
      1000
    );
    await window.VisaFlowXNotify.playAlarm();

    return {
      handled: true
    };
  }

  function reset() {
    handled = false;
  }

  return {
    handleOtpPage,
    reset
  };
})();
