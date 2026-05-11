# Testing Guide

## Automated Checks

Run:

```bash
npm test
```

This performs syntax, manifest, retry parser, and static safety checks.

## Manual Browser Checks

1. Load the extension from `chrome://extensions`.
2. Open a normal website tab.
3. Open the popup.
4. Press **Start Monitoring**.
5. Confirm the dashboard changes from Idle to Monitoring.
6. Add a rule that detects visible text and scrolls to or clicks a safe button.
7. Confirm logs update.
8. Test **Select Area** and save a monitoring region.
9. Create a schedule one or two minutes in the future and confirm it starts.
10. Visit a page with a CAPTCHA or Cloudflare widget and confirm the extension waits and does not bypass it.
