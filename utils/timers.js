(function initTimers(global) {
  "use strict";

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  }

  function debounce(fn, wait = 150) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  function withTimeout(promise, ms, message = "Operation timed out") {
    let timer = null;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  function nextRetryDelay(attempt, retry = {}) {
    const baseDelayMs = Number(retry.baseDelayMs || 15000);
    const maxDelayMs = Number(retry.maxDelayMs || 180000);
    const jitterPercent = Number(retry.jitterPercent || 0);
    const exponential = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, Math.max(0, attempt - 1)));
    const jitter = exponential * (jitterPercent / 100);
    const delta = jitter ? Math.round((Math.random() * jitter * 2) - jitter) : 0;
    return Math.max(1000, Math.min(maxDelayMs, exponential + delta));
  }

  function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  const Timers = Object.freeze({ debounce, formatDuration, nextRetryDelay, sleep, withTimeout });

  global.VisaFlowXUniversal = Object.assign(global.VisaFlowXUniversal || {}, { Timers });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Timers;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
