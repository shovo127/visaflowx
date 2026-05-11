(function initVisaFlowXScheduler(global) {
  "use strict";

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function localDateParts(date = new Date()) {
    return {
      date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
      time: `${pad(date.getHours())}:${pad(date.getMinutes())}`
    };
  }

  function parseLocalRun(dateValue, timeValue) {
    const date = String(dateValue || "").trim();
    const time = String(timeValue || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Choose a schedule date.");
    if (!/^\d{2}:\d{2}$/.test(time)) throw new Error("Choose a schedule time.");
    const runAt = new Date(`${date}T${time}:00`);
    if (Number.isNaN(runAt.getTime())) throw new Error("Schedule date or time is invalid.");
    if (runAt.getTime() <= Date.now()) throw new Error("Schedule time must be in the future.");
    return runAt.getTime();
  }

  function preview(schedule = {}) {
    if (!schedule.enabled || !schedule.nextRunAt) return "Not scheduled";
    const date = new Date(Number(schedule.nextRunAt));
    if (Number.isNaN(date.getTime())) return "Not scheduled";
    return `Next run: ${date.toLocaleString()}`;
  }

  function alarmName() {
    return "vfx-scheduled-run";
  }

  const Scheduler = Object.freeze({
    alarmName,
    localDateParts,
    parseLocalRun,
    preview
  });

  global.VisaFlowX = Object.assign(global.VisaFlowX || {}, { Scheduler });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Scheduler;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
