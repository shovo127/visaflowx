"use strict";

window.VisaFlowXTimers = (() => {
  function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, Math.max(0, Number(ms) || 0));
    });
  }

  function debounce(fn, wait) {
    let timer = null;
    return (...args) => {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        fn(...args);
      }, wait);
    };
  }

  function getActiveDelays(settings) {
    const mode = settings && settings.delayMode ? settings.delayMode : "balanced";
    const delays = settings && settings.delays ? settings.delays : {};
    return delays[mode] || delays.balanced || {
      autofill: 250,
      signIn: 900,
      retryBuffer: 2000,
      domWait: 600
    };
  }

  function formatRemaining(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes <= 0) {
      return `${seconds}s`;
    }
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }

  return {
    sleep,
    debounce,
    getActiveDelays,
    formatRemaining
  };
})();
