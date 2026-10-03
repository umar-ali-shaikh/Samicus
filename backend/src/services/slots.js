// Bookable slots derived from an advocate's weekly schedule minus consultations already
// booked — nothing is hard-coded or randomly marked "full".
const IST_OFFSET = "+05:30";
export const BOOKED_STATES = ["scheduled", "reminder_sent", "in_progress"];

export const DEFAULT_SCHEDULE = { days: [1, 2, 3, 4, 5, 6], start: "09:00", end: "19:00", slotMinutes: 60 };

function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + (m || 0);
}

function pad(n) {
  return String(n).padStart(2, "0");
}

export function normalizeSchedule(input) {
  const s = { ...DEFAULT_SCHEDULE, ...(input || {}) };
  const days = Array.isArray(s.days) ? [...new Set(s.days.map(Number).filter((d) => d >= 0 && d <= 6))] : DEFAULT_SCHEDULE.days;
  const slotMinutes = [15, 30, 45, 60, 90, 120].includes(Number(s.slotMinutes)) ? Number(s.slotMinutes) : 60;
  const start = /^\d{2}:\d{2}$/.test(s.start) ? s.start : DEFAULT_SCHEDULE.start;
  const end = /^\d{2}:\d{2}$/.test(s.end) ? s.end : DEFAULT_SCHEDULE.end;
  if (toMinutes(end) <= toMinutes(start)) throw Object.assign(new Error("Working hours: end must be after start."), { status: 400 });
  return { days, start, end, slotMinutes };
}

/** All slot start instants (ISO strings) a schedule offers on one IST calendar date (YYYY-MM-DD). */
function slotsForDate(date, schedule) {
  const weekday = new Date(`${date}T12:00:00${IST_OFFSET}`).getUTCDay();
  // 12:00 IST is 06:30 UTC the same day, so getUTCDay() is the IST weekday.
  if (!schedule.days.includes(weekday)) return [];
  const out = [];
  for (let t = toMinutes(schedule.start); t + schedule.slotMinutes <= toMinutes(schedule.end); t += schedule.slotMinutes) {
    const time = `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
    out.push({ time, startsAt: new Date(`${date}T${time}:00${IST_OFFSET}`).toISOString() });
  }
  return out;
}

function istDate(d) {
  return new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * @param {object} schedule normalized weekly schedule
 * @param {Set<string>} bookedStartsAt ISO instants already taken
 * @param {{ days?: number, now?: Date, minLeadMinutes?: number }} [opts]
 */
export function buildAvailability(schedule, bookedStartsAt, { days = 7, now = new Date(), minLeadMinutes = 60 } = {}) {
  const earliest = now.getTime() + minLeadMinutes * 60 * 1000;
  const result = [];
  for (let i = 0; i < days; i++) {
    const date = istDate(new Date(now.getTime() + i * 24 * 3600 * 1000));
    const slots = slotsForDate(date, schedule)
      .filter((s) => new Date(s.startsAt).getTime() >= earliest)
      .map((s) => ({ ...s, full: bookedStartsAt.has(s.startsAt) }));
    if (slots.length) result.push({ date, slots });
  }
  return result;
}

export function isOfferedSlot(schedule, startsAtIso, now = new Date(), minLeadMinutes = 60) {
  const d = new Date(startsAtIso);
  if (Number.isNaN(d.getTime())) return false;
  const iso = d.toISOString();
  return slotsForDate(istDate(d), schedule).some((s) => s.startsAt === iso) && d.getTime() >= now.getTime() + minLeadMinutes * 60 * 1000;
}
