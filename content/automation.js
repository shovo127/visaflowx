"use strict";

if (window.VisaFlowXAutomationReady) {
  if (window.VisaFlowXNotify && window.VisaFlowXDetector) {
    window.VisaFlowXNotify.sendRuntimeMessage({
      type: "CONTENT_READY",
      page: window.VisaFlowXDetector.detectPage().type,
      workflowState: window.VisaFlowXAutomation &&
        window.VisaFlowXAutomation.controller &&
        window.VisaFlowXAutomation.controller.state
        ? window.VisaFlowXAutomation.controller.state
        : "IDLE"
    });
  }
} else {
window.VisaFlowXAutomationReady = true;

window.VisaFlowXAutomation = (() => {
  const constants = window.VisaFlowXConstants || {};
  const STATES = constants.WORKFLOW_STATES || {
    IDLE: "IDLE",
    PAGE_DETECTED: "PAGE_DETECTED",
    AUTOFILLING: "AUTOFILLING",
    WAITING_FOR_VERIFICATION: "WAITING_FOR_VERIFICATION",
    VERIFICATION_COMPLETE: "VERIFICATION_COMPLETE",
    SIGNING_IN: "SIGNING_IN",
    OTP_DETECTED: "OTP_DETECTED",
    RETRY_WAIT: "RETRY_WAIT",
    ERROR: "ERROR"
  };
  const STATE_LABELS = constants.STATE_LABELS || {};

  const AutomationController = {
    running: false,
    observer: null,
    inTick: false,
    scheduledTick: null,
    lastSignInAt: 0,
    lastCaptchaNoticeAt: 0,
    lastVerificationNoticeAt: 0,
    state: STATES.IDLE,

    getStateLabel(state) {
      return STATE_LABELS[state] || state;
    },

    async setState(state, patch = {}) {
      this.state = state;
      const pageInfo = window.VisaFlowXDetector.detectPage();
      await window.VisaFlowXNotify.status({
        workflowState: state,
        state: this.getStateLabel(state),
        automationEnabled: this.running,
        currentPage: patch.currentPage || pageInfo.type,
        debug: {
          detectorState: pageInfo.type,
          workflowState: state,
          contentScriptStatus: "Attached",
          lastRuntimeMessage: "STATUS_UPDATE",
          lastError: patch.lastError || ""
        },
        ...patch
      });
    },

    scheduleTick(reason, wait = 200) {
      if (this.scheduledTick) {
        clearTimeout(this.scheduledTick);
      }
      this.scheduledTick = setTimeout(() => {
        this.scheduledTick = null;
        this.tick(reason);
      }, Math.max(0, wait));
    },

    stopObserver() {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
    },

    startObserver(settings) {
      this.stopObserver();
      const delays = window.VisaFlowXTimers.getActiveDelays(settings);
      const debounced = window.VisaFlowXTimers.debounce(() => {
        if (this.running) {
          this.scheduleTick("dom-change", delays.domWait);
        }
      }, Math.max(150, delays.domWait));

      this.observer = new MutationObserver(debounced);
      this.observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["value", "disabled", "aria-disabled", "class", "style"]
      });
    },

    async start() {
      const credentials = await window.VisaFlowXStorage.getCredentials();
      if (!credentials.contactNumber || !credentials.password) {
        await this.setState(STATES.ERROR, {
          automationEnabled: false,
          lastError: "Credentials are missing.",
          actionRequired: "Save contact number and password, then press Start Automation.",
          lastMessage: "Cannot start without saved credentials."
        });
        return {
          ok: false,
          error: "Credentials are missing."
        };
      }

      const settings = await window.VisaFlowXStorage.saveSettings({ automationEnabled: true });
      this.running = true;
      window.VisaFlowXOtpMonitor.reset();
      this.startObserver(settings);
      await this.setState(STATES.IDLE, {
        currentPage: window.VisaFlowXDetector.detectPage().type,
        captchaState: "Unknown",
        otpDetected: false,
        lastError: "",
        actionRequired: "Keep this IVAC tab open. VisaFlowX will detect the login form.",
        lastMessage: "Automation running"
      });
      this.scheduleTick("start", 0);
      return {
        ok: true
      };
    },

    async stop() {
      this.running = false;
      this.stopObserver();
      window.VisaFlowXDom.clearFloatingLabel();
      await window.VisaFlowXStorage.saveSettings({ automationEnabled: false });
      await this.setState(STATES.IDLE, {
        automationEnabled: false,
        actionRequired: "Press Start Automation when ready.",
        lastMessage: "Automation stopped"
      });
      return {
        ok: true
      };
    },

    async stopForOtp() {
      this.running = false;
      this.stopObserver();
      await window.VisaFlowXStorage.saveSettings({ automationEnabled: false });
    },

    async handleRetry(settings) {
      const retry = await window.VisaFlowXRetryEngine.inspectAndSchedule(settings);
      if (!retry.scheduled) {
        return false;
      }

      await this.setState(STATES.RETRY_WAIT, {
        timerStatus: "Running",
        retryEndsAt: retry.retryEndsAt,
        actionRequired: "No action required. VisaFlowX will retry automatically.",
        lastMessage: retry.reason || "Retry countdown active"
      });
      return true;
    },

    async fillCredentials(settings) {
      const delays = window.VisaFlowXTimers.getActiveDelays(settings);
      const credentials = await window.VisaFlowXStorage.getCredentials();
      await this.setState(STATES.AUTOFILLING, {
        currentPage: "LOGIN_PAGE",
        actionRequired: "No action required. Filling saved credentials.",
        lastMessage: "Autofilling credentials"
      });
      await window.VisaFlowXTimers.sleep(delays.autofill);

      const result = await window.VisaFlowXAutofill.fillCredentials(credentials);
      if (!result.ok) {
        await this.setState(STATES.ERROR, {
          currentPage: "LOGIN_PAGE",
          lastError: result.reason,
          actionRequired: "Refresh the IVAC page or update selectors if the form changed.",
          lastMessage: result.reason
        });
        return false;
      }

      return true;
    },

    async waitForVerification(captcha) {
      if (!captcha.present) {
        await window.VisaFlowXNotify.status({
          captchaState: "Not detected",
          debug: {
            detectorState: window.VisaFlowXDetector.detectPage().type,
            workflowState: this.state,
            contentScriptStatus: "Attached",
            lastRuntimeMessage: "STATUS_UPDATE"
          },
          actionRequired: "No captcha widget detected. VisaFlowX will continue if Sign In is ready."
        });
        return true;
      }

      if (captcha.verified) {
        window.VisaFlowXDom.clearFloatingLabel();
        await this.setState(STATES.VERIFICATION_COMPLETE, {
          captchaState: "Verified",
          actionRequired: "No action required. VisaFlowX will click Sign In.",
          lastMessage: "Cloudflare verification completed"
        });

        const now = Date.now();
        if (now - this.lastVerificationNoticeAt > 15000) {
          this.lastVerificationNoticeAt = now;
          await window.VisaFlowXNotify.notification(
            "visaflowx-verification-complete",
            "Verification Complete",
            "Cloudflare verification is complete. VisaFlowX will sign in now.",
            1000
          );
        }
        return true;
      }

      if (captcha.element) {
        window.VisaFlowXDom.highlight(
          captcha.element,
          "visaflowx-captcha-focus",
          "Complete Cloudflare verification manually. VisaFlowX will continue automatically."
        );
        window.focus();
      }

      const now = Date.now();
      if (now - this.lastCaptchaNoticeAt > 15000) {
        this.lastCaptchaNoticeAt = now;
        await window.VisaFlowXNotify.notification(
          "visaflowx-captcha-waiting",
          "Waiting for Verification",
          "Complete Cloudflare verification manually. VisaFlowX will continue automatically."
        );
      }

      await this.setState(STATES.WAITING_FOR_VERIFICATION, {
        currentPage: "LOGIN_PAGE",
        captchaState: "Waiting",
        actionRequired: "Complete the Cloudflare verification in the highlighted area.",
        lastMessage: "Waiting for Cloudflare verification"
      });
      return false;
    },

    async clickSignIn(settings) {
      const now = Date.now();
      if (now - this.lastSignInAt < 5000) {
        return false;
      }

      const button = window.VisaFlowXDetector.findSignInButton();
      if (!window.VisaFlowXDetector.isSignInReady(button)) {
        await this.setState(STATES.PAGE_DETECTED, {
          currentPage: "LOGIN_PAGE",
          actionRequired: "Wait for the Sign In button to become available.",
          lastMessage: "Sign In button is not ready"
        });
        return false;
      }

      const delays = window.VisaFlowXTimers.getActiveDelays(settings);
      await this.setState(STATES.SIGNING_IN, {
        currentPage: "LOGIN_PAGE",
        actionRequired: "No action required. VisaFlowX is signing in.",
        lastMessage: "Clicking Sign In"
      });
      await window.VisaFlowXTimers.sleep(delays.signIn);
      this.lastSignInAt = Date.now();

      const clicked = window.VisaFlowXDom.clickElement(button);
      if (clicked) {
        await window.VisaFlowXNotify.status({
          lastLoginAttempt: new Date().toISOString(),
          lastMessage: "Sign In clicked"
        });
      }
      return clicked;
    },

    async handlePageState(pageInfo, settings) {
      await window.VisaFlowXNotify.status({
        currentPage: pageInfo.type,
        automationEnabled: true,
        debug: {
          detectorState: pageInfo.type,
          workflowState: this.state,
          contentScriptStatus: "Attached",
          lastRuntimeMessage: "STATUS_UPDATE"
        }
      });

      if (pageInfo.type === window.VisaFlowXDetector.PAGE_TYPES.OTP) {
        await this.stopForOtp();
        await this.setState(STATES.OTP_DETECTED, {
          currentPage: "OTP_PAGE",
          automationEnabled: false,
          otpDetected: true,
          timerStatus: "None",
          actionRequired: "Enter OTP manually. Alarm will continue until stopped.",
          lastMessage: "OTP page detected"
        });
        await window.VisaFlowXOtpMonitor.handleOtpPage(pageInfo);
        return false;
      }

      if (pageInfo.type === window.VisaFlowXDetector.PAGE_TYPES.SESSION_EXPIRED) {
        await this.setState(STATES.ERROR, {
          state: "Session Expired",
          currentPage: "SESSION_EXPIRED_PAGE",
          lastError: pageInfo.reason,
          actionRequired: "Refresh the IVAC page and start automation again.",
          lastMessage: pageInfo.reason
        });
        await window.VisaFlowXNotify.notification(
          "visaflowx-session-expired",
          "Session Expired",
          "Refresh the IVAC page and start automation again.",
          10000
        );
        return false;
      }

      if (pageInfo.type === window.VisaFlowXDetector.PAGE_TYPES.MAINTENANCE) {
        await this.setState(STATES.ERROR, {
          currentPage: "MAINTENANCE_PAGE",
          lastError: pageInfo.reason,
          actionRequired: "Wait until the IVAC portal is available again.",
          lastMessage: pageInfo.reason
        });
        await window.VisaFlowXNotify.notification(
          "visaflowx-maintenance",
          "Maintenance Detected",
          "The IVAC page appears to be under maintenance.",
          10000
        );
        return false;
      }

      if (
        pageInfo.type === window.VisaFlowXDetector.PAGE_TYPES.RATE_LIMIT ||
        pageInfo.type === window.VisaFlowXDetector.PAGE_TYPES.ERROR
      ) {
        const scheduled = await this.handleRetry(settings);
        if (scheduled) {
          return false;
        }
        await this.setState(STATES.ERROR, {
          currentPage: pageInfo.type,
          lastError: pageInfo.reason,
          actionRequired: "Check the IVAC page message, then retry when safe.",
          lastMessage: pageInfo.reason
        });
        await window.VisaFlowXNotify.notification(
          "visaflowx-error-detected",
          "Error Detected",
          pageInfo.reason || "The IVAC page reported an error.",
          10000
        );
        return false;
      }

      if (pageInfo.type !== window.VisaFlowXDetector.PAGE_TYPES.LOGIN) {
        await this.setState(STATES.IDLE, {
          currentPage: pageInfo.type,
          actionRequired: "Open the IVAC sign-in page.",
          lastMessage: "Waiting for IVAC login page"
        });
        this.scheduleTick("unknown-page", 1000);
        return false;
      }

      await this.setState(STATES.PAGE_DETECTED, {
        currentPage: "LOGIN_PAGE",
        actionRequired: "No action required. VisaFlowX is preparing login.",
        lastMessage: "Login page detected"
      });
      return true;
    },

    async tick(reason) {
      if (!this.running || this.inTick) {
        return;
      }

      this.inTick = true;
      try {
        const settings = await window.VisaFlowXStorage.getSettings();
        if (!settings.automationEnabled) {
          this.running = false;
          this.stopObserver();
          return;
        }

        const pageInfo = window.VisaFlowXDetector.detectPage();
        const canContinue = await this.handlePageState(pageInfo, settings);
        if (!canContinue) {
          return;
        }

        const retryScheduled = await this.handleRetry(settings);
        if (retryScheduled) {
          return;
        }

        const filled = await this.fillCredentials(settings);
        if (!filled) {
          this.scheduleTick("autofill-missing", 1200);
          return;
        }

        const captcha = window.VisaFlowXDetector.detectCaptcha();
        const verificationReady = await this.waitForVerification(captcha);
        if (!verificationReady) {
          this.scheduleTick("captcha-wait", 1000);
          return;
        }

        await this.clickSignIn(settings);
        this.scheduleTick("post-signin", 1500);
      } catch (error) {
        window.VisaFlowXLogger.error("automation-controller-failed", {
          reason,
          error: error && error.message
        });
        await this.setState(STATES.ERROR, {
          lastError: error && error.message ? error.message : "Automation error",
          actionRequired: "Stop automation, refresh the page, and try again.",
          lastMessage: error && error.message ? error.message : "Automation error"
        });
      } finally {
        this.inTick = false;
      }
    },

    async testDetection() {
      const pageInfo = window.VisaFlowXDetector.detectPage();
      const captcha = window.VisaFlowXDetector.detectCaptcha();
      await window.VisaFlowXNotify.status({
        workflowState: STATES.PAGE_DETECTED,
        state: this.getStateLabel(STATES.PAGE_DETECTED),
        currentPage: pageInfo.type,
        captchaState: captcha.present ? (captcha.verified ? "Verified" : "Waiting") : "Not detected",
        actionRequired: "Review the detection result shown in the popup.",
        lastError: "",
        lastMessage: `Detection: ${pageInfo.type}`
      });
      await window.VisaFlowXNotify.notification(
        "visaflowx-test-detection",
        "VisaFlowX Detection Test",
        `${pageInfo.type}. Captcha: ${captcha.present ? (captcha.verified ? "verified" : "waiting") : "not detected"}.`,
        1000
      );
      return {
        ok: true,
        page: pageInfo.type,
        workflowState: this.state,
        captcha
      };
    },

    getSnapshot() {
      const pageInfo = window.VisaFlowXDetector.detectPage();
      const captcha = window.VisaFlowXDetector.detectCaptcha();
      return {
        ok: true,
        page: pageInfo.type,
        reason: pageInfo.reason,
        workflowState: this.state,
        running: this.running,
        captchaState: captcha.present ? (captcha.verified ? "Verified" : "Waiting") : "Not detected",
        contentScriptStatus: "Attached"
      };
    },

    async testAutofill() {
      const settings = await window.VisaFlowXStorage.getSettings();
      const result = await this.fillCredentials(settings);
      await window.VisaFlowXNotify.status({
        actionRequired: result ? "Autofill test completed." : "Check saved credentials and the visible login form.",
        lastMessage: result ? "Autofill test completed" : "Autofill test failed"
      });
      return {
        ok: Boolean(result)
      };
    }
  };

  function init() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      (async () => {
        switch (message && message.type) {
          case "START_AUTOMATION":
            sendResponse(await AutomationController.start());
            break;

          case "STOP_AUTOMATION":
            sendResponse(await AutomationController.stop());
            break;

          case "TEST_DETECTION":
            sendResponse(await AutomationController.testDetection());
            break;

          case "TEST_AUTOFILL":
            sendResponse(await AutomationController.testAutofill());
            break;

          case "PING_CONTENT":
            sendResponse(AutomationController.getSnapshot());
            break;

          case "RETRY_ALARM_FIRED":
            window.VisaFlowXRetryEngine.clearLocalRetry();
            AutomationController.running = true;
            await window.VisaFlowXStorage.saveSettings({ automationEnabled: true });
            await AutomationController.setState(STATES.IDLE, {
              timerStatus: "Retry ready",
              retryEndsAt: null,
              actionRequired: "No action required. VisaFlowX is retrying now.",
              lastMessage: "Retry countdown finished. Trying login now."
            });
            AutomationController.scheduleTick("retry-fired", 0);
            sendResponse({ ok: true });
            break;

          default:
            sendResponse({ ok: false, error: "Unknown content message" });
        }
      })().catch((error) => {
        sendResponse({
          ok: false,
          error: error && error.message ? error.message : "Unknown content error"
        });
      });
      return true;
    });

    window.VisaFlowXStorage.getSettings().then((settings) => {
      window.VisaFlowXNotify.sendRuntimeMessage({
        type: "CONTENT_READY",
        page: window.VisaFlowXDetector.detectPage().type,
        workflowState: AutomationController.state
      });

      if (settings.automationEnabled) {
        AutomationController.running = true;
        AutomationController.startObserver(settings);
        AutomationController.setState(STATES.IDLE, {
          automationEnabled: true,
          actionRequired: "No action required. Continuing the active workflow.",
          lastMessage: "Workflow session restored on IVAC page"
        });
        AutomationController.scheduleTick("restore-active-workflow", 0);
        return;
      }

      window.VisaFlowXNotify.status({
        workflowState: STATES.IDLE,
        state: AutomationController.getStateLabel(STATES.IDLE),
        automationEnabled: false,
        actionRequired: "Press Start Automation from the popup.",
        lastMessage: "Content engine ready"
      });
    });
  }

  init();

  return {
    start: () => AutomationController.start(),
    stop: () => AutomationController.stop(),
    tick: (reason) => AutomationController.tick(reason),
    testDetection: () => AutomationController.testDetection(),
    testAutofill: () => AutomationController.testAutofill(),
    controller: AutomationController
  };
})();
}
