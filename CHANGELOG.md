# Changelog

## 2.1.0 - 2026-05-11

- Removed the max retry attempts system so VisaFlowX retries continuously until OTP or manual stop.
- Added credential save, update, and clear controls with validation and toast feedback.
- Reworked scheduler UX into separate date and time fields with preview and restart restore.
- Added notification, scheduler, and sound helper modules.
- Improved popup communication errors and removed generic command-failed messaging.
- Added the VisaFlowX page to the MMBS Utilities section.

## 2.0.0 - 2026-05-11

- Rebuilt VisaFlowX as a lightweight IVAC-only MV3 extension.
- Removed universal monitoring, multi-site profiles, rule builders, overlay selector, and advanced dashboards.
- Added focused autofill, verification wait, signin automation, retry recovery, scheduler, OTP alarm handoff, and compact production popup.
- Restricted host permissions to `https://appointment.ivacbd.com/*`.

## 1.0.1 - 2026-05-11

- Previous universal root build.
