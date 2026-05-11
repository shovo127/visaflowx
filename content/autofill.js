"use strict";

window.VisaFlowXAutofill = (() => {
  function scoreInput(input, keywords) {
    const descriptor = [
      input.name,
      input.id,
      input.placeholder,
      input.autocomplete,
      input.getAttribute("aria-label"),
      input.getAttribute("title")
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return keywords.reduce((score, keyword) => {
      return descriptor.includes(keyword) ? score + 1 : score;
    }, 0);
  }

  function findContactInput() {
    const candidates = Array.from(
      document.querySelectorAll(
        [
          "input[type='tel']",
          "input[inputmode='numeric']",
          "input[name*='mobile' i]",
          "input[id*='mobile' i]",
          "input[placeholder*='mobile' i]",
          "input[name*='phone' i]",
          "input[id*='phone' i]",
          "input[placeholder*='phone' i]",
          "input[name*='contact' i]",
          "input[id*='contact' i]",
          "input[placeholder*='contact' i]",
          "input[type='text']"
        ].join(",")
      )
    ).filter((input) => {
      return (
        window.VisaFlowXDom.isVisible(input) &&
        input.type !== "password" &&
        !/otp|code|captcha|search/i.test(
          [input.name, input.id, input.placeholder].filter(Boolean).join(" ")
        )
      );
    });

    candidates.sort((a, b) => {
      return (
        scoreInput(b, ["mobile", "phone", "contact", "number", "login", "username"]) -
        scoreInput(a, ["mobile", "phone", "contact", "number", "login", "username"])
      );
    });

    return candidates[0] || null;
  }

  function findPasswordInput() {
    return window.VisaFlowXDom.findVisible("input[type='password']");
  }

  async function fillCredentials(credentials) {
    if (!credentials || !credentials.contactNumber || !credentials.password) {
      return {
        ok: false,
        reason: "Credentials are missing"
      };
    }

    const contactInput = findContactInput();
    const passwordInput = findPasswordInput();

    if (!contactInput || !passwordInput) {
      return {
        ok: false,
        reason: "Login fields not found",
        contactFound: Boolean(contactInput),
        passwordFound: Boolean(passwordInput)
      };
    }

    window.VisaFlowXDom.setNativeValue(contactInput, credentials.contactNumber);
    window.VisaFlowXDom.setNativeValue(passwordInput, credentials.password);

    return {
      ok: true,
      contactFound: true,
      passwordFound: true
    };
  }

  return {
    findContactInput,
    findPasswordInput,
    fillCredentials
  };
})();
