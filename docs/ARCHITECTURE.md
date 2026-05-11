# Architecture

VisaFlowX is a focused IVAC-only MV3 extension.

```text
popup UI
  -> background service worker
    -> IVAC content scripts
      -> detector
      -> automation controller
      -> retry engine
      -> OTP monitor
      -> alarm handler
    -> storage / scheduler / notification helpers
```

## Background

`background/service-worker.js`

- Owns Chrome storage defaults.
- Starts and stops automation.
- Injects content scripts if needed.
- Manages one scheduled run through `chrome.alarms` and restores it on browser startup.
- Sends desktop notifications through a helper with graceful failure handling.
- Tracks tab-close shutdown.
- Resumes automation after retry-driven reloads.

## Content

`content/detector.js`

- Detects IVAC signin, OTP, completed, error, and unsupported states.
- Finds contact, password, Sign In, verification, and OTP elements with stable selector lists.

`content/automation.js`

- Uses `MutationObserver` with debounced evaluation.
- Autofills credentials.
- Waits for manual verification completion.
- Clicks Sign In after verification is gone.
- Stops on OTP, completion, or manual stop.

`content/retry-engine.js`

- Parses retry countdown text.
- Recovers from page errors by going back, reloading, and restarting safely.
- Retries continuously until OTP appears or the user manually stops automation.

`content/otp-monitor.js`

- Focuses and pulse-highlights the OTP input.
- Starts the looping local alarm.
- Notifies the background service worker.

## Storage

Chrome Storage Local stores:

- credentials
- retry settings
- schedule settings
- notification/sound settings
- current status
