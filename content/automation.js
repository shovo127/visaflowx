(function initVisaFlowXAutomation(global) {
  "use strict";

  if (global.__VisaFlowXAutomationReady) return;
  global.__VisaFlowXAutomationReady = true;

  const {
    Detector,
    DomUtils,
    NotificationHandler,
    OtpMonitor,
    RetryEngine,
    Storage,
    Timers
  } = global.VisaFlowX;

  class IvacAutomation {
    constructor() {
      this.running = false;
      this.credentials = {};
      this.retrySettings = {};
      this.settings = {};
      this.observer = null;
      this.lastSignInClickAt = 0;
      this.verificationSeen = false;
      this.retryEngine = new RetryEngine(this);
      this.evaluate = this.evaluate.bind(this);
      this.debouncedEvaluate = Timers.debounce(() => this.evaluate("dom_change"), 180);
    }

    async start(payload = {}) {
      this.stop("restart", { silent: true });
      const defaults = await Storage.ensureDefaults();
      this.credentials = payload.credentials || defaults.credentials;
      this.retrySettings = payload.retry || defaults.retry;
      this.settings = payload.settings || defaults.settings;
      this.running = true;
      this.lastSignInClickAt = 0;
      this.verificationSeen = false;
      this.retryEngine.reset();
      this.observe();
      await this.updateStatus({
        state: "DETECTING_PAGE",
        page: location.href,
        verificationState: "Checking",
        otpState: "Idle",
        lastAction: "Automation started",
        lastError: ""
      });
      await this.evaluate("start");
    }

    stop(reason = "manual", options = {}) {
      this.running = false;
      if (this.observer) this.observer.disconnect();
      this.observer = null;
      this.retryEngine.reset();
      window.removeEventListener("pageshow", this.debouncedEvaluate);
      window.removeEventListener("focus", this.debouncedEvaluate);
      if (!options.silent) {
        this.updateStatus({
          state: reason === "completed" ? "COMPLETED" : "IDLE",
          retryCountdownEndsAt: null,
          verificationState: "Idle",
          lastAction: reason === "completed" ? "Login workflow completed" : `Automation stopped (${reason})`
        });
      }
    }

    observe() {
      const target = document.documentElement || document.body;
      if (!target) return;
      this.observer = new MutationObserver(this.debouncedEvaluate);
      this.observer.observe(target, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["class", "style", "disabled", "aria-disabled", "hidden", "value"]
      });
      window.addEventListener("pageshow", this.debouncedEvaluate, { passive: true });
      window.addEventListener("focus", this.debouncedEvaluate, { passive: true });
    }

    async updateStatus(patch, options = {}) {
      const status = {
        page: location.href,
        activeSite: location.hostname,
        updatedAt: new Date().toISOString(),
        ...patch
      };
      await chrome.runtime.sendMessage({
        type: "STATUS_UPDATE",
        status,
        notify: options.notify || ""
      }).catch(() => {});
    }

    hasCredentials() {
      return Boolean(this.credentials.contactNumber && this.credentials.password);
    }

    async autofill(pageState) {
      if (!this.hasCredentials()) {
        await this.updateStatus({
          state: "ERROR",
          lastAction: "Credentials required",
          lastError: "Save contact number and password before starting automation."
        });
        return false;
      }

      const contactFilled = DomUtils.setInputValue(pageState.contact, this.credentials.contactNumber);
      const passwordFilled = DomUtils.setInputValue(pageState.password, this.credentials.password);
      if (!contactFilled || !passwordFilled) {
        await this.updateStatus({
          state: "ERROR",
          lastAction: "Autofill failed",
          lastError: "Could not find the IVAC contact or password field."
        });
        return false;
      }

      await this.updateStatus({
        state: "AUTOFILLING",
        verificationState: pageState.verification.present ? "Visible" : "Not visible",
        lastAction: "Credentials autofilled",
        lastError: ""
      });
      return true;
    }

    async waitForVerification(pageState) {
      this.verificationSeen = true;
      DomUtils.focusElement(pageState.verification.element);
      DomUtils.pulseHighlight(pageState.verification.element);
      await this.updateStatus({
        state: "WAITING_FOR_VERIFICATION",
        verificationState: "Waiting for manual completion",
        lastAction: "Verification detected. Complete it manually.",
        lastError: ""
      }, { notify: "verification" });
    }

    async clickSignIn(pageState) {
      const button = pageState.signInButton;
      if (!button || button.disabled || button.getAttribute("aria-disabled") === "true") {
        await this.updateStatus({
          state: "DETECTING_PAGE",
          lastAction: "Waiting for Sign In button",
          lastError: ""
        });
        return;
      }

      if (Date.now() - this.lastSignInClickAt < 5000) return;
      this.lastSignInClickAt = Date.now();
      DomUtils.focusElement(button);
      await Timers.sleep(120);
      button.click();
      await this.updateStatus({
        state: "SIGNING_IN",
        verificationState: this.verificationSeen ? "Completed or no longer visible" : "Not required",
        lastAction: "Sign In clicked",
        lastError: ""
      });
    }

    async evaluate(source = "manual") {
      if (!this.running) return;
      const pageState = Detector.detectPage();

      if (pageState.type === "otp") {
        this.stop("otp_detected", { silent: true });
        await OtpMonitor.trigger(pageState, this.settings);
        await this.updateStatus({
          state: "OTP_DETECTED",
          otpState: "Detected",
          retryCountdownEndsAt: null,
          lastAction: "OTP detected. Automation stopped for manual entry.",
          lastError: ""
        }, { notify: "otp" });
        return;
      }

      if (pageState.type === "completed") {
        this.stop("completed", { silent: true });
        await this.updateStatus({
          state: "COMPLETED",
          verificationState: "Completed",
          otpState: "Idle",
          retryCountdownEndsAt: null,
          lastAction: "Login workflow completed",
          lastError: ""
        });
        return;
      }

      if (await this.retryEngine.handlePageState(pageState, this.retrySettings)) return;

      if (pageState.type !== "signin") {
        await this.updateStatus({
          state: "DETECTING_PAGE",
          lastAction: source === "start" ? "Waiting for IVAC signin page" : "Detecting IVAC page",
          lastError: pageState.type === "unsupported" ? "Open https://appointment.ivacbd.com/signin" : ""
        });
        return;
      }

      if (!await this.autofill(pageState)) return;

      const latestVerification = Detector.detectVerification(document);
      if (latestVerification.present) {
        await this.waitForVerification({ ...pageState, verification: latestVerification });
        return;
      }

      await this.clickSignIn({ ...pageState, verification: latestVerification });
    }
  }

  const automation = global.VisaFlowXAutomation || new IvacAutomation();
  global.VisaFlowXAutomation = automation;
  global.VisaFlowX = Object.assign(global.VisaFlowX || {}, { automation, IvacAutomation });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    (async () => {
      switch (message?.type) {
        case "PING":
          return { ok: true, ready: true, running: automation.running, url: location.href };
        case "START_AUTOMATION":
          await automation.start(message);
          return { ok: true };
        case "STOP_AUTOMATION":
          automation.stop(message.reason || "manual");
          NotificationHandler.stopAlarm();
          return { ok: true };
        case "TEST_ALARM":
          await NotificationHandler.playAlarm({ volume: message.volume ?? 1, muted: false });
          return { ok: true };
        case "STOP_ALARM":
          NotificationHandler.stopAlarm();
          return { ok: true };
        case "MUTE_ALARM":
          NotificationHandler.muteAlarm();
          return { ok: true };
        case "SET_ALARM_VOLUME":
          NotificationHandler.setVolume(message.volume ?? 1);
          return { ok: true };
        default:
          return { ok: false, error: "Unknown content message" };
      }
    })()
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  });

  chrome.runtime.sendMessage({
    type: "STATUS_UPDATE",
    status: {
      state: "IDLE",
      page: location.href,
      verificationState: "Idle",
      otpState: "Idle",
      lastAction: "IVAC content script ready",
      lastError: ""
    }
  }).catch(() => {});
})(typeof globalThis !== "undefined" ? globalThis : this);
