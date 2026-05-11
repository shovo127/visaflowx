"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const sourceDirs = ["background", "content", "popup", "utils"];
const jsFiles = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.name.endsWith(".js")) {
      jsFiles.push(full);
    }
  }
}

for (const dir of sourceDirs) {
  walk(path.join(root, dir));
}

for (const file of jsFiles) {
  const source = fs.readFileSync(file, "utf8");
  assert(!/\beval\s*\(/.test(source), `Unsafe eval found in ${file}`);
  assert(!/password\s*[:=]\s*console/i.test(source), `Sensitive logging risk in ${file}`);
}

const automation = fs.readFileSync(path.join(root, "content", "automation.js"), "utf8");
assert(automation.includes("MutationObserver"), "Automation must use MutationObserver");
assert(automation.includes("AutomationController"), "Automation must use centralized controller");
for (const state of [
  "IDLE",
  "PAGE_DETECTED",
  "AUTOFILLING",
  "WAITING_FOR_VERIFICATION",
  "VERIFICATION_COMPLETE",
  "SIGNING_IN",
  "OTP_DETECTED",
  "RETRY_WAIT",
  "COMPLETED",
  "ERROR"
]) {
  assert(
    automation.includes(state) || fs.readFileSync(path.join(root, "utils", "constants.js"), "utf8").includes(state),
    `Missing workflow state: ${state}`
  );
}

const popupHtml = fs.readFileSync(path.join(root, "popup", "popup.html"), "utf8");
for (const requiredText of [
  "Start Automation",
  "Test Autofill",
  "Automation Status",
  "Scheduler",
  "Schedule Run",
  "Clear Schedule",
  "Live Monitor",
  "Retry Timer",
  "Test Notifications",
  "Notifications",
  "Advanced Settings",
  "Developer Debug"
]) {
  assert(popupHtml.includes(requiredText), `Missing popup UI text: ${requiredText}`);
}

const serviceWorker = fs.readFileSync(path.join(root, "background", "service-worker.js"), "utf8");
assert(serviceWorker.includes("chrome.runtime.onStartup"), "Startup must reset automation state");
assert(serviceWorker.includes("injectContentScripts"), "Start flow must inject content scripts if missing");
assert(serviceWorker.includes("PING_CONTENT"), "Background must verify content script attachment");
assert(serviceWorker.includes("requireSignin"), "Start flow must require the signin URL");
assert(serviceWorker.includes("SCHEDULE_ALARM_NAME"), "Background must define schedule alarm");
assert(serviceWorker.includes("chrome.alarms.create(SCHEDULE_ALARM_NAME"), "Scheduler must use chrome.alarms");
assert(serviceWorker.includes("focusOrOpenSigninTab"), "Scheduled runs must open or focus signin tab");

const detector = fs.readFileSync(path.join(root, "content", "detector.js"), "utf8");
assert(detector.includes("LOGIN_PAGE"), "Detector must expose LOGIN_PAGE state");
assert(detector.includes("/signin"), "Detector must recognize the IVAC signin URL");

console.log("source-static.test.js passed");
