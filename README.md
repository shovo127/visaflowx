# VisaFlowX Universal

VisaFlowX Universal is a Manifest V3 browser workflow assistant for monitoring and automating safe, user-defined web workflows across multiple websites.

It supports profile-driven rules, DOM monitoring, visual area selection, retry handling, scheduling, OTP handoff alerts, notifications, and a modern dashboard.

## Safety Boundary

VisaFlowX Universal does not bypass CAPTCHA, Cloudflare, Turnstile, reCAPTCHA, hCaptcha, anti-bot systems, or protected verification checks.

Allowed behavior:
- Detect protected verification widgets.
- Scroll/highlight/focus the visible verification area.
- Wait while the user completes verification manually.
- Continue normal user-configured workflow actions after the page changes.

Blocked behavior:
- No fake verification token injection.
- No CAPTCHA solving APIs.
- No forced verification completion.
- No hidden challenge clicking.
- No anti-bot evasion.

## Features

- Universal site profiles for IVAC, Goethe, university portals, booking portals, and registration systems.
- MutationObserver-based monitoring with debounced rule evaluation.
- Visual area selector for saving a monitored DOM region.
- Text, selector, button, URL, and page-error conditions.
- Actions for click, focus, fill, reload, back, open URL, wait for selector/text, and scroll/highlight.
- Retry engine with backoff, jitter, retry counters, and no/soft/hard refresh modes.
- Error recovery for 404, blank, timeout, maintenance, session expired, and rate-limit states.
- Scheduler using `chrome.alarms` with one-time, hourly, daily, and weekly schedules.
- OTP page handling that stops automation, focuses the OTP input, plays an alarm, and notifies the user without reading or entering any OTP.
- Live dashboard showing active site, workflow state, retry countdown, current rule, last action, and last error.
- Desktop notifications and test alarm support.
- Hotkey: `Ctrl+Shift+L` toggles monitoring.

## Installation

1. Open Chrome or any Chromium browser.
2. Go to `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select the `VisaFlowX` folder.
6. Pin the extension and open the popup.

## Basic Workflow

1. Open the website you want to monitor.
2. Open VisaFlowX Universal.
3. Select or create a profile.
4. Add monitor rules, for example:
   - IF text appears: `Available`
   - THEN click selector: `button`
   - Target text: `Book`
5. Press **Start Monitoring**.

## Visual Area Monitor

Use **Select Area** from the popup. Click an element or page area. VisaFlowX stores a stable selector and limits future text checks to that area when possible.

## Scheduler

Schedules are stored with Chrome Storage and executed by `chrome.alarms`.

Supported recurring modes:
- One time
- Hourly
- Daily
- Weekly

When a schedule fires, the extension opens or focuses a matching tab, starts the selected profile, and continues monitoring.

## Permissions

- `storage`: save profiles, rules, schedules, settings, and logs.
- `notifications`: show workflow and error notifications.
- `tabs`: detect and focus active tabs.
- `scripting`: inject content scripts when the user starts monitoring.
- `activeTab`: allow user-initiated work on the current tab.
- `alarms`: run scheduled workflows.
- `<all_urls>` host permission: required for universal profile support across arbitrary websites.

## Protected Verification Limitations

Protected verification systems are intentionally outside the automation boundary. When detected, the extension can highlight the area and wait. The user must complete any CAPTCHA or Cloudflare verification manually.

## OTP Handling

OTP and verification-code pages are manual handoff points. When detected, VisaFlowX Universal stops the workflow, focuses the visible OTP input when one is available, plays the configured alarm, and shows a desktop notification. It does not read OTP fields and does not continue past an OTP page until the user acts manually.

## Testing

Run:

```bash
npm test
```

The test suite validates:
- Manifest structure and permissions.
- Content script registration.
- Retry time parsing.
- Rule engine exports.
- Static safety checks for prohibited CAPTCHA/Cloudflare bypass APIs.
- OTP detection and manual-handoff safety checks.
- JavaScript syntax for all extension files.

## Troubleshooting

If monitoring does not start:
- Confirm you are on a normal `http` or `https` page.
- Check the Developer Debug panel in the popup.
- Confirm the active profile URL pattern matches the current site.
- Press **Start Monitoring** again; the service worker retries content injection.

If a rule does not run:
- Verify the selector is valid.
- Use the visual area selector to capture a stable element.
- Check whether the rule cooldown is active.
- Review logs in the popup.

If a schedule does not fire:
- Confirm Chrome is running.
- Confirm the schedule date is in the future or recurring.
- Check that the profile has a valid start URL.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Security

See [docs/SECURITY.md](docs/SECURITY.md).

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
