// Booking wizard, ported from the legacy frontend/e2e/flows.mjs's "booking wizard: intake ->
// matches -> slots -> consent -> consultation (payload checks)" flow.
//
// Two things differ from the legacy version, both forced by this app's real architecture (see
// flows-auth.spec.ts's header comment for the full explanation): there is no match-picking step
// here -- apps/web's /advocates/[advocateId]/book route always has a preset advocate (see
// BookingWizard's own comment), so the legacy wizard's step 6 "advocates matched to your issue"
// is simply not part of this route -- and payloads are checked via the resulting DATABASE ROW
// (intake_requests/consultations), not via page.route() interception.
import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const repoRoot = path.resolve(__dirname, "../../..");
dotenv.config({ path: path.join(repoRoot, ".env") });

const AUTH_DIR = path.join(__dirname, ".auth");
const ids = JSON.parse(fs.readFileSync(path.join(AUTH_DIR, "ids.json"), "utf8")) as { matterId: string; advocateId: string };

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

test.use({ storageState: path.join(AUTH_DIR, "client.json") });

// This test's own booking flow creates a real intake_requests row (and, once confirmed, a real
// consultations row) -- unlike the rest of this suite's fixtures, global-setup.ts has no way to
// know its id ahead of time, so it's untracked by seed.json and global-teardown.ts would never
// find it. Left alone, it also blocks teardown from deleting the shared client account/user
// (FK violation), orphaning them for every later run. Clean up both rows here instead.
let createdIntakeId: string | undefined;
test.afterAll(async () => {
  if (!createdIntakeId) return;
  await admin.from("consultations").delete().eq("intake_id", createdIntakeId);
  await admin.from("intake_requests").delete().eq("id", createdIntakeId);
});

