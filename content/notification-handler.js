(function initNotificationHandler(global) {
  "use strict";

  let audio = null;

  function getAlarmUrl() {
    if (global.chrome?.runtime?.getURL) return chrome.runtime.getURL("assets/sounds/alarm.wav");
    return "";
  }

  async function playAlarm({ loop = true, volume = 0.9 } = {}) {
    stopAlarm();
    const url = getAlarmUrl();
    if (!url) return { ok: false, error: "Alarm URL unavailable" };
    audio = new Audio(url);
    audio.loop = loop;
    audio.volume = Math.max(0, Math.min(1, Number(volume)));
    await audio.play();
    return { ok: true };
  }

  function stopAlarm() {
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    audio = null;
  }

  function setVolume(volume) {
    if (audio) audio.volume = Math.max(0, Math.min(1, Number(volume)));
  }

  const NotificationHandler = Object.freeze({ playAlarm, setVolume, stopAlarm });
  global.VisaFlowXUniversal = Object.assign(global.VisaFlowXUniversal || {}, { NotificationHandler });
})(typeof globalThis !== "undefined" ? globalThis : this);
