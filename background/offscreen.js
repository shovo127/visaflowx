"use strict";

let audioContext = null;
let fallbackAlarmTimer = null;
let masterGain = null;
let alarmAudio = null;
let alarmPlaying = false;
let currentSound = {
  volume: 1,
  muted: false
};

function clampVolume(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : 1;
}

function ensureAudioContext() {
  if (!audioContext) {
    audioContext = new AudioContext();
    masterGain = audioContext.createGain();
    masterGain.connect(audioContext.destination);
  }

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  updateGain();
}

function updateGain() {
  const volume = clampVolume(currentSound.volume);
  if (alarmAudio) {
    alarmAudio.volume = volume;
    alarmAudio.muted = Boolean(currentSound.muted);
  }
  if (masterGain) {
    masterGain.gain.value = currentSound.muted ? 0 : volume;
  }
}

function ensureAlarmAudio() {
  if (!alarmAudio) {
    alarmAudio = new Audio(chrome.runtime.getURL("assets/sounds/videoplayback.m4a"));
    alarmAudio.loop = true;
    alarmAudio.preload = "auto";
  }
  updateGain();
  return alarmAudio;
}

function playBeep() {
  ensureAudioContext();
  const now = audioContext.currentTime;

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(880, now);
  oscillator.frequency.setValueAtTime(660, now + 0.16);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.85, now + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

  oscillator.connect(gain);
  gain.connect(masterGain);

  oscillator.start(now);
  oscillator.stop(now + 0.42);
}

function startFallbackAlarm() {
  if (fallbackAlarmTimer) {
    return;
  }

  playBeep();
  fallbackAlarmTimer = setInterval(playBeep, 900);
}

function startAlarm(sound) {
  currentSound = {
    ...currentSound,
    ...(sound || {})
  };
  updateGain();

  if (alarmPlaying) {
    return;
  }

  alarmPlaying = true;
  const audio = ensureAlarmAudio();
  audio.currentTime = 0;
  audio.play().catch(() => {
    startFallbackAlarm();
  });
}

function stopAlarm() {
  alarmPlaying = false;
  if (alarmAudio) {
    alarmAudio.pause();
    alarmAudio.currentTime = 0;
  }
  if (fallbackAlarmTimer) {
    clearInterval(fallbackAlarmTimer);
    fallbackAlarmTimer = null;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message && message.type) {
    case "OFFSCREEN_PLAY_ALARM":
      startAlarm(message.sound);
      sendResponse({ ok: true });
      break;

    case "OFFSCREEN_STOP_ALARM":
      stopAlarm();
      sendResponse({ ok: true });
      break;

    case "OFFSCREEN_UPDATE_SOUND":
      currentSound = {
        ...currentSound,
        ...(message.sound || {})
      };
      updateGain();
      sendResponse({ ok: true });
      break;

    default:
      sendResponse({ ok: false });
  }
  return false;
});
