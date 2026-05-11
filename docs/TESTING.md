# Testing

Run all checks from the root `VisaFlowX` folder:

```bash
npm test
```

The test suite covers:

- Manifest V3 structure.
- IVAC-only host permissions.
- Required content script order and paths.
- JavaScript syntax for runtime and popup files.
- Retry countdown parsing.
- Endless retry behavior without a max-attempt control.
- Scheduler date/time helper behavior.
- Popup section presence.
- OTP manual-handoff safety.
- Static scan for prohibited CAPTCHA/anti-bot bypass APIs.
