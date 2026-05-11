"use strict";

window.VisaFlowXLogger = (() => {
  const prefix = "VisaFlowX";

  function timestamp() {
    return new Date().toISOString();
  }

  function sanitize(value) {
    if (value == null) {
      return value;
    }
    if (typeof value === "string") {
      return value.replace(/password\s*[:=]\s*\S+/gi, "password=[hidden]");
    }
    if (typeof value === "object") {
      const clone = Array.isArray(value) ? [] : {};
      Object.keys(value).forEach((key) => {
        if (/password|token|secret|otp/i.test(key)) {
          clone[key] = "[hidden]";
        } else {
          clone[key] = sanitize(value[key]);
        }
      });
      return clone;
    }
    return value;
  }

  function log(level, event, details) {
    const payload = {
      time: timestamp(),
      event,
      details: sanitize(details)
    };
    if (level === "error") {
      console.error(prefix, payload);
      return;
    }
    if (level === "warn") {
      console.warn(prefix, payload);
      return;
    }
    console.info(prefix, payload);
  }

  return {
    info: (event, details) => log("info", event, details),
    warn: (event, details) => log("warn", event, details),
    error: (event, details) => log("error", event, details)
  };
})();
