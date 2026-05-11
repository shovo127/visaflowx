# Architecture

VisaFlowX Universal is split into isolated MV3 layers.

```text
popup UI
  -> background service worker
    -> content bootstrap
      -> monitor engine
        -> rule engine
        -> action runner
        -> OTP detector
        -> retry/error recovery
```

## Background

`background/service-worker.js`

- Owns storage state.
- Injects content scripts with `chrome.scripting.executeScript`.
- Handles schedules through `chrome.alarms`.
- Sends notifications.
- Tracks active status, logs, active profile, and tab lifecycle.

## Content

`content/bootstrap.js`

- Receives runtime messages.
- Starts and stops monitoring.
- Runs the area selector.
- Plays and stops test alarm sounds.

`content/monitor.js`

- Uses `MutationObserver`.
- Debounces expensive DOM evaluation.
- Stops automation on OTP pages and triggers manual handoff alerts.
- Detects retry text and page error text.
- Runs matched rules.
- Cleans observers and timers on stop.

`content/otp-detector.js`

- Detects common OTP and verification-code inputs.
- Focuses and highlights the OTP input when present.
- Does not read or enter OTP data.

## Rules

`rules/rule-engine.js`

- Evaluates conditions against current URL, visible text, selectors, button state, error state, and protected verification state.

`rules/action-runner.js`

- Executes safe actions.
- Blocks actions targeting protected challenge widgets.
- Supports click, focus, fill, back, reload, open URL, wait for selector/text, and scroll/highlight.

## Popup

`popup/popup.html`, `popup/popup.css`, `popup/popup.js`

- Provides a compact professional dashboard.
- Creates profiles, rules, schedules, retry settings, and notification settings.
- Renders live status from runtime messages and storage.

## Storage

Chrome Storage Local stores:

- Profiles
- Rules
- Retry settings
- Schedules
- App settings
- Logs
- Runtime status

Sensitive field names are masked in logs.
