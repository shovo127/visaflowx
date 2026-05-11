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

function runSyntaxCheck() {
  execFileSync(process.execPath, [path.join(root, "tests/check-syntax.js")], { stdio: "inherit" });
}

function testManifest() {
  const manifest = JSON.parse(read("manifest.json"));
  assert(manifest.manifest_version === 3, "Manifest must be MV3");
  ["storage", "notifications", "tabs", "scripting", "activeTab", "alarms"].forEach((permission) => {
    assert(manifest.permissions.includes(permission), `Missing permission: ${permission}`);
  });
  assert(manifest.host_permissions.includes("<all_urls>"), "Universal host permission is required");
  assert(manifest.content_scripts[0].matches.includes("<all_urls>"), "Content script must support universal pages");
  assert(manifest.content_scripts[0].js.includes("content/otp-detector.js"), "OTP detector content script is missing");
  assert(manifest.commands["toggle-monitoring"], "Hotkey command is missing");
}

function testParser() {
  const Parser = require(path.join(root, "utils/parser.js"));
  assert(Parser.parseRetryDelay("Try again after 5 minutes").ms === 300000, "Failed to parse minute retry");
  assert(Parser.parseRetryDelay("Please wait 9 minutes 30 seconds").ms === 570000, "Failed to parse mixed retry");
  assert(Parser.parseRetryDelay("Retry after 45 seconds").ms === 45000, "Failed to parse second retry");
  assert(Parser.parseRetryDelay("Welcome available now") === null, "Parser should ignore non-retry text");
}

function testRuleEngineExport() {
  global.VisaFlowXUniversal = {
    Constants: require(path.join(root, "utils/constants.js")),
    Parser: require(path.join(root, "utils/parser.js")),
    DomUtils: {
      visibleText: () => "Available BOOK NOW",
      safeQuery: () => ({ disabled: false, getAttribute: () => null }),
      detectProtectedChallenge: () => ({ present: false }),
      isVisible: () => true,
      findByText: () => ({ disabled: false, getAttribute: () => null })
    }
  };
  const RuleEngine = require(path.join(root, "rules/rule-engine.js"));
  const result = RuleEngine.evaluateRules({
    rules: [{
      id: "r1",
      enabled: true,
      condition: { type: "textAppears", text: "Available" },
      actions: [{ type: "click", selector: "button" }]
    }]
  }, { root: {}, url: "https://example.com" });
  assert(result.matches.length === 1, "Rule engine should match visible text");
}

function testSafetyStaticScan() {
  const files = ["background/service-worker.js", "content/monitor.js", "content/otp-detector.js", "rules/action-runner.js", "utils/constants.js"];
  const combined = files.map(read).join("\n");
  [
    "turnstile.execute",
    "grecaptcha.execute",
    "hcaptcha.execute",
    "cf_clearance",
    "2captcha",
    "anticaptcha",
    "anti-captcha"
  ].forEach((needle) => {
    assert(!combined.toLowerCase().includes(needle), `Prohibited bypass reference found: ${needle}`);
  });
  assert(combined.includes("Protected verification can only be highlighted"), "Protected challenge guard is missing");
}

function testDefaultProfiles() {
  const Constants = require(path.join(root, "utils/constants.js"));
  const names = Constants.DEFAULT_PROFILES.map((profile) => profile.name);
  ["IVAC", "Goethe", "University Portal", "Booking System", "Custom"].forEach((name) => {
    assert(names.includes(name), `Missing default profile: ${name}`);
  });
}

async function testStorageDefaults() {
  global.VisaFlowXUniversal = { Constants: require(path.join(root, "utils/constants.js")) };
  delete require.cache[require.resolve(path.join(root, "utils/storage.js"))];
  const Storage = require(path.join(root, "utils/storage.js"));
  const defaults = await Storage.ensureDefaults();
  assert(defaults.profiles.length >= 5, "Storage defaults should include universal profiles");
  assert(defaults.activeProfileId, "Storage defaults should choose an active profile");
  assert(defaults.status.state === "IDLE", "Storage defaults should initialize idle status");
  assert(Array.isArray(defaults.schedules), "Storage defaults should initialize schedules");
}

function testOtpSafety() {
  const Constants = require(path.join(root, "utils/constants.js"));
  assert(Constants.STATE.OTP_REQUIRED === "OTP_REQUIRED", "OTP state is missing");
  assert(Constants.MESSAGE.OTP_DETECTED === "VFU_OTP_DETECTED", "OTP runtime message is missing");
  assert(Constants.OTP_INPUT_SELECTORS.length > 0, "OTP input selectors are missing");
  assert(Constants.OTP_TEXT_PATTERNS.includes("verification code"), "OTP text patterns are incomplete");

  const otpSource = read("content/otp-detector.js");
  assert(!otpSource.includes(".value"), "OTP detector must not read OTP input values");

  delete require.cache[require.resolve(path.join(root, "content/otp-detector.js"))];
  const otpInput = {
    tagName: "INPUT",
    disabled: false,
    readOnly: false,
    get value() {
      throw new Error("OTP value must not be read");
    },
    getAttribute(name) {
      return name === "autocomplete" ? "one-time-code" : "";
    },
    scrollIntoView() {
      this.scrolled = true;
    },
    focus() {
      this.focused = true;
    }
  };
  global.VisaFlowXUniversal = {
    Constants,
    DomUtils: {
      buildUniqueSelector: () => "#otp",
      highlightElement(element) {
        element.highlighted = true;
      },
      isVisible: () => true,
      safeQuery: (selector, rootNode) => selector.includes("one-time-code") ? rootNode.otpInput : null,
      safeQueryAll: () => [],
      visibleText: () => ""
    }
  };
  const OtpDetector = require(path.join(root, "content/otp-detector.js"));
  const result = OtpDetector.detect({ otpInput });
  assert(result.present && result.reason === "otp_input", "OTP detector should detect one-time-code input");
  assert(OtpDetector.focusOtpInput(otpInput), "OTP detector should focus the OTP input");
  assert(otpInput.focused && otpInput.highlighted, "OTP input should be focused and highlighted");
}

function testPopupSections() {
  const html = read("popup/popup.html");
  ["Dashboard", "Profiles", "Scheduler", "Monitor Rules", "Notifications", "Retry Engine", "Advanced Settings"].forEach((section) => {
    assert(html.includes(section), `Popup section is missing: ${section}`);
  });
  ["monitoredText", "lastActionMetric", "retryTimer", "lastError"].forEach((id) => {
    assert(html.includes(`id="${id}"`), `Live status field is missing: ${id}`);
  });
}

async function main() {
  runSyntaxCheck();
  testManifest();
  testParser();
  testRuleEngineExport();
  testSafetyStaticScan();
  testDefaultProfiles();
  await testStorageDefaults();
  testOtpSafety();
  testPopupSections();

  console.log("All VisaFlowX Universal tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
