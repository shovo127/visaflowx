"use strict";

window.VisaFlowXDom = (() => {
  function isElement(value) {
    return value && value.nodeType === Node.ELEMENT_NODE;
  }

  function isVisible(element) {
    if (!isElement(element)) {
      return false;
    }
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity) !== 0 &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  function getText(element) {
    return String((element && (element.innerText || element.textContent)) || "").trim();
  }

  function normalizeText(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function findVisible(selectors, root = document) {
    const list = Array.isArray(selectors) ? selectors : [selectors];
    for (const selector of list) {
      const elements = Array.from(root.querySelectorAll(selector));
      const match = elements.find(isVisible);
      if (match) {
        return match;
      }
    }
    return null;
  }

  function findByText(selectors, matcher, root = document) {
    const list = Array.isArray(selectors) ? selectors : [selectors];
    const elements = list.flatMap((selector) => Array.from(root.querySelectorAll(selector)));
    return elements.find((element) => {
      if (!isVisible(element)) {
        return false;
      }
      const text = normalizeText(getText(element) || element.value || element.getAttribute("aria-label"));
      return typeof matcher === "function" ? matcher(text, element) : matcher.test(text);
    }) || null;
  }

  function setNativeValue(input, value) {
    if (!input) {
      return false;
    }
    const prototype = Object.getPrototypeOf(input);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor && descriptor.set) {
      descriptor.set.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function ensureStyle(styleId, cssText) {
    let style = document.getElementById(styleId);
    if (!style) {
      style = document.createElement("style");
      style.id = styleId;
      style.textContent = cssText;
      document.documentElement.appendChild(style);
    }
    return style;
  }

  function highlight(element, className, label) {
    if (!isElement(element)) {
      return;
    }

    ensureStyle(
      "visaflowx-highlight-style",
      `
      .visaflowx-captcha-focus {
        outline: 4px solid #22c55e !important;
        outline-offset: 8px !important;
        box-shadow: 0 0 0 8px rgba(34, 197, 94, 0.25), 0 0 36px rgba(34, 197, 94, 0.65) !important;
        border-radius: 12px !important;
        position: relative !important;
        z-index: 2147483646 !important;
      }
      .visaflowx-otp-focus {
        outline: 4px solid #f59e0b !important;
        outline-offset: 6px !important;
        box-shadow: 0 0 0 8px rgba(245, 158, 11, 0.25), 0 0 36px rgba(245, 158, 11, 0.65) !important;
        border-radius: 12px !important;
      }
      .visaflowx-floating-label {
        position: fixed !important;
        left: 50% !important;
        top: 20px !important;
        transform: translateX(-50%) !important;
        background: #0f172a !important;
        color: #f8fafc !important;
        padding: 12px 16px !important;
        border: 1px solid rgba(255,255,255,0.18) !important;
        border-radius: 12px !important;
        box-shadow: 0 18px 60px rgba(0,0,0,0.35) !important;
        font-family: Arial, sans-serif !important;
        font-size: 14px !important;
        line-height: 1.4 !important;
        z-index: 2147483647 !important;
      }
      `
    );

    element.classList.add(className);
    if (label) {
      let labelNode = document.getElementById("visaflowx-floating-label");
      if (!labelNode) {
        labelNode = document.createElement("div");
        labelNode.id = "visaflowx-floating-label";
        labelNode.className = "visaflowx-floating-label";
        document.body.appendChild(labelNode);
      }
      labelNode.textContent = label;
    }
    element.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    if (!element.hasAttribute("tabindex")) {
      element.setAttribute("tabindex", "-1");
    }
    element.focus({ preventScroll: true });
  }

  function clearFloatingLabel() {
    const label = document.getElementById("visaflowx-floating-label");
    if (label) {
      label.remove();
    }
  }

  function clickElement(element) {
    if (!isElement(element) || !isVisible(element)) {
      return false;
    }
    if (element.disabled || element.getAttribute("aria-disabled") === "true") {
      return false;
    }
    element.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    element.focus({ preventScroll: true });
    element.click();
    return true;
  }

  return {
    isElement,
    isVisible,
    getText,
    normalizeText,
    findVisible,
    findByText,
    setNativeValue,
    ensureStyle,
    highlight,
    clearFloatingLabel,
    clickElement
  };
})();
