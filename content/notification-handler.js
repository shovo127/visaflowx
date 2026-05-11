(function initVisaFlowXNotificationHandler(global) {
  "use strict";

  const { Sounds } = global.VisaFlowX;

  let alarm = null;
  let muted = false;

  async function playAlarm({ volume = 1, muted: shouldMute = false } = {}) {
    stopAlarm();
    muted = shouldMute === true;
    alarm = new Audio(Sounds.alarmUrl());
    alarm.loop = true;
    alarm.volume = muted ? 0 : Sounds.clampVolume(volume);
    await alarm.play();
    return { ok: true };
  }

  function stopAlarm() {
    if (!alarm) return;
    alarm.pause();
    alarm.currentTime = 0;
    alarm = null;
  }

  function muteAlarm() {
    muted = true;
    if (alarm) alarm.volume = 0;
  }

  function setVolume(volume) {
    muted = false;
    if (alarm) alarm.volume = Sounds.clampVolume(volume);
  }

  function isPlaying() {
    return Boolean(alarm);
  }

  const NotificationHandler = Object.freeze({
    isPlaying,
    muteAlarm,
    playAlarm,
    setVolume,
    stopAlarm
  });

  global.VisaFlowX = Object.assign(global.VisaFlowX || {}, { NotificationHandler });
})(typeof globalThis !== "undefined" ? globalThis : this);
