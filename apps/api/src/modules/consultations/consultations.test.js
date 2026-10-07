// Dedicated tests for the consultations domain: booking (ported from app.test.js: consent,
// real slots, no double-booking), IDOR on an uninvolved user, the client/advocate
// side-permission matrix on PATCH, feedback, the room join timing window, and
// convert-to-matter.
import { test, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import { createFakeSupabase } from "../../test/fakeSupabase.js";
import { mockJwtVerification } from "../../test/mockAuth.js";

const ALICE = { id: "auth-alice", email: "alice@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: { full_name: "Alice Rao" }, app_metadata: { provider: "email" } };
const BOB = { id: "auth-bob", email: "bob@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: {}, app_metadata: { provider: "email" } };
const ADV_AUTH = { id: "auth-adv", email: "adv@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: {}, app_metadata: {} };
const AUTH_USERS = { "tok-alice": ALICE, "tok-bob": BOB, "tok-adv": ADV_AUTH };

const PA = "11111111-1111-4111-8111-111111111111";
const ADV = "22222222-2222-4222-8222-222222222222";

const fake = createFakeSupabase({
  defaults: {
    consultations: {
      state: "scheduled", duration_minutes: 30, room_token: null, recording_enabled: false, notes: null,
      converted_matter_id: null, payment_method: null, paid_at: null, csat_rating: null, csat_comment: null,
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    advocates: { updated_at: "2026-01-01T00:00:00.000Z" },
    accounts: { seat_limit: 1 },
    intake_requests: {
      description: null, counterparty_name: null, voice_transcript_id: null, situation_id: null,
      routing_confidence: null, city: null, state: null, forum: null, consent_given_at: null,
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  },
  authUsers: AUTH_USERS,
  embeds: { "account_members.account": (row, db) => db.accounts.find((a) => a.id === row.account_id) },
  unique: {
    users: [{ cols: ["auth_id"] }],
    accounts: [{ cols: ["display_name"] }],
    consultations: [{ cols: ["advocate_id", "scheduled_start"], when: (r) => ["scheduled", "reminder_sent", "in_progress"].includes(r.state ?? "scheduled") }],
  },
  tables: {
    practice_areas: [{ id: PA, name: "Family" }],
    advocates: [
      {
        id: ADV, user_id: "u-adv", verification_status: "verified", availability_state: "available", scheduled_fee: 3000, instant_fee: 2500,
        weekly_schedule: { days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "23:00", slotMinutes: 60 },
        advocate_consultation_modes: [{ mode: "video" }],
        bar_council: "Bar Council of Delhi", enrolment_number: "DEL/0001/2010",
        created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
      },
    ],
  },
});
// The advocate's internal `users` row must pre-exist with auth_id set, mirroring how the
// advocates module's own tests seed an advocate's identity (see modules/advocates/advocates.test.js).
fake.db.users = [{ id: "u-adv", auth_id: "auth-adv", email: "adv@example.com", full_name: "Advocate Dan", role: "advocate" }];
mock.module("../../config/db.js", { namedExports: { getSupabase: () => fake.client } });
mockJwtVerification(AUTH_USERS);

let server;
let base;
before(async () => {
  const { createApp } = await import("../../app.js");
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function bookForAlice() {
  const account = (await call("GET", "/accounts", { token: "tok-alice" })).body[0];
  const intake = (await call("POST", "/intake-requests", { token: "tok-alice", body: { accountId: account.id, routedPracticeAreaId: PA, urgency: "week", mode: "video", language: "en", kind: "scheduled" } })).body;
  const slotsRes = await call("GET", `/advocates/${ADV}/slots`);
  const slot = slotsRes.body.flatMap((d) => d.slots).find((s) => !s.full);
  await call("POST", `/intake-requests/${intake.id}/consent`, { token: "tok-alice" });
  const book = await call("POST", "/consultations", { token: "tok-alice", body: { intakeId: intake.id, advocateId: ADV, mode: "video", scheduledStart: slot.startsAt } });
  return book.body;
}

test("consultation booking: consent, real slots, and no double-booking", async () => {
  const account = (await call("GET", "/accounts", { token: "tok-alice" })).body[0];
  const intake = (await call("POST", "/intake-requests", { token: "tok-alice", body: { accountId: account.id, routedPracticeAreaId: PA, urgency: "week", mode: "video", language: "en", kind: "scheduled" } })).body;

  const slotsRes = await call("GET", `/advocates/${ADV}/slots`);
  assert.equal(slotsRes.status, 200);
  const slot = slotsRes.body.flatMap((d) => d.slots).find((s) => !s.full);
  assert.ok(slot, "advocate has bookable slots");

  const book = (extra = {}) => call("POST", "/consultations", { token: "tok-alice", body: { intakeId: intake.id, advocateId: ADV, mode: "video", scheduledStart: slot.startsAt, ...extra } });

  assert.equal((await book()).status, 409, "must consent before booking");
  assert.equal((await call("POST", `/intake-requests/${intake.id}/consent`, { token: "tok-bob" })).status, 404, "another user cannot consent for this request");
  assert.equal((await call("POST", `/intake-requests/${intake.id}/consent`, { token: "tok-alice" })).status, 200);

  assert.equal((await book({ scheduledStart: "2026-10-06T10:17:00+05:30" })).status, 409, "off-grid time is rejected");
  assert.equal((await book({ mode: "phone" })).status, 400, "advocate does not offer phone");

  const ok = await book();
  assert.equal(ok.status, 201);
  assert.equal(ok.body.fee_total, 3000 + 99 + Math.round((3000 + 99) * 0.18));

  const again = await book();
  assert.equal(again.status, 409, "same slot cannot be booked twice");

  const after = (await call("GET", `/advocates/${ADV}/slots`)).body.flatMap((d) => d.slots).find((s) => s.startsAt === slot.startsAt);
  assert.equal(after.full, true, "the booked slot now shows as full");
});

test("IDOR: an uninvolved user gets 404 on every consultation sub-resource", async () => {
  const consultation = await bookForAlice();

  assert.equal((await call("PATCH", `/consultations/${consultation.id}`, { token: "tok-bob", body: { state: "cancelled" } })).status, 404);
  assert.equal((await call("POST", `/consultations/${consultation.id}/feedback`, { token: "tok-bob", body: { rating: 5 } })).status, 404);
  assert.equal((await call("POST", `/consultations/${consultation.id}/room`, { token: "tok-bob" })).status, 404);
  assert.equal((await call("POST", `/consultations/${consultation.id}/convert-to-matter`, { token: "tok-bob" })).status, 404);
});

test("PATCH /consultations/:id enforces the client/advocate state-transition matrix", async () => {
  const consultation = await bookForAlice();

  const clientCompletes = await call("PATCH", `/consultations/${consultation.id}`, { token: "tok-alice", body: { state: "completed" } });
  assert.equal(clientCompletes.status, 403, "a client cannot mark a consultation completed");

  const advocateReschedules = await call("PATCH", `/consultations/${consultation.id}`, { token: "tok-adv", body: { state: "rescheduled" } });
  assert.equal(advocateReschedules.status, 403, "only the client can reschedule");

  const advocateCompletes = await call("PATCH", `/consultations/${consultation.id}`, { token: "tok-adv", body: { state: "completed" } });
  assert.equal(advocateCompletes.status, 200);
  assert.equal(advocateCompletes.body.state, "completed");

  const notes = await call("PATCH", `/consultations/${consultation.id}`, { token: "tok-adv", body: { notes: "Private notes" } });
  assert.equal(notes.status, 200);
  assert.equal(notes.body.notes, "Private notes");
  const clientSetsNotes = await call("PATCH", `/consultations/${consultation.id}`, { token: "tok-alice", body: { notes: "nope" } });
  assert.equal(clientSetsNotes.status, 400, "notes is silently ignored for the client side, leaving nothing to update");
});

test("feedback: only the client can rate, only once completed, rating must be 1-5", async () => {
  const consultation = await bookForAlice();

  assert.equal((await call("POST", `/consultations/${consultation.id}/feedback`, { token: "tok-alice", body: { rating: 5 } })).status, 409, "not completed yet");
  await call("PATCH", `/consultations/${consultation.id}`, { token: "tok-adv", body: { state: "completed" } });

  assert.equal((await call("POST", `/consultations/${consultation.id}/feedback`, { token: "tok-adv", body: { rating: 5 } })).status, 403, "only the client can rate");
  assert.equal((await call("POST", `/consultations/${consultation.id}/feedback`, { token: "tok-alice", body: { rating: 9 } })).status, 400);

  const rated = await call("POST", `/consultations/${consultation.id}/feedback`, { token: "tok-alice", body: { rating: 4, comment: "Helpful" } });
  assert.equal(rated.status, 200);
  assert.equal(rated.body.csat_rating, 4);
});

test("room: opens only within the 15-minute-before to 3-hour-after window", async () => {
  const consultation = await bookForAlice();

  const tooEarly = await call("POST", `/consultations/${consultation.id}/room`, { token: "tok-alice" });
  assert.equal(tooEarly.status, 409);
  assert.match(tooEarly.body.error, /opens 15 minutes before/);

  fake.db.consultations.find((c) => c.id === consultation.id).scheduled_start = new Date(Date.now() - 60 * 1000).toISOString();
  const joined = await call("POST", `/consultations/${consultation.id}/room`, { token: "tok-alice" });
  assert.equal(joined.status, 200);
  assert.match(joined.body.roomUrl, /^https:\/\/meet\.jit\.si\/Vidhira-/);
  assert.equal(joined.body.consultation.state, "in_progress");
});

test("convert-to-matter: advocate-only, opens a matter and a message thread, is idempotent-guarded", async () => {
  const consultation = await bookForAlice();
  await call("PATCH", `/consultations/${consultation.id}`, { token: "tok-adv", body: { state: "completed" } });

  const clientAttempt = await call("POST", `/consultations/${consultation.id}/convert-to-matter`, { token: "tok-alice" });
  assert.equal(clientAttempt.status, 403);

  const converted = await call("POST", `/consultations/${consultation.id}/convert-to-matter`, { token: "tok-adv", body: { title: "Divorce matter" } });
  assert.equal(converted.status, 200);
  assert.equal(converted.body.matter.title, "Divorce matter");
  assert.equal(converted.body.consultation.converted_matter_id, converted.body.matter.id);
  assert.ok(fake.db.message_threads.some((t) => t.matter_id === converted.body.matter.id), "a matter thread is opened");

  const again = await call("POST", `/consultations/${consultation.id}/convert-to-matter`, { token: "tok-adv" });
  assert.equal(again.status, 409);
});
