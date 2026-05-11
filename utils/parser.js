"use strict";

window.VisaFlowXParser = (() => {
  const COOLDOWN_HINT = /(try again|login|log in|sign in|signin|wait|after|later|cooldown|too many|attempt|temporarily|please wait|retry)/i;

  function parseNumber(value) {
    const number = Number(String(value || "").replace(/[^\d.]/g, ""));
    return Number.isFinite(number) ? number : 0;
  }

  function parseTimeParts(text) {
    const source = String(text || "").toLowerCase();
    let seconds = 0;
    let matched = false;

    const unitPattern = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|hr|h|minutes?|mins?|min|m|seconds?|secs?|sec|s)\b/g;
    let unitMatch = unitPattern.exec(source);
    while (unitMatch) {
      const value = parseNumber(unitMatch[1]);
      const unit = unitMatch[2];
      matched = true;
      if (/^h/.test(unit)) {
        seconds += value * 3600;
      } else if (/^m/.test(unit)) {
        seconds += value * 60;
      } else if (/^s/.test(unit)) {
        seconds += value;
      }
      unitMatch = unitPattern.exec(source);
    }

    if (matched) {
      return Math.ceil(seconds);
    }

    const hmsMatch = source.match(/\b(\d{1,2}):(\d{1,2}):(\d{2})\b/);
    if (hmsMatch) {
      return Number(hmsMatch[1]) * 3600 + Number(hmsMatch[2]) * 60 + Number(hmsMatch[3]);
    }

    const msMatch = source.match(/\b(\d{1,2}):(\d{2})\b/);
    if (msMatch) {
      return Number(msMatch[1]) * 60 + Number(msMatch[2]);
    }

    const slashMinuteMatch = source.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\b/);
    if (slashMinuteMatch) {
      return Math.max(Number(slashMinuteMatch[1]), Number(slashMinuteMatch[2])) * 60;
    }

    const impliedMinuteMatch = source.match(/(?:after|wait|later|login|log in|sign in)\D{0,16}(\d{1,2})\b/);
    if (impliedMinuteMatch) {
      return Number(impliedMinuteMatch[1]) * 60;
    }

    return 0;
  }

  function collectCandidateSnippets(text) {
    const lines = String(text || "")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);

    const candidates = [];
    for (const line of lines) {
      if (COOLDOWN_HINT.test(line)) {
        candidates.push(line.slice(0, 240));
      }
    }

    const compact = String(text || "").replace(/\s+/g, " ");
    const phrasePattern = /(try again|login|log in|sign in|signin|please wait|wait|after|later|cooldown|too many|temporarily|retry).{0,140}/gi;
    let phraseMatch = phrasePattern.exec(compact);
    while (phraseMatch) {
      candidates.push(phraseMatch[0]);
      phraseMatch = phrasePattern.exec(compact);
    }

    return Array.from(new Set(candidates));
  }

  function parseCooldownText(text) {
    const snippets = collectCandidateSnippets(text);
    let best = null;

    for (const snippet of snippets) {
      const seconds = parseTimeParts(snippet);
      if (seconds > 0 && (!best || seconds > best.seconds)) {
        best = {
          seconds,
          matchedText: snippet.trim()
        };
      }
    }

    return best;
  }

  function humanizeSeconds(totalSeconds) {
    const seconds = Math.max(0, Math.ceil(Number(totalSeconds) || 0));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;
    const parts = [];
    if (hours) {
      parts.push(`${hours}h`);
    }
    if (minutes) {
      parts.push(`${minutes}m`);
    }
    if (rest || !parts.length) {
      parts.push(`${rest}s`);
    }
    return parts.join(" ");
  }

  return {
    parseCooldownText,
    humanizeSeconds,
    parseTimeParts
  };
})();
