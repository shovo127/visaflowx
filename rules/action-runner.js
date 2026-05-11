(function initActionRunner(global) {
  "use strict";

  const Constants = global.VisaFlowXUniversal?.Constants;
  const DomUtils = global.VisaFlowXUniversal?.DomUtils;
  const Parser = global.VisaFlowXUniversal?.Parser;
  const Timers = global.VisaFlowXUniversal?.Timers;
  const Logger = global.VisaFlowXUniversal?.Logger;

  function challengePolicyAllowsOnlyHighlight(action) {
    return action.protectedChallengePolicy === "highlightOnly";
  }

  function targetLooksProtected(action, element) {
    const selectors = Constants.PROTECTED_CHALLENGE_SELECTORS || [];
    if (element && DomUtils.matchesAny(element, selectors)) return true;
    const selector = String(action.selector || "");
    const lower = selector.toLowerCase();
    return ["captcha", "turnstile", "recaptcha", "hcaptcha", "challenge", "data-sitekey", "cloudflare"].some((needle) => lower.includes(needle));
  }

  function ensureSafeAction(action, element) {
    const protectedChallenge = DomUtils.detectProtectedChallenge(document);
    if (!protectedChallenge.present) return { allowed: true };

    if (challengePolicyAllowsOnlyHighlight(action)) {
      DomUtils.highlightElement(protectedChallenge.element, "primary");
      return {
        allowed: false,
        reason: "Protected verification can only be highlighted and waited on."
      };
    }

    if (targetLooksProtected(action, element)) {
      DomUtils.highlightElement(protectedChallenge.element, "primary");
      return {
        allowed: false,
        reason: "Action blocked because it targets a protected verification widget."
      };
    }

    return { allowed: true };
  }

  function resolveElement(action, root = document) {
    if (action.text) {
      return DomUtils.findByText(action.text, action.selector || "button, a, input, textarea, select, [role='button']", root);
    }
    return DomUtils.safeQuery(action.selector, root);
  }

  function dispatchInputEvents(element) {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function waitForSelector(selector, timeoutMs = 15000, root = document) {
    const existing = DomUtils.safeQuery(selector, root);
    if (existing) return existing;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timed out waiting for selector: ${selector}`));
      }, timeoutMs);
      const observer = new MutationObserver(() => {
        const element = DomUtils.safeQuery(selector, root);
        if (element) {
          clearTimeout(timer);
          observer.disconnect();
          resolve(element);
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    });
  }

  async function waitForText(text, timeoutMs = 15000, root = document) {
    if (Parser.textMatches(DomUtils.visibleText(root), text, false)) return true;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timed out waiting for text: ${text}`));
      }, timeoutMs);
      const observer = new MutationObserver(() => {
        if (Parser.textMatches(DomUtils.visibleText(root), text, false)) {
          clearTimeout(timer);
          observer.disconnect();
          resolve(true);
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    });
  }

  async function runAction(action, context = {}) {
    const root = context.scope || document;
    const timeoutMs = Number(action.timeoutMs || 15000);
    const type = action.type;
    let element = action.selector || action.text ? resolveElement(action, root) : null;
    const safe = ensureSafeAction(action, element);
    if (!safe.allowed) {
      return { ok: false, skipped: true, reason: safe.reason, action };
    }

    switch (type) {
      case Constants.ACTIONS.CLICK:
        if (!element) throw new Error(`Click target not found: ${action.selector || action.text}`);
        if (action.requireVisible !== false && !DomUtils.isVisible(element)) throw new Error("Click target is not visible.");
        element.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        await Timers.sleep(Number(action.delayBeforeMs || 150));
        element.click();
        return { ok: true, action, summary: DomUtils.elementSummary(element) };
      case Constants.ACTIONS.FOCUS:
        if (!element) throw new Error(`Focus target not found: ${action.selector || action.text}`);
        element.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        element.focus({ preventScroll: true });
        DomUtils.highlightElement(element);
        return { ok: true, action, summary: DomUtils.elementSummary(element) };
      case Constants.ACTIONS.FILL:
        if (!element) throw new Error(`Input target not found: ${action.selector}`);
        if (element.readOnly || element.disabled) throw new Error("Input target cannot be edited.");
        element.focus();
        element.value = String(action.value || "");
        dispatchInputEvents(element);
        return { ok: true, action, summary: DomUtils.elementSummary(element) };
      case Constants.ACTIONS.BACK:
        history.back();
        return { ok: true, action };
      case Constants.ACTIONS.RELOAD:
        location.reload(Boolean(action.hard));
        return { ok: true, action };
      case Constants.ACTIONS.OPEN_URL:
        if (!/^https?:\/\//i.test(action.url || "")) throw new Error("Only http/https URLs can be opened.");
        location.assign(action.url);
        return { ok: true, action };
      case Constants.ACTIONS.WAIT_FOR_SELECTOR:
        element = await waitForSelector(action.selector, timeoutMs, root);
        return { ok: true, action, summary: DomUtils.elementSummary(element) };
      case Constants.ACTIONS.WAIT_FOR_TEXT:
        await waitForText(action.text, timeoutMs, root);
        return { ok: true, action };
      case Constants.ACTIONS.SCROLL_TO_ELEMENT:
        element = element || await waitForSelector(action.selector, timeoutMs, root);
        DomUtils.highlightElement(element);
        return { ok: true, action, summary: DomUtils.elementSummary(element) };
      case Constants.ACTIONS.NOTIFY:
        if (chrome?.runtime?.sendMessage) {
          chrome.runtime.sendMessage({
            type: Constants.MESSAGE.LOG_EVENT,
            log: Logger.create("info", "action_notify", { title: action.title, message: action.message })
          }).catch(() => {});
        }
        return { ok: true, action };
      case Constants.ACTIONS.STOP:
        if (chrome?.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ type: Constants.MESSAGE.STOP, reason: action.reason || "rule_action" }).catch(() => {});
        }
        return { ok: true, action };
      default:
        throw new Error(`Unsupported action type: ${type}`);
    }
  }

  async function runActions(actions = [], context = {}) {
    const results = [];
    for (const action of actions) {
      try {
        const result = await runAction(action, context);
        results.push(result);
        if (result.skipped && action.stopOnSkip) break;
        if (action.stopAfter) break;
      } catch (error) {
        results.push({ ok: false, error: error.message, action });
        if (action.continueOnError !== true) throw error;
      }
    }
    return results;
  }

  const ActionRunner = Object.freeze({
    runAction,
    runActions,
    waitForSelector,
    waitForText
  });

  global.VisaFlowXUniversal = Object.assign(global.VisaFlowXUniversal || {}, { ActionRunner });
})(typeof globalThis !== "undefined" ? globalThis : this);
