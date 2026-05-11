(function initConstants(global) {
  "use strict";

  const STATE = Object.freeze({
    IDLE: "IDLE",
    SCHEDULED: "SCHEDULED",
    DETECTING: "DETECTING",
    MONITORING: "MONITORING",
    RUNNING_RULE: "RUNNING_RULE",
    WAITING: "WAITING",
    RETRY_WAIT: "RETRY_WAIT",
    PROTECTED_CHALLENGE_WAIT: "PROTECTED_CHALLENGE_WAIT",
    OTP_REQUIRED: "OTP_REQUIRED",
    COMPLETED: "COMPLETED",
    STOPPED: "STOPPED",
    ERROR: "ERROR"
  });

  const ACTIONS = Object.freeze({
    CLICK: "click",
    FOCUS: "focus",
    FILL: "fill",
    BACK: "back",
    RELOAD: "reload",
    OPEN_URL: "openUrl",
    WAIT_FOR_SELECTOR: "waitForSelector",
    WAIT_FOR_TEXT: "waitForText",
    SCROLL_TO_ELEMENT: "scrollToElement",
    NOTIFY: "notify",
    STOP: "stop"
  });

  const CONDITIONS = Object.freeze({
    TEXT_APPEARS: "textAppears",
    TEXT_MISSING: "textMissing",
    SELECTOR_EXISTS: "selectorExists",
    SELECTOR_MISSING: "selectorMissing",
    URL_MATCHES: "urlMatches",
    BUTTON_ENABLED: "buttonEnabled",
    PAGE_ERROR: "pageError",
    PROTECTED_CHALLENGE: "protectedChallenge"
  });

  const REFRESH_MODES = Object.freeze({
    NONE: "none",
    SOFT: "soft",
    HARD: "hard"
  });

  const MESSAGE = Object.freeze({
    PING: "VFU_PING_CONTENT",
    START: "VFU_START_MONITORING",
    STOP: "VFU_STOP_MONITORING",
    CONTENT_STATE: "VFU_CONTENT_STATE",
    STATUS_UPDATE: "VFU_STATUS_UPDATE",
    LOG_EVENT: "VFU_LOG_EVENT",
    ENSURE_CONTENT: "VFU_ENSURE_CONTENT",
    GET_STATE: "VFU_GET_STATE",
    SAVE_PROFILE: "VFU_SAVE_PROFILE",
    DELETE_PROFILE: "VFU_DELETE_PROFILE",
    SET_ACTIVE_PROFILE: "VFU_SET_ACTIVE_PROFILE",
    SCHEDULE_SAVE: "VFU_SCHEDULE_SAVE",
    SCHEDULE_CLEAR: "VFU_SCHEDULE_CLEAR",
    START_AREA_SELECTOR: "VFU_START_AREA_SELECTOR",
    AREA_SELECTED: "VFU_AREA_SELECTED",
    RUN_RULE_ONCE: "VFU_RUN_RULE_ONCE",
    TEST_NOTIFICATION: "VFU_TEST_NOTIFICATION",
    CLEAR_LOGS: "VFU_CLEAR_LOGS",
    EXPORT_PROFILES: "VFU_EXPORT_PROFILES",
    IMPORT_PROFILES: "VFU_IMPORT_PROFILES",
    TEST_ALARM: "VFU_TEST_ALARM",
    STOP_ALARM: "VFU_STOP_ALARM",
    OTP_DETECTED: "VFU_OTP_DETECTED",
    SET_SETTINGS: "VFU_SET_SETTINGS"
  });

  const STORAGE_KEYS = Object.freeze({
    PROFILES: "vfu.profiles",
    ACTIVE_PROFILE_ID: "vfu.activeProfileId",
    SETTINGS: "vfu.settings",
    STATUS: "vfu.status",
    LOGS: "vfu.logs",
    SCHEDULES: "vfu.schedules"
  });

  const DEFAULT_SETTINGS = Object.freeze({
    autoInjectContent: true,
    notifications: true,
    soundEnabled: true,
    volume: 0.9,
    debugPanel: false,
    maxLogs: 80,
    safeChallengeMode: true
  });

  const DEFAULT_RETRY = Object.freeze({
    enabled: true,
    maxAttempts: 5,
    baseDelayMs: 15000,
    maxDelayMs: 180000,
    jitterPercent: 20,
    refreshMode: REFRESH_MODES.SOFT
  });

  const PROTECTED_CHALLENGE_SELECTORS = Object.freeze([
    "iframe[src*='challenges.cloudflare.com']",
    "iframe[src*='turnstile']",
    "iframe[src*='recaptcha']",
    "iframe[src*='hcaptcha']",
    ".cf-turnstile",
    "[data-sitekey]",
    "[class*='captcha' i]",
    "[id*='captcha' i]"
  ]);

  const PAGE_ERROR_PATTERNS = Object.freeze([
    "404",
    "not found",
    "service unavailable",
    "temporarily unavailable",
    "maintenance",
    "session expired",
    "network error",
    "timeout",
    "too many requests",
    "rate limit"
  ]);

  const OTP_INPUT_SELECTORS = Object.freeze([
    "input[autocomplete='one-time-code']",
    "input[inputmode='numeric']",
    "input[name*='otp' i]",
    "input[id*='otp' i]",
    "input[placeholder*='otp' i]",
    "input[name*='verification' i]",
    "input[id*='verification' i]",
    "input[placeholder*='verification' i]",
    "input[name*='security-code' i]",
    "input[id*='security-code' i]",
    "input[placeholder*='security code' i]",
    "input[aria-label*='otp' i]",
    "input[aria-label*='verification code' i]"
  ]);

  const OTP_TEXT_PATTERNS = Object.freeze([
    "otp",
    "one time password",
    "one-time password",
    "verification code",
    "enter code",
    "security code",
    "two factor",
    "2fa",
    "authentication code"
  ]);

  const DEFAULT_PROFILES = Object.freeze([
    {
      id: "ivac-safe",
      name: "IVAC",
      enabled: true,
      startUrl: "https://appointment.ivacbd.com/signin",
      urlPatterns: ["appointment.ivacbd.com"],
      monitorRegion: null,
      retry: { ...DEFAULT_RETRY },
      schedule: { enabled: false, recurring: "none", runAt: "" },
      rules: [
        {
          id: "ivac-protected-challenge-wait",
          name: "Wait for protected verification",
          enabled: true,
          condition: { type: CONDITIONS.PROTECTED_CHALLENGE },
          actions: [
            { type: ACTIONS.SCROLL_TO_ELEMENT, selector: "iframe[src*='challenges.cloudflare.com'], .cf-turnstile, [class*='captcha' i]", protectedChallengePolicy: "highlightOnly" },
            { type: ACTIONS.NOTIFY, title: "Verification required", message: "Complete verification manually. VisaFlowX will continue after the page changes." }
          ]
        }
      ]
    },
    {
      id: "goethe-monitor",
      name: "Goethe",
      enabled: true,
      startUrl: "",
      urlPatterns: ["goethe.de", "*.goethe.de/*"],
      monitorRegion: null,
      retry: { ...DEFAULT_RETRY },
      schedule: { enabled: false, recurring: "none", runAt: "" },
      rules: [
        {
          id: "goethe-book-now",
          name: "Detect Goethe booking action",
          enabled: false,
          condition: { type: CONDITIONS.TEXT_APPEARS, text: "Book", caseSensitive: false },
          actions: [
            { type: ACTIONS.CLICK, selector: "button, a, input[type='button'], input[type='submit']", text: "Book", requireVisible: true }
          ]
        }
      ]
    },
    {
      id: "university-portal",
      name: "University Portal",
      enabled: true,
      startUrl: "",
      urlPatterns: ["*.edu/*", "*.ac.*/*", "*university*"],
      monitorRegion: null,
      retry: { ...DEFAULT_RETRY },
      schedule: { enabled: false, recurring: "none", runAt: "" },
      rules: [
        {
          id: "university-registration-open",
          name: "Detect registration availability",
          enabled: false,
          condition: { type: CONDITIONS.TEXT_APPEARS, text: "Registration open", caseSensitive: false },
          actions: [
            { type: ACTIONS.CLICK, selector: "button, a, input[type='button'], input[type='submit']", text: "Register", requireVisible: true }
          ]
        }
      ]
    },
    {
      id: "generic-booking",
      name: "Booking System",
      enabled: true,
      startUrl: "",
      urlPatterns: ["*"],
      monitorRegion: null,
      retry: { ...DEFAULT_RETRY },
      schedule: { enabled: false, recurring: "none", runAt: "" },
      rules: [
        {
          id: "generic-available-click",
          name: "Click when availability appears",
          enabled: false,
          condition: { type: CONDITIONS.TEXT_APPEARS, text: "Available", caseSensitive: false },
          actions: [
            { type: ACTIONS.CLICK, selector: "button, a, input[type='button'], input[type='submit']", text: "Book", requireVisible: true }
          ]
        }
      ]
    },
    {
      id: "custom-workflow",
      name: "Custom",
      enabled: true,
      startUrl: "",
      urlPatterns: ["*"],
      monitorRegion: null,
      retry: { ...DEFAULT_RETRY },
      schedule: { enabled: false, recurring: "none", runAt: "" },
      rules: []
    }
  ]);

  const Constants = Object.freeze({
    ACTIONS,
    CONDITIONS,
    DEFAULT_PROFILES,
    DEFAULT_RETRY,
    DEFAULT_SETTINGS,
    MESSAGE,
    OTP_INPUT_SELECTORS,
    OTP_TEXT_PATTERNS,
    PAGE_ERROR_PATTERNS,
    PROTECTED_CHALLENGE_SELECTORS,
    REFRESH_MODES,
    STATE,
    STORAGE_KEYS
  });

  global.VisaFlowXUniversal = Object.assign(global.VisaFlowXUniversal || {}, { Constants });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Constants;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
