# VisaFlowX Architecture

VisaFlowX is a Manifest V3 Chrome extension for compliant IVAC login workflow assistance.

## Runtime Flow

```text
Popup Dashboard
  -> background/service-worker.js
      -> validates credentials
      -> manages schedule and retry chrome.alarms
      -> injects content scripts when needed
      -> owns notifications and offscreen alarm audio
          -> content/automation.js
              -> centralized AutomationController
              -> detector/autofill/retry/otp modules
              -> safe Cloudflare focus/wait handling only
```

## Scheduler

The popup stores a future date/time through the background service worker. The background creates a `visaflowx-scheduled-start` Chrome alarm. When the alarm fires, VisaFlowX opens or focuses `https://appointment.ivacbd.com/signin`, waits for the tab to load, injects content scripts if needed, and starts the normal automation workflow.

## Compliance Boundary

VisaFlowX never bypasses Cloudflare, injects verification tokens, uses solver APIs, or automates challenge completion. It only detects the widget, highlights/focuses it, waits for successful human verification, then continues the normal login workflow.
