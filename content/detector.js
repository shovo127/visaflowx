(function initVisaFlowXDetector(global) {
  "use strict";

  const { DomUtils, Parser } = global.VisaFlowX;

  const IVAC_ORIGIN = "https://appointment.ivacbd.com";

  const SELECTORS = Object.freeze({
    contact: [
      "input[name='mobile_no']",
      "input[name='contact_no']",
      "input[name='phone']",
      "input[name='username']",
      "input[type='tel']",
      "input[placeholder*='mobile' i]",
      "input[placeholder*='contact' i]",
      "input[placeholder*='phone' i]"
    ],
    password: [
      "input[type='password']",
      "input[name='password']",
      "input[placeholder*='password' i]"
    ],
    signInButton: [
      "button[type='submit']",
      "input[type='submit']",
      "button"
    ],
    verification: [
      "iframe[src*='challenges.cloudflare.com']",
      "iframe[src*='turnstile']",
      "iframe[src*='recaptcha']",
      ".cf-turnstile",
      "[data-sitekey]",
      "[class*='captcha' i]",
      "[id*='captcha' i]"
    ],
    otpInput: [
      "input[autocomplete='one-time-code']",
      "input[inputmode='numeric']",
      "input[name*='otp' i]",
      "input[id*='otp' i]",
      "input[placeholder*='otp' i]",
      "input[name*='verification' i]",
      "input[id*='verification' i]",
      "input[placeholder*='verification' i]",
      "input[aria-label*='verification code' i]",
      "input[aria-label*='otp' i]"
    ]
  });

  const OTP_TEXT = Object.freeze([
    "otp",
    "one time password",
    "one-time password",
    "verification code",
    "security code",
    "authentication code",
    "enter code"
  ]);

  function isIvacPage() {
    return location.origin === IVAC_ORIGIN;
  }

  function findContactInput(root = document) {
    return DomUtils.first(SELECTORS.contact, root);
  }

  function findPasswordInput(root = document) {
    return DomUtils.first(SELECTORS.password, root);
  }

  function findSignInButton(root = document) {
    const byText = DomUtils.findByText("Sign In", SELECTORS.signInButton.join(","), root)
      || DomUtils.findByText("Login", SELECTORS.signInButton.join(","), root)
      || DomUtils.findByText("Submit", SELECTORS.signInButton.join(","), root);
    if (byText) return byText;
    return DomUtils.safeQueryAll(SELECTORS.signInButton.join(","), root).find((element) => DomUtils.isVisible(element) && !element.disabled) || null;
  }

  function detectVerification(root = document) {
    for (const selector of SELECTORS.verification) {
      const element = DomUtils.safeQuery(selector, root);
      if (element && DomUtils.isVisible(element)) {
        return { present: true, selector, element };
      }
    }
    return { present: false, selector: "", element: null };
  }

  function looksLikeOtpInput(element) {
    if (!element || element.disabled || element.readOnly) return false;
    const tag = element.tagName?.toLowerCase();
    if (!["input", "textarea"].includes(tag)) return false;
    if (!DomUtils.isVisible(element)) return false;
    const attributes = [
      element.getAttribute("autocomplete"),
      element.getAttribute("inputmode"),
      element.getAttribute("name"),
      element.getAttribute("id"),
      element.getAttribute("placeholder"),
      element.getAttribute("aria-label")
    ].filter(Boolean).join(" ").toLowerCase();
    return ["one-time-code", "otp", "verification", "security code", "auth code"].some((word) => attributes.includes(word));
  }

  function findOtpInput(root = document) {
    for (const selector of SELECTORS.otpInput) {
      const element = DomUtils.safeQuery(selector, root);
      if (looksLikeOtpInput(element)) return element;
    }
    return DomUtils.safeQueryAll("input, textarea", root).find(looksLikeOtpInput) || null;
  }

  function detectOtp(root = document) {
    const input = findOtpInput(root);
    if (input) return { present: true, input, reason: "otp_input" };
    const text = DomUtils.visibleText(root).toLowerCase();
    if (OTP_TEXT.some((phrase) => text.includes(phrase))) {
      return { present: true, input: null, reason: "otp_text" };
    }
    return { present: false, input: null, reason: "" };
  }

  function detectPage(root = document) {
    const text = DomUtils.visibleText(root);
    const error = Parser.detectPageError(text, location.href);
    const otp = detectOtp(root);
    const verification = detectVerification(root);
    const contact = findContactInput(root);
    const password = findPasswordInput(root);
    const signInButton = findSignInButton(root);
    const path = location.pathname.toLowerCase();

    let type = "unknown";
    if (!isIvacPage()) type = "unsupported";
    else if (otp.present) type = "otp";
    else if (error) type = "error";
    else if (path.includes("signin") || (contact && password)) type = "signin";
    else if (/dashboard|appointment|profile|payment|application/.test(path) && !password) type = "completed";

    return {
      type,
      text,
      error,
      otp,
      verification,
      contact,
      password,
      signInButton,
      url: location.href
    };
  }

  const Detector = Object.freeze({
    IVAC_ORIGIN,
    OTP_TEXT,
    SELECTORS,
    detectOtp,
    detectPage,
    detectVerification,
    findContactInput,
    findOtpInput,
    findPasswordInput,
    findSignInButton,
    isIvacPage,
    looksLikeOtpInput
  });

  global.VisaFlowX = Object.assign(global.VisaFlowX || {}, { Detector });
})(typeof globalThis !== "undefined" ? globalThis : this);
