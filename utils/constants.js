"use strict";

(() => {
  const root = typeof window !== "undefined" ? window : self;

  const WORKFLOW_STATES = {
    IDLE: "IDLE",
    PAGE_DETECTED: "PAGE_DETECTED",
    AUTOFILLING: "AUTOFILLING",
    WAITING_FOR_VERIFICATION: "WAITING_FOR_VERIFICATION",
    VERIFICATION_COMPLETE: "VERIFICATION_COMPLETE",
    SIGNING_IN: "SIGNING_IN",
    OTP_DETECTED: "OTP_DETECTED",
    RETRY_WAIT: "RETRY_WAIT",
    ERROR: "ERROR"
  };

  const STATE_LABELS = {
    IDLE: "Idle",
    PAGE_DETECTED: "Login Page Detected",
    AUTOFILLING: "Autofilling Credentials",
    WAITING_FOR_VERIFICATION: "Waiting for Verification",
    VERIFICATION_COMPLETE: "Verification Complete",
    SIGNING_IN: "Signing In",
    OTP_DETECTED: "OTP Detected",
    RETRY_WAIT: "Retry Countdown",
    ERROR: "Error State"
  };

  const WORKFLOW_STAGES = [
    {
      id: "detect",
      label: "Detect Login Page",
      states: [WORKFLOW_STATES.PAGE_DETECTED]
    },
    {
      id: "autofill",
      label: "Autofill Credentials",
      states: [WORKFLOW_STATES.AUTOFILLING]
    },
    {
      id: "verification-wait",
      label: "Waiting For Verification",
      states: [WORKFLOW_STATES.WAITING_FOR_VERIFICATION]
    },
    {
      id: "verification-complete",
      label: "Verification Completed",
      states: [WORKFLOW_STATES.VERIFICATION_COMPLETE]
    },
    {
      id: "sign-in",
      label: "Clicking Sign In",
      states: [WORKFLOW_STATES.SIGNING_IN]
    },
    {
      id: "otp",
      label: "OTP Page Detected",
      states: [WORKFLOW_STATES.OTP_DETECTED]
    },
    {
      id: "alarm",
      label: "Alarm Triggered",
      states: [WORKFLOW_STATES.OTP_DETECTED]
    }
  ];

  const MESSAGE_TYPES = {
    START_AUTOMATION: "START_AUTOMATION",
    STOP_AUTOMATION: "STOP_AUTOMATION",
    TEST_DETECTION: "TEST_DETECTION",
    TEST_AUTOFILL: "TEST_AUTOFILL",
    PING_CONTENT: "PING_CONTENT",
    RETRY_ALARM_FIRED: "RETRY_ALARM_FIRED",
    GET_STATE: "GET_STATE",
    SAVE_SETTINGS: "SAVE_SETTINGS",
    STATUS_UPDATE: "STATUS_UPDATE",
    SHOW_NOTIFICATION: "SHOW_NOTIFICATION",
    PLAY_ALARM: "PLAY_ALARM",
    STOP_ALARM: "STOP_ALARM",
    UPDATE_SOUND: "UPDATE_SOUND",
    TEST_ALARM: "TEST_ALARM",
    SCHEDULE_RETRY: "SCHEDULE_RETRY",
    CANCEL_RETRY: "CANCEL_RETRY",
    CONTENT_READY: "CONTENT_READY"
  };

  root.VisaFlowXConstants = {
    WORKFLOW_STATES,
    STATE_LABELS,
    WORKFLOW_STAGES,
    MESSAGE_TYPES
  };
})();
