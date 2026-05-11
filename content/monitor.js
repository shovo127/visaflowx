(function initUniversalMonitor(global) {
  "use strict";

  const {
    ActionRunner,
    Constants,
    DomUtils,
    Logger,
    NotificationHandler,
    OtpDetector,
    Parser,
    RuleEngine,
    Timers
  } = global.VisaFlowXUniversal;

  const { MESSAGE, REFRESH_MODES, STATE } = Constants;

  class UniversalMonitor {
    constructor() {
      this.profile = null;
      this.settings = {};
      this.observer = null;
      this.running = false;
      this.retryTimer = null;
      this.retryAttempt = 0;
      this.ruleLastRun = new Map();
      this.challengeWasPresent = false;
      this.evaluate = Timers.debounce(() => this.evaluateNow("dom_change"), 180);
      this.onPageEvent = () => this.evaluateNow("page_event");
    }

    async start(profile, settings = {}) {
      this.stop("restart", { silent: true });
      this.profile = profile;
      this.settings = settings;
      this.running = true;
      this.retryAttempt = 0;
      this.ruleLastRun.clear();
      this.observe();
      window.addEventListener("pageshow", this.onPageEvent, { passive: true });
      window.addEventListener("focus", this.onPageEvent, { passive: true });
      await this.sendStatus({
        state: STATE.MONITORING,
        workflowStage: "Monitoring",
        currentRule: "",
        lastAction: `Started profile: ${profile.name}`,
        lastError: "",
        monitoring: true
      });
      await this.evaluateNow("start");
    }

    stop(reason = "manual", options = {}) {
      this.running = false;
      if (this.observer) this.observer.disconnect();
      this.observer = null;
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.retryTimer = null;
      window.removeEventListener("pageshow", this.onPageEvent);
      window.removeEventListener("focus", this.onPageEvent);
      if (!options.silent) {
        this.sendStatus({
          state: STATE.STOPPED,
          workflowStage: "Stopped",
          currentRule: "",
          retryCountdownEndsAt: null,
          lastAction: `Stopped (${reason})`,
          monitoring: false
        });
      }
    }

    observe() {
      this.observer = new MutationObserver(() => this.evaluate());
      const target = document.documentElement || document.body;
      if (target) {
        this.observer.observe(target, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: ["class", "style", "disabled", "aria-disabled", "hidden"]
        });
      }
    }

    async sendStatus(patch) {
      const payload = {
        state: patch.state || STATE.MONITORING,
        workflowStage: patch.workflowStage || "Monitoring",
        activeSite: location.hostname,
        currentUrl: location.href,
        activeProfileId: this.profile?.id || "",
        currentRule: patch.currentRule || "",
        retryCountdownEndsAt: patch.retryCountdownEndsAt ?? null,
        protectedChallenge: Boolean(patch.protectedChallenge),
        lastAction: patch.lastAction || "",
        lastError: patch.lastError || "",
        monitoring: patch.monitoring ?? this.running
      };
      try {
        await chrome.runtime.sendMessage({ type: MESSAGE.STATUS_UPDATE, status: payload });
      } catch (_) {}
    }

    async log(level, event, details = {}) {
      try {
        await chrome.runtime.sendMessage({ type: MESSAGE.LOG_EVENT, log: Logger.create(level, event, details) });
      } catch (_) {}
    }

    async handleOtpDetected(otp) {
      this.stop("otp_required", { silent: true });
      OtpDetector?.focusOtpInput?.(otp.element);

      if (this.settings.soundEnabled !== false) {
        try {
          await NotificationHandler?.playAlarm?.({
            loop: true,
            volume: this.settings.volume ?? Constants.DEFAULT_SETTINGS.volume
          });
        } catch (error) {
          await this.log("warn", "otp_alarm_blocked", { error: error.message });
        }
      }

      await this.sendStatus({
        state: STATE.OTP_REQUIRED,
        workflowStage: "OTP required",
        currentRule: "",
        retryCountdownEndsAt: null,
        lastAction: "OTP page detected. Automation stopped for manual entry.",
        lastError: "",
        monitoring: false
      });
      await this.log("warn", "otp_detected", {
        profileId: this.profile?.id || "",
        reason: otp.reason,
        selector: otp.selector || ""
      });

      try {
        await chrome.runtime.sendMessage({
          type: MESSAGE.OTP_DETECTED,
          reason: otp.reason,
          selector: otp.selector || "",
          status: {
            state: STATE.OTP_REQUIRED,
            workflowStage: "OTP required",
            currentUrl: location.href,
            activeSite: location.hostname,
            monitoring: false
          }
        });
      } catch (_) {}
    }

    async evaluateNow(source = "manual") {
      if (!this.running || !this.profile) return;

      const challenge = DomUtils.detectProtectedChallenge(document);
      const scope = RuleEngine.getScope(this.profile, document);
      const pageText = DomUtils.visibleText(scope);
      const retry = Parser.parseRetryDelay(pageText);
      const otp = OtpDetector?.detect?.(document);

      if (otp?.present) {
        await this.handleOtpDetected(otp);
        return;
      }

      if (challenge.present) {
        this.challengeWasPresent = true;
        DomUtils.highlightElement(challenge.element);
        await this.sendStatus({
          state: STATE.PROTECTED_CHALLENGE_WAIT,
          workflowStage: "Waiting for protected verification",
          protectedChallenge: true,
          lastAction: "Protected verification detected. Waiting for manual completion."
        });
      } else if (this.challengeWasPresent) {
        this.challengeWasPresent = false;
        await this.sendStatus({
          state: STATE.MONITORING,
          workflowStage: "Verification no longer visible",
          protectedChallenge: false,
          lastAction: "Verification area changed. Continuing workflow monitoring."
        });
      }

      if (retry && this.profile.retry?.enabled !== false && !this.retryTimer) {
        await this.startRetryCountdown(retry.ms, retry.source);
        return;
      }

      if (this.detectErrorPage(pageText)) {
        await this.recoverFromError(pageText);
        return;
      }

      const evaluation = RuleEngine.evaluateRules(this.profile, { root: document, scope, pageText, url: location.href });
      if (!evaluation.matches.length) {
        await this.sendStatus({
          state: challenge.present ? STATE.PROTECTED_CHALLENGE_WAIT : STATE.MONITORING,
          workflowStage: challenge.present ? "Waiting for protected verification" : "Monitoring",
          protectedChallenge: challenge.present,
          lastAction: source === "start" ? "No matching rule yet" : "Monitoring page changes"
        });
        return;
      }

      for (const { rule } of evaluation.matches) {
        if (!this.canRunRule(rule)) continue;
        await this.runRule(rule, evaluation.scope);
      }
    }

    detectErrorPage(pageText) {
      return Constants.PAGE_ERROR_PATTERNS.some((pattern) => Parser.textMatches(pageText, pattern, false)) || /\/404(?:\b|\/|\?)/i.test(location.href);
    }

    canRunRule(rule) {
      const last = this.ruleLastRun.get(rule.id) || 0;
      const cooldownMs = Number(rule.cooldownMs || 3000);
      return Date.now() - last >= cooldownMs;
    }

    async runRule(rule, scope) {
      this.ruleLastRun.set(rule.id, Date.now());
      await this.sendStatus({
        state: STATE.RUNNING_RULE,
        workflowStage: "Running rule",
        currentRule: rule.name,
        lastAction: `Running: ${rule.name}`
      });

      try {
        const results = await ActionRunner.runActions(rule.actions || [], { profile: this.profile, scope, rule });
        await this.log("info", "rule_ran", { profileId: this.profile.id, ruleId: rule.id, results });
        await this.sendStatus({
          state: STATE.MONITORING,
          workflowStage: "Monitoring",
          currentRule: rule.name,
          lastAction: `Completed rule: ${rule.name}`,
          lastError: ""
        });
      } catch (error) {
        await this.log("error", "rule_failed", { profileId: this.profile.id, ruleId: rule.id, error: error.message });
        await this.sendStatus({
          state: STATE.ERROR,
          workflowStage: "Rule error",
          currentRule: rule.name,
          lastError: error.message,
          lastAction: `Rule failed: ${rule.name}`
        });
        if (this.profile.retry?.enabled !== false) {
          const delay = Timers.nextRetryDelay(++this.retryAttempt, this.profile.retry);
          await this.startRetryCountdown(delay, error.message);
        }
      }
    }

    async runRuleOnce(ruleId) {
      if (!this.profile) return;
      const rule = (this.profile.rules || []).find((item) => item.id === ruleId) || (this.profile.rules || [])[0];
      if (rule) await this.runRule(rule, RuleEngine.getScope(this.profile, document));
    }

    async startRetryCountdown(delayMs, source) {
      if (this.retryTimer) clearTimeout(this.retryTimer);
      const maxAttempts = Number(this.profile.retry?.maxAttempts || 5);
      if (this.retryAttempt >= maxAttempts) {
        await this.sendStatus({
          state: STATE.ERROR,
          workflowStage: "Retry stopped",
          lastError: "Maximum retry attempts reached",
          lastAction: "Retry limit reached"
        });
        return;
      }

      const endsAt = Date.now() + delayMs;
      this.retryAttempt += 1;
      await this.log("info", "retry_started", { delayMs, attempt: this.retryAttempt, source });
      await this.sendStatus({
        state: STATE.RETRY_WAIT,
        workflowStage: "Retry countdown",
        retryCountdownEndsAt: endsAt,
        lastAction: `Retry scheduled from page text: ${source}`,
        currentRule: ""
      });

      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.performRetry().catch((error) => {
          this.sendStatus({ state: STATE.ERROR, workflowStage: "Retry error", lastError: error.message, lastAction: "Retry failed" });
        });
      }, delayMs);
    }

    async performRetry() {
      const mode = this.profile.retry?.refreshMode || REFRESH_MODES.SOFT;
      await this.sendStatus({
        state: STATE.MONITORING,
        workflowStage: "Retrying",
        retryCountdownEndsAt: null,
        lastAction: `Retry attempt ${this.retryAttempt}`
      });

      if (mode === REFRESH_MODES.NONE) {
        await this.evaluateNow("retry");
      } else if (mode === REFRESH_MODES.HARD) {
        const url = new URL(location.href);
        url.searchParams.set("_vfu_refresh", String(Date.now()));
        location.replace(url.toString());
      } else {
        location.reload();
      }
    }

    async recoverFromError(pageText) {
      const retry = this.profile.retry || Constants.DEFAULT_RETRY;
      await this.log("warn", "page_error_detected", { url: location.href, text: pageText.slice(0, 220) });
      await this.sendStatus({
        state: STATE.ERROR,
        workflowStage: "Recovering from error",
        lastError: "Page error detected",
        lastAction: "Attempting recovery"
      });

      if (retry.refreshMode === REFRESH_MODES.NONE) return;
      const delay = Timers.nextRetryDelay(++this.retryAttempt, retry);
      await this.startRetryCountdown(delay, "page error recovery");
    }
  }

  const monitor = global.VisaFlowXUniversalMonitor || new UniversalMonitor();
  global.VisaFlowXUniversalMonitor = monitor;
  global.VisaFlowXUniversal = Object.assign(global.VisaFlowXUniversal || {}, { UniversalMonitor, monitor });
})(typeof globalThis !== "undefined" ? globalThis : this);
