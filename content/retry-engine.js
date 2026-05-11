"use strict";

window.VisaFlowXRetryEngine = (() => {
  let currentRetryEndsAt = null;

  function isRetryActive() {
    return currentRetryEndsAt && currentRetryEndsAt > Date.now();
  }

  function clearLocalRetry() {
    currentRetryEndsAt = null;
  }

  async function inspectAndSchedule(settings) {
    if (isRetryActive()) {
      return {
        scheduled: true,
        alreadyActive: true,
        retryEndsAt: currentRetryEndsAt
      };
    }

    const pageText = window.VisaFlowXDetector.getVisiblePageText();
    const parsed = window.VisaFlowXParser.parseCooldownText(pageText);
    if (!parsed || parsed.seconds < 1) {
      return {
        scheduled: false
      };
    }

    const delays = window.VisaFlowXTimers.getActiveDelays(settings);
    const bufferSeconds = Math.ceil((delays.retryBuffer || 0) / 1000);
    const totalSeconds = parsed.seconds + bufferSeconds;
    currentRetryEndsAt = Date.now() + totalSeconds * 1000;

    const reason = `Retry after ${window.VisaFlowXParser.humanizeSeconds(totalSeconds)}: ${parsed.matchedText}`;
    await window.VisaFlowXNotify.sendRuntimeMessage({
      type: "SCHEDULE_RETRY",
      seconds: totalSeconds,
      reason,
      notify: true
    });

    return {
      scheduled: true,
      retryEndsAt: currentRetryEndsAt,
      seconds: totalSeconds,
      reason
    };
  }

  async function cancel() {
    clearLocalRetry();
    await window.VisaFlowXNotify.sendRuntimeMessage({ type: "CANCEL_RETRY" });
  }

  return {
    inspectAndSchedule,
    clearLocalRetry,
    cancel,
    isRetryActive
  };
})();
