# Security Model

VisaFlowX Universal is a workflow assistant, not a verification bypass tool.

## Protected Challenges

The extension detects protected verification widgets using conservative selectors for Cloudflare Turnstile, CAPTCHA, reCAPTCHA, and hCaptcha-like embeds.

When detected, it may:

- Scroll the widget into view.
- Highlight the visible area.
- Report a waiting state.
- Continue after the page changes.

It may not:

- Generate tokens.
- Inject tokens.
- Click hidden challenge internals.
- Use external solving APIs.
- Emulate successful verification.
- Defeat anti-bot systems.

## Storage

The extension uses `chrome.storage.local` for profiles, rules, schedules, settings, and logs. Logs are masked for sensitive key names such as password, token, secret, OTP, authorization, and cookie.

## OTP Pages

OTP and verification-code pages always require manual user action. The extension may focus and highlight the OTP input, play the local alarm, and show a desktop notification, but it does not read OTP input contents or proceed through the OTP step automatically.

## URL Scope

The extension requests `<all_urls>` because the product is universal. It only starts monitoring after a user presses **Start Monitoring**, uses the hotkey, or enables a schedule.

## Injection

Content scripts are registered in the manifest and can also be injected dynamically after an explicit user action or scheduled run. Injection failures are reported in popup status instead of silently failing.

## Unsafe APIs

The codebase does not use `eval`, remote scripts, CAPTCHA solving APIs, or fake verification APIs.
