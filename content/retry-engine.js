(function initVisaFlowXRetryEngine(global) {
  "use strict";

  const { Parser, Timers } = global.VisaFlowX;

  class RetryEngine {
    constructor(controller) {
      this.controller = controller;
      this.timer = null;
      this.attempt = 0;
      this.endsAt = null;
    }

    reset() {
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      this.attempt = 0;
      this.endsAt = null;
    }

    hasPendingRetry() {
      return Boolean(this.timer);
    }

    async handlePageState(pageState, retrySettings) {
      if (!retrySettings?.enabled || this.hasPendingRetry()) return false;
      const retryDelay = Parser.parseRetryDelay(pageState.text);
      if (retryDelay) {
        await this.schedule(retryDelay.ms, `Retry message: ${retryDelay.source}`, "reload", retrySettings);
        return true;
      }
      if (pageState.error) {
        const delay = Timers.nextRetryDelay(this.attempt + 1, retrySettings);
        await this.schedule(delay, `Recovering from ${pageState.error}`, "recover", retrySettings);
        return true;
      }
      return false;
    }

    async schedule(delayMs, reason, mode, retrySettings) {
      const maxAttempts = Number(retrySettings.maxAttempts || 5);
      if (this.attempt >= maxAttempts) {
        await this.controller.updateStatus({
          state: "ERROR",
          retryCountdownEndsAt: null,
          lastAction: "Retry limit reached",
          lastError: reason
        });
        return;
      }

      this.attempt += 1;
      this.endsAt = Date.now() + delayMs;
      await this.controller.updateStatus({
        state: "RETRY_COUNTDOWN",
        retryCountdownEndsAt: this.endsAt,
        lastAction: reason,
        lastError: ""
      }, { notify: "retry" });

      this.timer = setTimeout(() => {
        this.timer = null;
        this.perform(mode, retrySettings).catch((error) => {
          this.controller.updateStatus({
            state: "ERROR",
            retryCountdownEndsAt: null,
            lastAction: "Retry failed",
            lastError: error.message
          });
        });
      }, delayMs);
    }

    async perform(mode, retrySettings) {
      await this.controller.updateStatus({
        state: "DETECTING_PAGE",
        retryCountdownEndsAt: null,
        lastAction: `Retry attempt ${this.attempt}`,
        lastError: ""
      });

      if (mode === "recover") {
        try {
          history.back();
        } catch (_) {}
        await Timers.sleep(800);
      }

      if (retrySettings.refreshMode === "none") {
        await this.controller.evaluate("retry");
      } else if (retrySettings.refreshMode === "hard") {
        const url = new URL(location.href);
        url.searchParams.set("_vfx_retry", String(Date.now()));
        location.replace(url.toString());
      } else {
        location.reload();
      }
    }
  }

  global.VisaFlowX = Object.assign(global.VisaFlowX || {}, { RetryEngine });
})(typeof globalThis !== "undefined" ? globalThis : this);
