(function initOtpDetector(global) {
  "use strict";

  const Constants = global.VisaFlowXUniversal?.Constants || requireMaybe("../utils/constants.js");
  const DomUtils = global.VisaFlowXUniversal?.DomUtils || requireMaybe("../utils/dom-utils.js");

  function requireMaybe(path) {
    try {
      return typeof require !== "undefined" ? require(path) : null;
    } catch (_) {
      return null;
    }
  }

  function attributeText(element) {
    if (!element?.getAttribute) return "";
    return [
      element.getAttribute("autocomplete"),
      element.getAttribute("inputmode"),
      element.getAttribute("name"),
      element.getAttribute("id"),
      element.getAttribute("placeholder"),
      element.getAttribute("aria-label"),
      element.getAttribute("data-testid"),
      element.getAttribute("data-test")
    ].filter(Boolean).join(" ").toLowerCase();
  }

  function looksLikeOtpInput(element) {
    if (!element || element.disabled || element.readOnly) return false;
    const tag = element.tagName?.toLowerCase();
    if (!["input", "textarea"].includes(tag)) return false;
    if (DomUtils?.isVisible && !DomUtils.isVisible(element)) return false;
    const text = attributeText(element);
    return [
      "one-time-code",
      "otp",
      "verification",
      "security code",
      "auth code",
      "two factor",
      "2fa"
    ].some((needle) => text.includes(needle));
  }

  function findOtpInput(root = global.document) {
    const selectors = Constants?.OTP_INPUT_SELECTORS || [];
    for (const selector of selectors) {
      const element = DomUtils?.safeQuery ? DomUtils.safeQuery(selector, root) : root?.querySelector?.(selector);
      if (looksLikeOtpInput(element)) return element;
    }

    const candidates = DomUtils?.safeQueryAll
      ? DomUtils.safeQueryAll("input, textarea", root)
      : Array.from(root?.querySelectorAll?.("input, textarea") || []);
    return candidates.find(looksLikeOtpInput) || null;
  }

  function pageMentionsOtp(root = global.document) {
    const pageText = DomUtils?.visibleText ? DomUtils.visibleText(root).toLowerCase() : "";
    if (!pageText) return false;
    return (Constants?.OTP_TEXT_PATTERNS || []).some((pattern) => pageText.includes(pattern));
  }

  function detect(root = global.document) {
    if (!root) return { present: false, reason: "", element: null, selector: "" };
    const element = findOtpInput(root);
    if (element) {
      return {
        present: true,
        reason: "otp_input",
        element,
        selector: DomUtils?.buildUniqueSelector ? DomUtils.buildUniqueSelector(element) : ""
      };
    }
    if (pageMentionsOtp(root)) {
      return {
        present: true,
        reason: "otp_text",
        element: null,
        selector: ""
      };
    }
    return { present: false, reason: "", element: null, selector: "" };
  }

  function focusOtpInput(element) {
    if (!element) return false;
    element.scrollIntoView?.({ behavior: "smooth", block: "center", inline: "center" });
    element.focus?.({ preventScroll: true });
    DomUtils?.highlightElement?.(element, "danger");
    return true;
  }

  const OtpDetector = Object.freeze({
    detect,
    findOtpInput,
    focusOtpInput,
    looksLikeOtpInput
  });

  global.VisaFlowXUniversal = Object.assign(global.VisaFlowXUniversal || {}, { OtpDetector });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = OtpDetector;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
