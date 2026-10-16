// Dedicated tests for behaviour not already exercised elsewhere: the directory's new
// pagination (headers + bounded query, while the response body stays a plain array --
// see router.ts's comment), and the IDOR boundary on self-service requests (an advocate
// must never see a request that was never offered to them).
import { test, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import { createFakeSupabase } from "../../test/fakeSupabase.js";
import { mockJwtVerification } from "../../test/mockAuth.js";

const ADVOCATE_A_AUTH = { id: "auth-adv-a", email: "adv-a@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: {}, app_metadata: {} };
const ADVOCATE_B_AUTH = { id: "auth-adv-b", email: "adv-b@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: {}, app_metadata: {} };
const AUTH_USERS = { "tok-adv-a": ADVOCATE_A_AUTH, "tok-adv-b": ADVOCATE_B_AUTH };

const PA = "11111111-1111-4111-8111-111111111111";
const ADV_A = "22222222-2222-4222-8222-222222222222";
const ADV_B = "33333333-3333-4333-8333-333333333333";
const ACCOUNT_ID = "44444444-4444-4444-8444-444444444444";
const INTAKE_OFFERED_TO_A = "55555555-5555-4555-8555-555555555555";
const INTAKE_OFFERED_TO_B = "66666666-6666-4666-8666-666666666666";

function advocateRow(id, overrides = {}) {
  return {
    id,
    bar_council: "Bar Council",
    enrolment_number: "EN/1",
    sub_specialisations: [],
    education: [],
    relevant_experience: [],
    accepts_urgent: false,
    chamber_address: null,
    city: "Pune",
    keywords: [],
    weekly_schedule: { days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00", slotMinutes: 60 },
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    verification_status: "verified",
    availability_state: "available",
    instant_fee: 1000,
    scheduled_fee: 1500,
    ...overrides,
  };
}

const fake = createFakeSupabase({
  authUsers: AUTH_USERS,
  unique: { users: [{ cols: ["auth_id"] }] },
  // The real conflict_checks row also carries updated_at (and created_at, which the fake adds on
  // insert); modelling it here is what catches a response that leaks the whole row.
  defaults: { conflict_checks: { updated_at: "2026-01-01T00:00:00.000Z" } },
  tables: {
    practice_areas: [{ id: PA, name: "Family" }],
    advocates: [
      advocateRow(ADV_A, { user_id: "u-adv-a" }),
      advocateRow(ADV_B, { user_id: "u-adv-b" }),
    ],
    accounts: [{ id: ACCOUNT_ID, type: "individual", display_name: "Client Account" }],
    intake_requests: [
      { id: INTAKE_OFFERED_TO_A, account_id: ACCOUNT_ID, created_by: "u-client", urgency: "week", mode: "video", language: "en", status: "searching" },
      { id: INTAKE_OFFERED_TO_B, account_id: ACCOUNT_ID, created_by: "u-client", urgency: "week", mode: "video", language: "en", status: "searching" },
    ],
    match_results: [{ id: "m1", intake_id: INTAKE_OFFERED_TO_A, advocate_id: ADV_A }],
  },
});
// Users rows must exist for provisionUser's auth_id lookup to find them on first call.
fake.db.users = [
  { id: "u-adv-a", auth_id: "auth-adv-a", email: "adv-a@example.com", full_name: "Advocate A", role: "advocate" },
  { id: "u-adv-b", auth_id: "auth-adv-b", email: "adv-b@example.com", full_name: "Advocate B", role: "advocate" },
];
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
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) };
}

test("GET /advocates: response body stays a plain array; pagination metadata is in headers", async () => {
  const res = await call("GET", "/advocates?pageSize=1");
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.equal(res.body.length, 1, "pageSize=1 must bound the array itself, not just report a total");
  assert.equal(res.headers.get("x-total-count"), "2");
  assert.equal(res.headers.get("x-page-size"), "1");
  assert.equal(res.headers.get("x-has-more"), "true");
});

test("GET /advocates: second page returns the remaining advocate", async () => {
  const res = await call("GET", "/advocates?pageSize=1&page=1");
  assert.equal(res.body.length, 1);
  assert.equal(res.headers.get("x-has-more"), "false");
});

test("IDOR: an advocate cannot see a request that was never offered to them", async () => {
  const mine = await call("GET", `/advocate/requests/${INTAKE_OFFERED_TO_A}`, { token: "tok-adv-a" });
  assert.equal(mine.status, 200);

  const notMine = await call("GET", `/advocate/requests/${INTAKE_OFFERED_TO_A}`, { token: "tok-adv-b" });
  assert.equal(notMine.status, 404, "must be 404, not 403, so request ids can't be probed");

  const conflictCheck = await call("POST", `/advocate/requests/${INTAKE_OFFERED_TO_A}/conflict-check`, { token: "tok-adv-b" });
  assert.equal(conflictCheck.status, 404);

  const accept = await call("POST", `/advocate/requests/${INTAKE_OFFERED_TO_A}/accept`, { token: "tok-adv-b" });
  assert.equal(accept.status, 404);

  const decline = await call("POST", `/advocate/requests/${INTAKE_OFFERED_TO_A}/decline`, { token: "tok-adv-b" });
  assert.equal(decline.status, 404);
});

test("conflict check on an offered request: 200 with only the DTO's fields, and the request moves to advocate_reviewing", async () => {
  const res = await call("POST", `/advocate/requests/${INTAKE_OFFERED_TO_A}/conflict-check`, { token: "tok-adv-a" });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.status, "clear");
  assert.equal(res.body.counterpartyChecked, false);
  assert.equal(res.body.created_at, undefined);
  assert.equal(res.body.updated_at, undefined);
  assert.equal(fake.db.intake_requests.find((i) => i.id === INTAKE_OFFERED_TO_A).status, "advocate_reviewing");
});

test("advocate's own requests list only shows requests actually offered to them", async () => {
  const listA = await call("GET", "/advocate/requests", { token: "tok-adv-a" });
  assert.equal(listA.status, 200);
  assert.deepEqual(listA.body.map((r) => r.id), [INTAKE_OFFERED_TO_A]);

  const listB = await call("GET", "/advocate/requests", { token: "tok-adv-b" });
  assert.deepEqual(listB.body, [], "advocate B has no offered requests (only a conflict-check row would offer one)");
});

test("GET /advocates/:id/slots returns a shape the booking UI can render", async () => {
  const res = await call("GET", `/advocates/${ADV_A}/slots`);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  if (res.body.length) {
    assert.ok("date" in res.body[0] && "slots" in res.body[0]);
  }
});
