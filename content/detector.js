"use strict";

window.VisaFlowXDetector = (() => {
  const PAGE_TYPES = {
    LOGIN: "Login page",
    OTP: "OTP page",
    ERROR: "Error page",
    RATE_LIMIT: "Rate limit page",
    MAINTENANCE: "Maintenance page",
    SESSION_EXPIRED: "Session expired page",
    UNKNOWN: "Unknown"
  };

  function getVisiblePageText() {
    return String(document.body ? document.body.innerText || document.body.textContent || "" : "");
  }

  function textHas(pattern) {
    return pattern.test(getVisiblePageText());
  }

  function isLoginUrl() {
    return /appointment\.ivacbd\.com\/signin/i.test(window.location.href);
  }

  function detectOtpInput() {
    const candidates = Array.from(
      document.querySelectorAll(
        [
          "input[name*='otp' i]",
          "input[id*='otp' i]",
          "input[placeholder*='otp' i]",
          "input[name*='code' i]",
          "input[id*='code' i]",
          "input[placeholder*='code' i]",
          "input[inputmode='numeric']",
          "input[type='tel']",
          "input[type='number']",
          "input[type='text']"
        ].join(",")
      )
    );

    return candidates.find((input) => {
      if (!window.VisaFlowXDom.isVisible(input)) {
        return false;
      }
      const descriptor = [
        input.name,
        input.id,
        input.placeholder,
        input.autocomplete,
        input.getAttribute("aria-label")
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const maxLength = Number(input.getAttribute("maxlength") || 0);
      return (
        /otp|one.?time|verification|code|pin/.test(descriptor) ||
        (input.inputMode === "numeric" && maxLength > 0 && maxLength <= 8)
      );
    }) || null;
  }

  function detectPage() {
    const visibleText = getVisiblePageText();
    const normalized = window.VisaFlowXDom.normalizeText(visibleText);
    const otpInput = detectOtpInput();

    if (
      otpInput ||
      /otp|one time password|one-time password|verification code|enter code|security code/.test(normalized)
    ) {
      return {
        type: PAGE_TYPES.OTP,
        reason: "OTP field or OTP text detected",
        otpInput
      };
    }

    if (/session expired|session has expired|login session expired|please login again/.test(normalized)) {
      return {
        type: PAGE_TYPES.SESSION_EXPIRED,
        reason: "Session expired text detected"
      };
    }

    if (/maintenance|under maintenance|service unavailable|temporarily unavailable/.test(normalized)) {
      return {
        type: PAGE_TYPES.MAINTENANCE,
        reason: "Maintenance text detected"
      };
    }

    if (/too many|rate limit|try again|please wait|login after|attempt limit|cooldown/.test(normalized)) {
      return {
        type: PAGE_TYPES.RATE_LIMIT,
        reason: "Retry or rate-limit text detected"
      };
    }

    if (/error|failed|invalid|incorrect|something went wrong/.test(normalized)) {
      return {
        type: PAGE_TYPES.ERROR,
        reason: "Error text detected"
      };
    }

    const hasPassword = !!window.VisaFlowXDom.findVisible("input[type='password']");
    const hasSignIn = !!findSignInButton();
    if (isLoginUrl() || (hasPassword && hasSignIn)) {
      return {
        type: PAGE_TYPES.LOGIN,
        reason: "Login URL or login form detected"
      };
    }

    return {
      type: PAGE_TYPES.UNKNOWN,
      reason: "No known page state detected"
    };
  }

  function findCaptchaContainer(iframe) {
    if (!iframe) {
      return null;
    }
    return iframe.closest(".cf-turnstile, [data-sitekey], form, div") || iframe;
  }

  function detectCaptcha() {
    const iframe = window.VisaFlowXDom.findVisible([
      "iframe[src*='challenges.cloudflare.com']",
      "iframe[src*='turnstile']",
      "iframe[title*='Cloudflare' i]",
      "iframe[title*='Turnstile' i]"
    ]);

    const widget = window.VisaFlowXDom.findVisible([
      ".cf-turnstile",
      "[data-sitekey]",
      "[class*='turnstile' i]",
      "[id*='turnstile' i]"
    ]);

    const responseInput = document.querySelector(
      [
        "input[name='cf-turnstile-response']",
        "textarea[name='cf-turnstile-response']",
        "input[name='cf_challenge_response']",
        "textarea[name='cf_challenge_response']"
      ].join(",")
    );
    const responseLength = responseInput && responseInput.value ? responseInput.value.length : 0;
    const verified = responseLength > 20;
    const element = widget || findCaptchaContainer(iframe) || iframe || responseInput;

    return {
      present: Boolean(iframe || widget || responseInput),
      verified,
      element,
      responseDetected: verified
    };
  }

  function findSignInButton() {
    return window.VisaFlowXDom.findByText(
      ["button", "input[type='submit']", "[role='button']", "a"],
      (text, element) => {
        const value = window.VisaFlowXDom.normalizeText(
          text ||
            element.value ||
            element.getAttribute("aria-label") ||
            element.getAttribute("title")
        );
        return /^(sign in now|sign in|signin|login|log in|submit)$/.test(value);
      }
    );
  }

  function isSignInReady(button) {
    if (!button) {
      return false;
    }
    return (
      window.VisaFlowXDom.isVisible(button) &&
      !button.disabled &&
      button.getAttribute("aria-disabled") !== "true"
    );
  }

  return {
    PAGE_TYPES,
    detectPage,
    detectCaptcha,
    findSignInButton,
    isSignInReady,
    detectOtpInput,
    getVisiblePageText
  };
})();
