(function initRuleEngine(global) {
  "use strict";

  const Constants = global.VisaFlowXUniversal?.Constants || requireMaybe("../utils/constants.js");
  const Parser = global.VisaFlowXUniversal?.Parser || requireMaybe("../utils/parser.js");
  const DomUtils = global.VisaFlowXUniversal?.DomUtils || requireMaybe("../utils/dom-utils.js");

  function requireMaybe(path) {
    try {
      return typeof require !== "undefined" ? require(path) : null;
    } catch (_) {
      return null;
    }
  }

  function getScope(profile, root = global.document) {
    const regionSelector = profile?.monitorRegion?.selector;
    if (!regionSelector || !DomUtils?.safeQuery) return root;
    return DomUtils.safeQuery(regionSelector, root) || root;
  }

  function conditionMatches(condition = {}, context = {}) {
    const type = condition.type;
    const root = context.root || global.document;
    const scope = context.scope || root;
    const pageText = context.pageText || (DomUtils?.visibleText ? DomUtils.visibleText(scope) : "");
    const url = context.url || global.location?.href || "";

    switch (type) {
      case Constants.CONDITIONS.TEXT_APPEARS:
        return Parser.textMatches(pageText, condition.text, Boolean(condition.caseSensitive));
      case Constants.CONDITIONS.TEXT_MISSING:
        return !Parser.textMatches(pageText, condition.text, Boolean(condition.caseSensitive));
      case Constants.CONDITIONS.SELECTOR_EXISTS:
        return Boolean(DomUtils.safeQuery(condition.selector, scope));
      case Constants.CONDITIONS.SELECTOR_MISSING:
        return !DomUtils.safeQuery(condition.selector, scope);
      case Constants.CONDITIONS.URL_MATCHES:
        return Parser.urlMatches(url, Array.isArray(condition.patterns) ? condition.patterns : [condition.pattern || ""]);
      case Constants.CONDITIONS.BUTTON_ENABLED: {
        const element = condition.text
          ? DomUtils.findByText(condition.text, condition.selector || "button, a, input[type='button'], input[type='submit'], [role='button']", scope)
          : DomUtils.safeQuery(condition.selector, scope);
        return Boolean(element && DomUtils.isVisible(element) && !element.disabled && element.getAttribute("aria-disabled") !== "true");
      }
      case Constants.CONDITIONS.PAGE_ERROR:
        return (Constants.PAGE_ERROR_PATTERNS || []).some((pattern) => Parser.textMatches(pageText, pattern, false)) || /\/404(?:\b|\/|\?)/i.test(url);
      case Constants.CONDITIONS.PROTECTED_CHALLENGE:
        return Boolean(DomUtils.detectProtectedChallenge(root).present);
      default:
        return false;
    }
  }

  function evaluateRules(profile = {}, context = {}) {
    const root = context.root || global.document;
    const scope = getScope(profile, root);
    const pageText = context.pageText || (DomUtils?.visibleText ? DomUtils.visibleText(scope) : "");
    const url = context.url || global.location?.href || "";

    const matches = (profile.rules || [])
      .filter((rule) => rule && rule.enabled !== false)
      .map((rule) => ({
        rule,
        matched: conditionMatches(rule.condition || {}, { ...context, root, scope, pageText, url })
      }))
      .filter((result) => result.matched);

    return {
      matches,
      pageText,
      scope,
      url
    };
  }

  function validateRule(rule = {}) {
    const errors = [];
    if (!rule.name || !String(rule.name).trim()) errors.push("Rule name is required.");
    if (!rule.condition?.type) errors.push("Rule condition type is required.");
    if (!Array.isArray(rule.actions) || !rule.actions.length) errors.push("At least one action is required.");
    return { valid: errors.length === 0, errors };
  }

  const RuleEngine = Object.freeze({
    conditionMatches,
    evaluateRules,
    getScope,
    validateRule
  });

  global.VisaFlowXUniversal = Object.assign(global.VisaFlowXUniversal || {}, { RuleEngine });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = RuleEngine;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
