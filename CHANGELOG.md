# Changelog

## 1.1.0

- Redesigned popup around a clear Start Automation workflow.
- Added animated visual workflow stages and action-required status text.
- Added centralized `AutomationController` state machine.
- Added explicit startup safety so automation does not begin without user action after browser startup.
- Added content-script reinjection from the Start flow when needed.
- Added Test Autofill control.
- Improved live monitor, retry timer, notification, and advanced settings UX.
- Added architecture documentation and stronger static checks.

## 1.0.0

- Initial VisaFlowX Manifest V3 extension.
- Added credential autofill for IVAC login.
- Added compliant Cloudflare Turnstile focus/wait handling.
- Added automatic Sign In click after verification detection.
- Added OTP page detection, visual highlight, notification, and looping alarm.
- Added retry countdown parsing and automatic retry scheduling.
- Added dark popup dashboard and controls.
