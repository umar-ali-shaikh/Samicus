import test from "node:test";
import assert from "node:assert/strict";
import { buildAvailability, isOfferedSlot, normalizeSchedule, DEFAULT_SCHEDULE } from "./slots.js";

// 2026-10-05 is a Monday. 06:00 UTC = 11:30 IST.
const NOW = new Date("2026-10-05T06:00:00Z");

test("normalizeSchedule falls back to defaults and rejects an inverted window", () => {
  assert.deepEqual(normalizeSchedule(undefined), DEFAULT_SCHEDULE);
  assert.throws(() => normalizeSchedule({ start: "18:00", end: "09:00" }), /end must be after start/);
  assert.equal(normalizeSchedule({ slotMinutes: 17 }).slotMinutes, 60);
});

test("buildAvailability offers only future slots, skips non-working days and marks booked slots full", () => {
  const schedule = normalizeSchedule({ days: [1, 2], start: "09:00", end: "13:00", slotMinutes: 60 });
  const booked = new Set([new Date("2026-10-05T14:00:00+05:30").toISOString()]);
  const days = buildAvailability(schedule, booked, { now: NOW, days: 3 });

  // Monday: 09:00–12:00 slots; 09/10/11 are before now+1h lead (11:30 IST → earliest 12:30), so only none until...
  const monday = days.find((d) => d.date === "2026-10-05");
  assert.equal(monday, undefined, "no Monday slot is at least an hour away within a 09–13 window");
  const tuesday = days.find((d) => d.date === "2026-10-06");
  assert.deepEqual(tuesday.slots.map((s) => s.time), ["09:00", "10:00", "11:00", "12:00"]);
  assert.equal(days.some((d) => d.date === "2026-10-07"), false, "Wednesday is not a working day");

  const widened = buildAvailability(normalizeSchedule({ days: [1], start: "09:00", end: "19:00" }), booked, { now: NOW, days: 1 });
  const full = widened[0].slots.find((s) => s.time === "14:00");
  assert.equal(full.full, true);
  assert.equal(widened[0].slots.find((s) => s.time === "15:00").full, false);
});

test("isOfferedSlot accepts only exact schedule slots with enough lead time", () => {
  const schedule = normalizeSchedule({ days: [2], start: "09:00", end: "12:00", slotMinutes: 60 });
  assert.equal(isOfferedSlot(schedule, "2026-10-06T10:00:00+05:30", NOW), true);
  assert.equal(isOfferedSlot(schedule, "2026-10-06T10:30:00+05:30", NOW), false, "off-grid time");
  assert.equal(isOfferedSlot(schedule, "2026-10-07T10:00:00+05:30", NOW), false, "non-working day");
  assert.equal(isOfferedSlot(schedule, "2026-10-05T12:00:00+05:30", NOW), false, "Monday is not a working day here");
  assert.equal(isOfferedSlot(schedule, "garbage", NOW), false);
});
