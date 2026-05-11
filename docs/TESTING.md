# VisaFlowX Testing

Run local static checks:

```powershell
npm test
```

Manual browser checks:

- Load unpacked extension from `D:\VisaFlowX`.
- Save credentials in the popup.
- Open `https://appointment.ivacbd.com/signin`.
- Start automation and confirm `LOGIN_PAGE` detection.
- Confirm Cloudflare is highlighted and waits for human verification.
- Confirm OTP page stops automation and starts the alarm.
- Schedule a future run and confirm the countdown and automatic start.
- Clear schedule and confirm the Chrome alarm is removed.
