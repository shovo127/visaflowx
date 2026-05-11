# Security Model

VisaFlowX is an IVAC workflow assistant, not a verification bypass tool.

## Verification

The extension may detect, focus, and highlight visible verification widgets. It waits for the user to complete protected verification manually, then continues the normal signin flow when the widget is no longer visible.

It never injects verification tokens, clicks hidden challenge internals, calls third-party challenge services, or tries to defeat anti-bot systems.

## OTP

OTP pages are manual handoff points. VisaFlowX stops all automation, focuses the OTP field, starts the alarm, and shows a notification. It does not read OTP values and does not submit OTP forms.

## Credentials

Credentials are stored in Chrome local extension storage for autofill. They are not logged, not sent to any backend, and only written into the IVAC signin form fields when automation starts.
