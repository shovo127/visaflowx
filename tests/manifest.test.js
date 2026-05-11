"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

assert.strictEqual(manifest.manifest_version, 3);
assert.strictEqual(manifest.name, "VisaFlowX");

for (const permission of ["storage", "notifications", "tabs", "scripting", "activeTab", "alarms", "offscreen"]) {
  assert(manifest.permissions.includes(permission), `Missing permission: ${permission}`);
}

assert(manifest.host_permissions.includes("https://appointment.ivacbd.com/*"));
assert(manifest.background.service_worker === "background/service-worker.js");
assert(manifest.action.default_popup === "popup/popup.html");
assert(manifest.commands["toggle-automation"]);

for (const file of [
  "background/service-worker.js",
  "background/offscreen.html",
  "background/offscreen.js",
  "content/detector.js",
  "content/autofill.js",
  "content/automation.js",
  "content/retry-engine.js",
  "content/otp-monitor.js",
  "content/notification-handler.js",
  "popup/popup.html",
  "popup/popup.css",
  "popup/popup.js",
  "utils/constants.js",
  "utils/storage.js",
  "utils/timers.js",
  "utils/dom-utils.js",
  "utils/parser.js",
  "utils/logger.js",
  "docs/ARCHITECTURE.md",
  "docs/TESTING.md",
  "assets/sounds/videoplayback.m4a",
  "README.md",
  "CHANGELOG.md",
  "LICENSE"
]) {
  assert(fs.existsSync(path.join(root, file)), `Missing file: ${file}`);
}

console.log("manifest.test.js passed");
