(function initParser(global) {
  "use strict";

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function textMatches(haystack, needle, caseSensitive = false) {
    const source = normalizeText(haystack);
    const target = normalizeText(needle);
    if (!target) return false;
    return caseSensitive ? source.includes(target) : source.toLowerCase().includes(target.toLowerCase());
  }

  function parseRetryDelay(text) {
    const source = normalizeText(text).toLowerCase();
    if (!source) return null;

    const likelyRetry = /(try again|retry|please wait|wait|after|later|cooldown|login after|too many requests|rate limit)/i.test(source);
    if (!likelyRetry) return null;

    let ms = 0;
    const durationPattern = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m(?!s)|seconds?|secs?|s)\b/g;
    let match;
    while ((match = durationPattern.exec(source))) {
      const amount = Number(match[1]);
      const unit = match[2];
      if (/^h|hour|hr/.test(unit)) ms += amount * 60 * 60 * 1000;
      else if (/^m(?!s)|min|minute/.test(unit)) ms += amount * 60 * 1000;
      else if (/^s|sec|second/.test(unit)) ms += amount * 1000;
    }

    const clockMatch = source.match(/\b(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\b/);
    if (!ms && clockMatch) {
      const hours = Number(clockMatch[1] || 0);
      const minutes = Number(clockMatch[2] || 0);
      const seconds = Number(clockMatch[3] || 0);
      ms = ((hours * 3600) + (minutes * 60) + seconds) * 1000;
    }

    const bareMinute = source.match(/\bafter\s+(\d{1,3})\b|\bwait\s+(\d{1,3})\b|\blogin\s+after\s+(\d{1,3})\b/);
    if (!ms && bareMinute) {
      ms = Number(bareMinute[1] || bareMinute[2] || bareMinute[3]) * 60 * 1000;
    }

    if (!ms) return null;
    return {
      ms: Math.max(1000, Math.round(ms)),
      source: normalizeText(text).slice(0, 240)
    };
  }

  function wildcardToRegExp(pattern) {
    const escaped = escapeRegExp(pattern || "*").replace(/\\\*/g, ".*");
    return new RegExp(`^${escaped}$`, "i");
  }

  function urlMatches(url, patterns = []) {
    if (!patterns.length) return true;
    return patterns.some((pattern) => {
      if (!pattern || pattern === "*") return true;
      if (pattern.startsWith("/") && pattern.endsWith("/")) {
        return new RegExp(pattern.slice(1, -1), "i").test(url);
      }
      return wildcardToRegExp(pattern.includes("*") ? pattern : `*${pattern}*`).test(url);
    });
  }

  const Parser = Object.freeze({
    escapeRegExp,
    normalizeText,
    parseRetryDelay,
    textMatches,
    urlMatches,
    wildcardToRegExp
  });

  global.VisaFlowXUniversal = Object.assign(global.VisaFlowXUniversal || {}, { Parser });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Parser;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
