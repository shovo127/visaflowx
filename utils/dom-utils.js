(function initDomUtils(global) {
  "use strict";

  const Constants = global.VisaFlowXUniversal?.Constants || requireMaybe("../utils/constants.js");
  const Parser = global.VisaFlowXUniversal?.Parser || requireMaybe("../utils/parser.js");

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

  function isVisible(element) {
    if (!element || !element.getBoundingClientRect) return false;
    const rect = element.getBoundingClientRect();
    const style = global.getComputedStyle ? global.getComputedStyle(element) : null;
    return rect.width > 0 && rect.height > 0 && (!style || (style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity || 1) !== 0));
  }

  function visibleText(root = document.body) {
    if (!root) return "";
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || !isVisible(parent)) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName?.toLowerCase();
        if (["script", "style", "noscript", "template"].includes(tag)) return NodeFilter.FILTER_REJECT;
        return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });

    const chunks = [];
    let node = walker.nextNode();
    while (node && chunks.join(" ").length < 20000) {
      chunks.push(node.nodeValue.trim());
      node = walker.nextNode();
    }
    return Parser?.normalizeText ? Parser.normalizeText(chunks.join(" ")) : chunks.join(" ").replace(/\s+/g, " ").trim();
  }

  function findByText(text, selector = "button, a, input, textarea, select, [role='button'], [tabindex]", root = document) {
    const candidates = safeQueryAll(selector, root).filter(isVisible);
    return candidates.find((element) => {
      const value = element.value || element.innerText || element.textContent || element.getAttribute("aria-label") || element.getAttribute("title") || "";
      return Parser?.textMatches ? Parser.textMatches(value, text, false) : String(value).toLowerCase().includes(String(text).toLowerCase());
    }) || null;
  }

  function cssEscape(value) {
    if (global.CSS?.escape) return global.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function buildUniqueSelector(element) {
    if (!element || !element.tagName) return "";
    if (element.id) return `#${cssEscape(element.id)}`;

    const parts = [];
    let node = element;
    while (node && node.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
      const tag = node.tagName.toLowerCase();
      const name = node.getAttribute("name");
      const dataId = node.getAttribute("data-testid") || node.getAttribute("data-test") || node.getAttribute("data-qa");
      let part = tag;
      if (dataId) part += `[data-testid="${cssEscape(dataId)}"]`;
      else if (name) part += `[name="${cssEscape(name)}"]`;
      else {
        const classes = Array.from(node.classList || []).slice(0, 2).map(cssEscape);
        if (classes.length) part += `.${classes.join(".")}`;
      }
      const parent = node.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((item) => item.tagName === node.tagName);
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      const candidate = parts.join(" > ");
      if (safeQueryAll(candidate).length === 1) return candidate;
      node = parent;
    }
    return parts.join(" > ");
  }

  function matchesAny(element, selectors = []) {
    if (!element?.matches) return false;
    return selectors.some((selector) => {
      try {
        return element.matches(selector) || Boolean(element.closest(selector));
      } catch (_) {
        return false;
      }
    });
  }

  function detectProtectedChallenge(root = document) {
    const selectors = Constants?.PROTECTED_CHALLENGE_SELECTORS || [];
    for (const selector of selectors) {
      const element = safeQuery(selector, root);
      if (element && isVisible(element)) {
        return {
          present: true,
          selector,
          element,
          description: "Protected verification widget detected"
        };
      }
    }
    return { present: false, selector: "", element: null, description: "" };
  }

  function highlightElement(element, kind = "primary") {
    if (!element || !element.style) return;
    const color = kind === "danger" ? "#ff5c7a" : kind === "success" ? "#31d0aa" : "#59a6ff";
    element.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    element.style.outline = `3px solid ${color}`;
    element.style.outlineOffset = "4px";
    element.style.boxShadow = `0 0 0 8px color-mix(in srgb, ${color} 28%, transparent)`;
    element.setAttribute("data-visaflowx-highlighted", "true");
    setTimeout(() => {
      if (element.getAttribute("data-visaflowx-highlighted") === "true") {
        element.style.outline = "";
        element.style.outlineOffset = "";
        element.style.boxShadow = "";
        element.removeAttribute("data-visaflowx-highlighted");
      }
    }, 12000);
  }

  function elementSummary(element) {
    if (!element) return null;
    const rect = element.getBoundingClientRect ? element.getBoundingClientRect() : { x: 0, y: 0, width: 0, height: 0 };
    return {
      selector: buildUniqueSelector(element),
      tag: element.tagName?.toLowerCase() || "",
      text: Parser?.normalizeText ? Parser.normalizeText((element.innerText || element.value || "").slice(0, 120)) : "",
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    };
  }

  const DomUtils = Object.freeze({
    buildUniqueSelector,
    detectProtectedChallenge,
    elementSummary,
    findByText,
    highlightElement,
    isVisible,
    matchesAny,
    safeQuery,
    safeQueryAll,
    visibleText
  });

  global.VisaFlowXUniversal = Object.assign(global.VisaFlowXUniversal || {}, { DomUtils });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = DomUtils;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
