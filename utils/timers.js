(function initVisaFlowXTimers(global) {
  "use strict";

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  }

  function debounce(fn, waitMs = 150) {
    let timer = null;
    return function debounced(...args) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fn.apply(this, args);
      }, waitMs);
    };
  }

  function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.ceil(Number(ms) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  function nextRetryDelay(attempt, retry = {}) {
    const baseDelayMs = Number(retry.baseDelayMs || 15000);
    const maxDelayMs = Number(retry.maxDelayMs || 180000);
    const multiplier = Math.max(1, Number(attempt || 1));
    return Math.min(maxDelayMs, baseDelayMs * multiplier);
  }

  const Timers = Object.freeze({
    debounce,
    formatDuration,
    nextRetryDelay,
    sleep
  });

  global.VisaFlowX = Object.assign(global.VisaFlowX || {}, { Timers });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Timers;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
