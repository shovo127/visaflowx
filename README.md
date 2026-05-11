# VisaFlowX

VisaFlowX is a production-grade Chrome Extension for safe IVAC Bangladesh appointment login workflow assistance.

Target site:

```text
https://appointment.ivacbd.com/signin
```

## What It Does

- Saves contact number and password locally in Chrome extension storage.
- Autofills the IVAC login form.
- Detects Cloudflare Turnstile.
- Highlights and focuses the captcha area so the user can complete verification.
- Waits for real Cloudflare verification completion.
- Clicks **Sign In Now** automatically after verification succeeds.
- Detects the OTP page.
- Stops automation immediately on OTP.
- Focuses and highlights the OTP input.
- Plays a loud looping alarm until manually stopped.
- Uses `assets/sounds/videoplayback.m4a` as the primary alarm sound.
- Shows desktop notifications.
- Reads visible retry/cooldown messages and retries automatically after the countdown.

## Important Captcha Limitation

VisaFlowX does not bypass Cloudflare, solve captcha challenges, inject tokens, use captcha-solving APIs, or fake human verification.

Allowed behavior:

- Detect a Turnstile widget.
- Bring it into focus visually.
- Wait for the user to complete verification.
- Continue the normal login workflow after verification is detected.

## Installation

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `D:\VisaFlowX` folder.
6. Open `https://appointment.ivacbd.com/signin`.
7. Click the VisaFlowX extension icon and save credentials.
8. Press **Start Automation** or use `Ctrl + Shift + L`.

## Permissions

- `storage`: saves credentials, settings, and status.
- `notifications`: shows OTP, retry, captcha, and error alerts.
- `tabs`: sends commands to the current IVAC tab.
- `scripting`: supports extension workflow integration.
- `activeTab`: works with the active IVAC tab.
- `alarms`: runs retry countdowns reliably.
- `offscreen`: plays the looping OTP alarm from a Manifest V3 service worker.
- Host permission `https://appointment.ivacbd.com/*`: limits automation to the IVAC appointment site.

## Security

- Passwords are never logged.
- CAPTCHA tokens are never created, edited, or injected.
- OTP is never read or autofilled.
- No unsafe `eval()` is used.
- DOM access is scoped and sanitized.
- Logs are minimal and hide sensitive values.

Note: credentials are stored in `chrome.storage.local` because this build uses the local-only model requested for this project. Anyone with access to the same Chrome profile and machine may be able to access extension storage.

## Popup Controls

- Start Automation
- Stop Automation
- Save Credentials
- Delete Credentials
- Test Autofill
- Test Detection
- Reset Timers
- Fast, Balanced, and Safe delay modes
- Volume slider
- Mute alarm
- Test sound
- Stop alarm

## Status Labels

- IDLE
- PAGE_DETECTED
- AUTOFILLING
- WAITING_FOR_VERIFICATION
- VERIFICATION_COMPLETE
- SIGNING_IN
- OTP_DETECTED
- RETRY_WAIT
- ERROR

## UX Flow

1. Open the popup.
2. Save contact number and password.
3. Press **Start Automation**.
4. VisaFlowX validates credentials and the active IVAC tab.
5. The workflow monitor shows each stage as active or complete.
6. The user completes Cloudflare verification manually when highlighted.
7. VisaFlowX clicks Sign In after verification is detected.
8. VisaFlowX stops on OTP, focuses the OTP field, shows a notification, and plays the alarm.

## Architecture

```text
Popup UI
  -> background/service-worker.js
      -> validates credentials
      -> detects active IVAC tab
      -> injects content scripts when needed
      -> owns notifications, alarms, retry scheduling, offscreen audio
          -> content/automation.js
              -> centralized AutomationController state machine
              -> detector/autofill/retry/otp modules
              -> safe Cloudflare focus/wait handling
                  -> IVAC page DOM
```

Core modules:

- `utils/constants.js`: workflow states, labels, and message constants.
- `content/automation.js`: centralized state-machine controller.
- `content/detector.js`: page, captcha, OTP, and Sign In detection.
- `content/retry-engine.js`: visible cooldown parsing and retry scheduling.
- `background/offscreen.js`: looping alarm playback with `videoplayback.m4a`.

## Developer Debug

The popup includes a collapsible **Developer Debug** panel showing:

- Active tab URL.
- Injection success.
- Detector state.
- Workflow state.
- Content script status.
- Last runtime message.
- Last error.

## Retry Detection Examples

VisaFlowX can parse visible messages like:

- `Try again after 5 minutes`
- `Login after 9 minutes`
- `Please wait 30 seconds`
- `Try again after 1 minute 20 seconds`
- `Please wait 07:30`

When a cooldown is found, the extension schedules a retry and continues automatically after the timer ends.

## Troubleshooting

If autofill does not happen:

- Confirm the extension is enabled.
- Confirm credentials are saved.
- Refresh the IVAC login page.
- Click **Test Detection** in the popup.

If the alarm does not play:

- Confirm volume is above zero.
- Confirm mute is off.
- Confirm `assets/sounds/videoplayback.m4a` exists.
- Click **Test Sound**.
- Check that the extension has the `offscreen` permission.

If Sign In does not click:

- Complete Cloudflare verification manually.
- Wait until the captcha state changes to verified.
- Confirm the Sign In button is visible and enabled.

## Testing

Run the dependency-free checks from the project folder:

```powershell
npm test
```

The test suite verifies:

- Manifest V3 configuration.
- Required files and permissions.
- Retry timer parsing.
- Static safety checks for unsafe `eval()`.
- MutationObserver usage in the automation flow.
- Centralized workflow controller and required popup sections.

Manual browser tests should cover:

- Login page detection.
- Captcha wait flow.
- OTP detection.
- Notification and alarm controls.
- Popup responsiveness.
- Credential save/update/delete persistence.

## FAQ

### Does VisaFlowX solve Cloudflare captcha?

No. It detects the Cloudflare Turnstile widget, highlights it, waits for legitimate user verification, and then continues the login workflow.

### Why does the extension not click the Cloudflare checkbox automatically?

Automatically clicking or solving a Cloudflare challenge is security-challenge automation. VisaFlowX is intentionally limited to compliant workflow assistance.

### Does VisaFlowX auto-fill OTP?

No. It stops at the OTP page, focuses the OTP input, shows a notification, and plays an alarm so the user can enter the OTP manually.

### Where are credentials stored?

Credentials are stored in Chrome extension local storage for this build. Password values are never logged. Chrome extensions do not provide a general-purpose password-manager-grade “Secure Storage API,” so keep the Chrome profile and computer account protected.

### Can delay values be changed?

Yes. Choose Fast, Balanced, or Safe in the popup, edit the delay values, and click **Save Delay Values**.

## Screenshots

Add production screenshots here before publishing:

- Popup dashboard
- Credentials section
- OTP alarm state
- Captcha waiting state

## Known Limitations

- Cloudflare cannot and should not be solved automatically.
- IVAC page DOM changes may require selector updates.
- Chrome local storage is profile-local, not cloud-synced secure password storage.
- Alarm playback can depend on Chrome extension audio policies, but this build uses an offscreen document for reliability.

## Future Improvements

- Optional PIN-based local encryption.
- Export/import settings.
- Branded icons.
- More detailed diagnostics panel.
- Optional light theme.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

MIT. See [LICENSE](LICENSE).
