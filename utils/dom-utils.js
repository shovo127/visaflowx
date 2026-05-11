(function initVisaFlowXDomUtils(global) {
  "use strict";

  const Parser = global.VisaFlowX?.Parser || requireMaybe("../utils/parser.js");

  function requireMaybe(path) {
    try {
      return typeof require !== "undefined" ? require(path) : null;
    } catch (_) {
      return null;
    }
  }

  function safeQuery(selector, root = document) {
    if (!selector || !root?.querySelector) return null;
    try {
      return root.querySelector(selector);
    } catch (_) {
      return null;
    }
  }

  function safeQueryAll(selector, root = document) {
    if (!selector || !root?.querySelectorAll) return [];
    try {
      return Array.from(root.querySelectorAll(selector));
    } catch (_) {
      return [];
    }
  }

  function first(selectors = [], root = document) {
    for (const selector of selectors) {
      const element = safeQuery(selector, root);
      if (element) return element;
    }
    return null;
  }

  function isVisible(element) {
    if (!element?.getBoundingClientRect) return false;
    const rect = element.getBoundingClientRect();
    const style = global.getComputedStyle ? global.getComputedStyle(element) : null;
    return rect.width > 0 && rect.height > 0 && (!style || (style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity || 1) !== 0));
  }

  function visibleText(root = document.body) {
    if (!root || typeof document === "undefined") return "";
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || !isVisible(parent)) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName?.toLowerCase();
        if (["script", "style", "noscript", "template"].includes(tag)) return NodeFilter.FILTER_REJECT;
        return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });

    const parts = [];
    let node = walker.nextNode();
    while (node && parts.join(" ").length < 25000) {
      parts.push(node.nodeValue.trim());
      node = walker.nextNode();
    }
    return Parser?.normalizeText ? Parser.normalizeText(parts.join(" ")) : parts.join(" ").replace(/\s+/g, " ").trim();
  }

  function findByText(text, selector = "button, a, input[type='button'], input[type='submit'], [role='button']", root = document) {
    const target = Parser?.normalizeText ? Parser.normalizeText(text).toLowerCase() : String(text || "").toLowerCase();
    if (!target) return null;
    return safeQueryAll(selector, root).find((element) => {
      if (!isVisible(element)) return false;
      const value = element.value || element.innerText || element.textContent || element.getAttribute("aria-label") || element.getAttribute("title") || "";
      return String(value).replace(/\s+/g, " ").trim().toLowerCase().includes(target);
    }) || null;
  }

  function setInputValue(element, value) {
    if (!element || element.disabled || element.readOnly) return false;
    element.focus?.();
    element.value = String(value || "");
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function focusElement(element) {
    if (!element) return false;
    element.scrollIntoView?.({ behavior: "smooth", block: "center", inline: "center" });
    element.focus?.({ preventScroll: true });
    return true;
  }

  function ensurePulseStyle() {
    if (typeof document === "undefined" || document.getElementById("visaflowx-pulse-style")) return;
    const style = document.createElement("style");
    style.id = "visaflowx-pulse-style";
    style.textContent = `
      @keyframes visaflowxPulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(56, 189, 248, .72); }
        50% { box-shadow: 0 0 0 10px rgba(56, 189, 248, 0); }
      }
      .visaflowx-highlight {
        outline: 3px solid #38bdf8 !important;
        outline-offset: 4px !important;
        animation: visaflowxPulse 1s ease-in-out infinite !important;
      }
      .visaflowx-highlight-danger {
        outline-color: #fb7185 !important;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function pulseHighlight(element, danger = false) {
    if (!element?.classList) return false;
    ensurePulseStyle();
    element.classList.add("visaflowx-highlight");
    if (danger) element.classList.add("visaflowx-highlight-danger");
    return true;
  }

  function clearPulse(element) {
    if (!element?.classList) return;
    element.classList.remove("visaflowx-highlight", "visaflowx-highlight-danger");
  }

  const DomUtils = Object.freeze({
    clearPulse,
    findByText,
    first,
    focusElement,
    isVisible,
    pulseHighlight,
    safeQuery,
    safeQueryAll,
    setInputValue,
    visibleText
  });

  global.VisaFlowX = Object.assign(global.VisaFlowX || {}, { DomUtils });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = DomUtils;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
