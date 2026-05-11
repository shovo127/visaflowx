(function initLogger(global) {
  "use strict";

  const SENSITIVE_KEYS = ["password", "token", "secret", "otp", "authorization", "cookie"];

  function maskSensitive(value) {
    if (Array.isArray(value)) return value.map(maskSensitive);
    if (!value || typeof value !== "object") return value;

    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        const lower = key.toLowerCase();
        if (SENSITIVE_KEYS.some((part) => lower.includes(part))) {
          return [key, "[hidden]"];
        }
        return [key, maskSensitive(item)];
      })
    );
  }

  function entry(level, event, details = {}) {
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      level,
      event,
      details: maskSensitive(details),
      timestamp: new Date().toISOString()
    };
  }

  function write(level, event, details) {
    const log = entry(level, event, details);
    if (global.chrome && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        type: global.VisaFlowXUniversal?.Constants?.MESSAGE?.LOG_EVENT || "VFU_LOG_EVENT",
        log
      }).catch(() => {});
    }
    return log;
  }

  const Logger = Object.freeze({
    create: entry,
    debug: (event, details) => write("debug", event, details),
    info: (event, details) => write("info", event, details),
    warn: (event, details) => write("warn", event, details),
    error: (event, details) => write("error", event, details),
    maskSensitive
  });

  global.VisaFlowXUniversal = Object.assign(global.VisaFlowXUniversal || {}, { Logger });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Logger;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
