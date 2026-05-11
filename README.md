# VisaFlowX

VisaFlowX is a lightweight Manifest V3 Chrome extension optimized only for the IVAC Bangladesh signin workflow at:

```text
https://appointment.ivacbd.com/signin
```

It is intentionally not universal. The runtime only targets `https://appointment.ivacbd.com/*`.

## Core Features

- Contact number and password autofill from Chrome extension storage.
- Verification wait mode that highlights the visible verification widget and waits for manual completion.
- Automatic Sign In click only after verification is no longer visible or not required.
- OTP detection that stops automation, focuses the OTP field, starts a looping alarm, and sends a desktop notification.
- Continuous retry countdown parsing for messages such as `Try again after 5 minutes` and `Please wait`.
- Error recovery for 404, timeout, blank, temporary error, and session-expired pages.
- Scheduler powered by `chrome.alarms` with separate date/time controls and restore on browser restart.
- Compact dark popup UI with live status, credential save/update/clear, scheduler preview, notifications, alarm controls, and toast feedback.

## Safety Boundary

VisaFlowX does not bypass Cloudflare, CAPTCHA, Turnstile, anti-bot systems, or protected verification checks.

Allowed behavior:

- Detect visible verification widgets.
- Focus and highlight the verification area.
- Wait while the user completes verification manually.
- Continue the normal signin workflow afterward.

Blocked behavior:

- No fake verification token injection.
- No CAPTCHA-solving APIs.
- No hidden challenge clicking.
- No anti-bot evasion.
- No OTP reading or auto-submit.

## Retry Behavior

VisaFlowX retries continuously until an OTP page appears or the user manually stops automation. There is no max retry attempt limit.

## Installation

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable Developer mode.
4. Choose Load unpacked.
5. Select the `VisaFlowX` folder.

## Testing

Run:

```bash
npm test
```

The suite validates manifest scope, required runtime files, syntax, retry parsing, popup sections, IVAC-only permissions, and safety checks.