test("booking wizard: intake -> slot -> pricing -> consent -> consultation (payload checks via DB rows)", async ({ page }) => {
  const testStart = new Date().toISOString();

  const { data: matterRow } = await admin.from("matters").select("account_id").eq("id", ids.matterId).single();
  const clientAccountId = matterRow!.account_id as string;
  const { data: situationRow } = await admin.from("situations").select("id, mapped_practice_area_id").eq("label_en", "Vendor won't pay / contract breach").single();
  expect(situationRow, `seed.js's reference situations must include "Vendor won't pay / contract breach"`).toBeTruthy();

  await page.goto(`/advocates/${ids.advocateId}/book`);
  await expect(page.getByRole("heading", { name: "Describe the issue" })).toBeVisible();

  // Step 1: describe the issue
  await page.getByPlaceholder(/Describe the issue/).fill("My vendor has not paid ₹4 lakh for six months despite reminders.");
  await page.getByLabel(/Other party/).fill("Acme Traders Pvt Ltd");
  await page.getByRole("button", { name: "Vendor won't pay / contract breach" }).click();
  await expect(page.getByText("Contract & commercial recovery")).toBeVisible();
  const next = () => page.getByRole("button", { name: "Continue" }).click();
  await next();

  // Step 2: urgency
  await expect(page.getByRole("heading", { name: "How soon do you need help?" })).toBeVisible();
  await page.getByRole("button", { name: /Within 48 hours/ }).click();
  await next();

  // Step 3: location
  await expect(page.getByRole("heading", { name: "Location and jurisdiction" })).toBeVisible();
  await page.getByLabel("City", { exact: true }).fill("Pune");
  await next();

  // Step 4: mode (default preselected -- this route's seeded advocate has no configured
  // consultation_modes, so BookingWizard's own "video" fallback is exercised here untouched)
  await expect(page.getByRole("heading", { name: "Consultation mode" })).toBeVisible();
  await next();

  // Step 5: language (default "English" preselected) -- advancing past this step is what
  // actually fires createBookingIntakeAction (POST /intake-requests)
  await expect(page.getByRole("heading", { name: "Preferred language" })).toBeVisible();
  await next();

  // The real intake_requests row this created
  await expect(page.getByRole("heading", { name: "Choose a date and slot" })).toBeVisible();
  const { data: intakeRows } = await admin.from("intake_requests").select("*").gte("created_at", testStart).order("created_at", { ascending: false }).limit(1);
  const intake = intakeRows![0];
  createdIntakeId = intake.id as string;
  expect(intake.account_id, "intake must be filed under the signed-in client's own account").toBe(clientAccountId);
  expect(intake.urgency).toBe("48h");
  expect(intake.city).toBe("Pune");
  expect(intake.mode).toBe("video");
  expect(intake.language).toBe("en");
  expect(intake.kind).toBe("scheduled");
  expect(intake.counterparty_name, "the conflict-check field must reach the row").toBe("Acme Traders Pvt Ltd");
  expect(intake.situation_id).toBe(situationRow!.id);
  expect(intake.routed_practice_area_id, "no explicit practice area chosen, so it must route from the situation's mapping").toBe(situationRow!.mapped_practice_area_id);
  expect(intake.consent_given_at, "consent is a separate, later step -- must not be set yet").toBeFalsy();

  // Step 6: pick the earliest offered day and its earliest open slot
  const dateBtn = page.locator("button", { hasText: /^[A-Z][a-z]{2}, \d/ }).first();
  await expect(dateBtn).toBeVisible();
  const clickedDateLabel = (await dateBtn.textContent())!.trim();
  await dateBtn.click();
  const slotBtn = page.locator("button", { hasText: /^\d{2}:\d{2}$/ }).first();
  await expect(slotBtn).toBeVisible();
  const clickedTimeLabel = (await slotBtn.textContent())!.trim();
  await slotBtn.click();
  await next();

  // Step 7: pricing -- advocate's scheduled_fee (2500, from global-setup.ts) + platform fee (99)
  // + 18% GST, same maths as lib/format.ts's computeFees (ported from services/matching.js)
  await expect(page.getByRole("heading", { name: "Transparent pricing" })).toBeVisible();
  await expect(page.getByText("₹2,500")).toBeVisible();
  await expect(page.getByText("₹99")).toBeVisible();
  await expect(page.getByText("₹468")).toBeVisible();
  await expect(page.getByText("₹3,067")).toBeVisible();
  await next();

  // Step 8: consent gates confirmation; no RAZORPAY_KEY_ID in .env here, so this deployment runs
  // "payments off" -- same codepath the legacy suite's "doesn't collect payments online" flow
  // covered
  await expect(page.getByRole("heading", { name: "Confirm" })).toBeVisible();
  await expect(page.getByText(/doesn't collect payments online/)).toBeVisible();
  const confirmBtn = page.getByRole("button", { name: "Confirm booking" });
  await expect(confirmBtn).toBeDisabled();
  await page.locator('input[type="checkbox"]').check();
  await expect(confirmBtn).toBeEnabled();
  await confirmBtn.click();

  await expect(page.getByText("Your consultation is booked")).toBeVisible();

  // The real consultations row this created, plus consent having landed on the intake first
  const { data: consultationRows } = await admin.from("consultations").select("*").eq("intake_id", intake.id);
  expect(consultationRows, "confirmBookingAction must create exactly one consultation for this intake").toHaveLength(1);
  const consultation = consultationRows![0];
  expect(consultation.advocate_id).toBe(ids.advocateId);
  expect(consultation.account_id).toBe(clientAccountId);
  expect(consultation.mode).toBe("video");
  expect(consultation.state).toBe("scheduled");

  const scheduledStart = new Date(consultation.scheduled_start);
  const actualDateLabel = scheduledStart.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  const actualTimeLabel = scheduledStart.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
  expect(actualDateLabel, "the day clicked in the wizard must be the day actually stored").toBe(clickedDateLabel);
  expect(actualTimeLabel, "09:00-style IST slot labels must round-trip to the matching UTC instant").toBe(clickedTimeLabel);

  // confirmBookingAction (bookingActions.ts) awaits the /consent call before even issuing the
  // /consultations request, so the ordering itself is already guaranteed by the code the
  // consultation row's own existence proves ran -- a wall-clock comparison of consent_given_at
  // vs. consultation.created_at isn't a reliable restatement of that (apps/api and the Supabase
  // Postgres host are different machines with their own clocks, a few ms apart either way).
  const { data: intakeAfter } = await admin.from("intake_requests").select("consent_given_at").eq("id", intake.id).single();
  expect(intakeAfter!.consent_given_at, "consent must be recorded as part of confirming the booking").toBeTruthy();
});
