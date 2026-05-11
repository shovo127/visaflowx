(function initVisaFlowXSounds(global) {
  "use strict";

  function clampVolume(volume) {
    return Math.max(0, Math.min(1, Number(volume)));
  }

  function alarmUrl() {
    return chrome.runtime.getURL("assets/sounds/alarm.wav");
  }

  const Sounds = Object.freeze({
    alarmUrl,
    clampVolume
  });

  global.VisaFlowX = Object.assign(global.VisaFlowX || {}, { Sounds });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Sounds;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
