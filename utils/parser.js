(function initVisaFlowXParser(global) {
  "use strict";

  const RETRY_HINT = /(try again|retry|please wait|wait|after|later|cooldown|too many requests|rate limit|temporarily blocked)/i;
  const PAGE_ERROR_PATTERNS = Object.freeze([
    "404",
    "not found",
    "timeout",
    "timed out",
    "session expired",
    "service unavailable",
    "temporarily unavailable",
    "maintenance",
    "bad gateway",
    "gateway error",
    "too many requests",
    "rate limit"
  ]);

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function textIncludes(source, target) {
    const haystack = normalizeText(source).toLowerCase();
    const needle = normalizeText(target).toLowerCase();
    return Boolean(needle && haystack.includes(needle));
  }

  function parseRetryDelay(text) {
    const source = normalizeText(text).toLowerCase();
    if (!source || !RETRY_HINT.test(source)) return null;

    let ms = 0;
    const durationPattern = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m(?!s)|seconds?|secs?|s)\b/g;
    let match;
    while ((match = durationPattern.exec(source))) {
      const amount = Number(match[1]);
      const unit = match[2];
      if (/^(h|hour|hr)/.test(unit)) ms += amount * 60 * 60 * 1000;
      else if (/^(m|min|minute)/.test(unit)) ms += amount * 60 * 1000;
      else if (/^(s|sec|second)/.test(unit)) ms += amount * 1000;
    }

    const timer = source.match(/\b(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\b/);
    if (!ms && timer) {
      const hours = Number(timer[1] || 0);
      const minutes = Number(timer[2] || 0);
      const seconds = Number(timer[3] || 0);
      ms = ((hours * 3600) + (minutes * 60) + seconds) * 1000;
    }

    const bareMinutes = source.match(/\b(?:after|wait|retry)\s+(\d{1,3})\b/);
    if (!ms && bareMinutes) ms = Number(bareMinutes[1]) * 60 * 1000;

    if (!ms) return null;
    return {
      ms: Math.max(1000, Math.round(ms)),
      source: normalizeText(text).slice(0, 240)
    };
  }

  function detectPageError(text, url = "") {
    const source = normalizeText(text).toLowerCase();
    const href = String(url || "").toLowerCase();
    if (/\/404(?:\b|\/|\?)/.test(href)) return "404 page";
    const match = PAGE_ERROR_PATTERNS.find((pattern) => source.includes(pattern));
    if (match) return match;
    if (!source && typeof document !== "undefined" && document.readyState === "complete") return "blank page";
    return "";
  }

  const Parser = Object.freeze({
    PAGE_ERROR_PATTERNS,
    detectPageError,
    normalizeText,
    parseRetryDelay,
    textIncludes
  });

  global.VisaFlowX = Object.assign(global.VisaFlowX || {}, { Parser });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Parser;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
