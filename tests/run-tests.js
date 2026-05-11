const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function runSyntaxCheck() {
  execFileSync(process.execPath, [path.join(root, "tests/check-syntax.js")], { stdio: "inherit" });
}

function testManifest() {
  const manifest = JSON.parse(read("manifest.json"));
  assert(manifest.manifest_version === 3, "Manifest must be MV3");
  assert(manifest.name === "VisaFlowX", "Extension name must be VisaFlowX");
  assert(!JSON.stringify(manifest).includes("<all_urls>"), "Manifest must not use universal host permissions");
  assert(manifest.host_permissions.length === 1, "Manifest should only have one host permission");
  assert(manifest.host_permissions[0] === "https://appointment.ivacbd.com/*", "Manifest must be IVAC-only");
  ["storage", "notifications", "tabs", "scripting", "activeTab", "alarms"].forEach((permission) => {
    assert(manifest.permissions.includes(permission), `Missing permission: ${permission}`);
  });

  const scripts = manifest.content_scripts[0].js;
  [
    "utils/storage.js",
    "utils/sounds.js",
    "utils/timers.js",
    "utils/parser.js",
    "utils/dom-utils.js",
    "content/notification-handler.js",
    "content/detector.js",
    "content/retry-engine.js",
    "content/otp-monitor.js",
    "content/automation.js"
  ].forEach((file) => assert(scripts.includes(file), `Missing content script: ${file}`));
  assert(manifest.content_scripts[0].matches[0] === "https://appointment.ivacbd.com/*", "Content script must be IVAC-only");
}

function testRequiredStructure() {
  [
    "manifest.json",
    "README.md",
    "LICENSE",
    ".gitignore",
    "background/service-worker.js",
    "content/detector.js",
    "content/automation.js",
    "content/retry-engine.js",
    "content/otp-monitor.js",
    "content/notification-handler.js",
    "popup/popup.html",
    "popup/popup.css",
    "popup/popup.js",
    "utils/storage.js",
    "utils/scheduler.js",
    "utils/notifications.js",
    "utils/sounds.js",
    "utils/timers.js",
    "utils/parser.js",
    "utils/dom-utils.js",
    "assets/icons/icon128.png",
    "assets/sounds/alarm.wav",
    "docs/ARCHITECTURE.md"
  ].forEach((file) => assert(exists(file), `Required file missing: ${file}`));

  [
    "rules/action-runner.js",
    "rules/rule-engine.js",
    "content/overlay-selector.js",
    "content/bootstrap.js",
    "content/monitor.js",
    "utils/constants.js",
    "utils/logger.js"
  ].forEach((file) => assert(!exists(file), `Universal file should be removed: ${file}`));
}

function testParser() {
  const Parser = require(path.join(root, "utils/parser.js"));
  assert(Parser.parseRetryDelay("Try again after 5 minutes").ms === 300000, "Failed minute retry parsing");
  assert(Parser.parseRetryDelay("Please wait 01:30").ms === 90000, "Failed timer retry parsing");
  assert(Parser.parseRetryDelay("Welcome available") === null, "Parser should ignore normal text");
  assert(Parser.detectPageError("Session expired") === "session expired", "Page error parser failed");
}

async function testStorageDefaults() {
  delete global.VisaFlowX;
  delete require.cache[require.resolve(path.join(root, "utils/storage.js"))];
  const Storage = require(path.join(root, "utils/storage.js"));
  const defaults = await Storage.ensureDefaults();
  assert(defaults.credentials.contactNumber === "", "Credentials default should be empty");
  assert(!Object.hasOwn(defaults.retry, "maxAttempts"), "Retry must not keep max attempts");
  assert(defaults.schedule.enabled === false, "Schedule should default disabled");
  assert(defaults.schedule.date === "" && defaults.schedule.time === "", "Schedule should use separate date and time fields");
  assert(defaults.settings.notifications === true, "Notifications should default enabled");
  assert(defaults.status.state === "IDLE", "Status should default idle");
}

function testScheduler() {
  delete require.cache[require.resolve(path.join(root, "utils/scheduler.js"))];
  const Scheduler = require(path.join(root, "utils/scheduler.js"));
  const future = new Date(Date.now() + 3600000);
  const parts = Scheduler.localDateParts(future);
  const nextRunAt = Scheduler.parseLocalRun(parts.date, parts.time);
  assert(nextRunAt > Date.now(), "Scheduler should parse a future local date/time");
  assert(Scheduler.preview({ enabled: true, nextRunAt }).startsWith("Next run:"), "Scheduler preview failed");
}

function testOtpSafety() {
  const otpSource = read("content/otp-monitor.js");
  const detectorSource = read("content/detector.js");
  assert(!otpSource.includes(".value"), "OTP monitor must not read OTP values");
  assert(detectorSource.includes("findOtpInput"), "OTP input detection is missing");
  assert(otpSource.includes("STOP") === false, "OTP monitor should signal runtime state instead of submitting forms");
}

function testPopupSections() {
  const html = read("popup/popup.html");
  ["Dashboard", "Credentials", "Scheduler", "Automation Status", "Notifications", "Settings"].forEach((section) => {
    assert(html.includes(section), `Popup section missing: ${section}`);
  });
  ["Start Automation", "Stop Automation", "Save Credentials", "Update", "Clear", "Schedule Run", "Test Notification"].forEach((label) => {
    assert(html.includes(label), `Quick action missing: ${label}`);
  });
  assert(!html.includes("Max Retry Attempts"), "Popup must not expose max retry attempts");
  assert(!html.includes("datetime-local"), "Scheduler must use separate date and time fields");
}

function testSafetyStaticScan() {
  const files = [
    "background/service-worker.js",
    "content/detector.js",
    "content/automation.js",
    "content/retry-engine.js",
    "content/otp-monitor.js",
    "README.md",
    "docs/SECURITY.md"
  ];
  const combined = files.map(read).join("\n").toLowerCase();
  assert(!combined.includes("maxattempts"), "Runtime must not contain max retry attempt logic");
  [
    "turnstile.execute",
    "grecaptcha.execute",
    "hcaptcha.execute",
    "cf_clearance",
    "2captcha",
    "anticaptcha",
    "anti-captcha",
    "solver"
  ].forEach((needle) => {
    assert(!combined.includes(needle), `Prohibited bypass reference found: ${needle}`);
  });
}

async function main() {
  runSyntaxCheck();
  testManifest();
  testRequiredStructure();
  testParser();
  await testStorageDefaults();
  testScheduler();
  testOtpSafety();
  testPopupSections();
  testSafetyStaticScan();
  console.log("All VisaFlowX IVAC tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
