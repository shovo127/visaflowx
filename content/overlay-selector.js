(function initOverlaySelector(global) {
  "use strict";

  const Constants = global.VisaFlowXUniversal.Constants;
  const DomUtils = global.VisaFlowXUniversal.DomUtils;

  let active = false;
  let highlight = null;
  let label = null;

  function ensureOverlay() {
    if (highlight) return;
    highlight = document.createElement("div");
    highlight.id = "visaflowx-universal-area-highlight";
    highlight.style.cssText = [
      "position:fixed",
      "z-index:2147483647",
      "pointer-events:none",
      "border:2px solid #59a6ff",
      "background:rgba(89,166,255,.16)",
      "box-shadow:0 0 0 9999px rgba(0,0,0,.42), 0 0 24px rgba(89,166,255,.42)",
      "border-radius:8px",
      "transition:all .06s ease"
    ].join(";");

    label = document.createElement("div");
    label.id = "visaflowx-universal-area-label";
    label.textContent = "Click an element or area to monitor. Press Esc to cancel.";
    label.style.cssText = [
      "position:fixed",
      "z-index:2147483647",
      "top:16px",
      "left:50%",
      "transform:translateX(-50%)",
      "background:#0f172a",
      "color:#e5eefc",
      "font:600 13px system-ui,-apple-system,Segoe UI,sans-serif",
      "padding:10px 14px",
      "border:1px solid rgba(148,163,184,.35)",
      "border-radius:999px",
      "box-shadow:0 14px 40px rgba(0,0,0,.35)"
    ].join(";");

    document.documentElement.append(highlight, label);
  }

  function cleanup() {
    active = false;
    highlight?.remove();
    label?.remove();
    highlight = null;
    label = null;
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
  }

  function onMove(event) {
    if (!active || !highlight) return;
    const element = document.elementFromPoint(event.clientX, event.clientY);
    if (!element || element === highlight || element === label) return;
    const rect = element.getBoundingClientRect();
    Object.assign(highlight.style, {
      left: `${Math.round(rect.left)}px`,
      top: `${Math.round(rect.top)}px`,
      width: `${Math.round(rect.width)}px`,
      height: `${Math.round(rect.height)}px`
    });
  }

  function onClick(event) {
    if (!active) return;
    event.preventDefault();
    event.stopPropagation();
    const element = document.elementFromPoint(event.clientX, event.clientY);
    if (!element || element === highlight || element === label) return;
    const area = DomUtils.elementSummary(element);
    cleanup();
    chrome.runtime.sendMessage({ type: Constants.MESSAGE.AREA_SELECTED, area }).catch(() => {});
  }

  function onKeyDown(event) {
    if (event.key === "Escape") cleanup();
  }

  function start() {
    cleanup();
    active = true;
    ensureOverlay();
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
  }

  const OverlaySelector = Object.freeze({ cleanup, start });
  global.VisaFlowXUniversal = Object.assign(global.VisaFlowXUniversal || {}, { OverlaySelector });
})(typeof globalThis !== "undefined" ? globalThis : this);
