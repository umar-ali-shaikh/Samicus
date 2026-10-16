// Talk now, ported from the legacy frontend/e2e/flows.mjs's "talk now: requires consent +
// situation, then sends an instant request and computes matches" flow. Payloads are checked via
// the resulting DATABASE ROWS (intake_requests, match_results), not network interception -- see
// flows-auth.spec.ts's header comment for why that's the only option against this app's real,
// server-action-only architecture.
//
// Its sibling in the legacy suite, "urgent help: safety screen -> category -> waits -> advocate
// accepts -> join call", was originally left unported because apps/web had no urgent-help page;
// that page now exists (/urgent-help) and the flow is covered by flows-urgent-help.spec.ts.
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

// Same untracked-row problem as flows-booking.spec.ts: this test's own instant intake isn't
// known to global-setup.ts ahead of time, so global-teardown.ts can't clean it up and it would
// otherwise block deleting the shared client account/user via FK violation.
let createdIntakeId: string | undefined;
test.afterAll(async () => {
  if (!createdIntakeId) return;
  await admin.from("match_results").delete().eq("intake_id", createdIntakeId);
  await admin.from("intake_requests").delete().eq("id", createdIntakeId);
});

test("talk now: requires consent + situation, then sends an instant request and computes matches", async ({ page }) => {
  const testStart = new Date().toISOString();

  const { data: matterRow } = await admin.from("matters").select("account_id").eq("id", ids.matterId).single();
  const clientAccountId = matterRow!.account_id as string;
  const { data: situationRow } = await admin.from("situations").select("id").eq("label_en", "Vendor won't pay / contract breach").single();

  await page.goto("/talk-now");
  await expect(page.getByText("Only the category and city are shared")).toBeVisible();

  // Unlike the legacy wizard (disabled until valid), this screen validates on submit --
  // TalkNowClient's onSubmit rejects an empty form with an inline message rather than ever
  // sending a request.
  const go = page.getByRole("button", { name: "Find an available advocate" });
  await go.click();
  await expect(page.getByText(/Describe the issue in at least a few words/)).toBeVisible();

  await page.getByPlaceholder("Describe the issue in a few sentences").fill("Landlord threatens to evict me tonight without notice.");
  await page.getByLabel("What kind of issue is it?").selectOption({ label: "Vendor won't pay / contract breach" });
  await page.getByRole("checkbox").check();
  await go.click();

  await expect(page.getByText("Waiting for an advocate to accept")).toBeVisible();

  const { data: intakeRows } = await admin.from("intake_requests").select("*").gte("created_at", testStart).order("created_at", { ascending: false }).limit(1);
  const intake = intakeRows![0];
  createdIntakeId = intake.id as string;
  expect(intake.account_id, "intake must be filed under the signed-in client's own account").toBe(clientAccountId);
  expect(intake.kind).toBe("instant");
  expect(intake.urgency).toBe("today");
  expect(intake.mode).toBe("video");
  expect(intake.language).toBe("en");
  expect(intake.situation_id).toBe(situationRow!.id);
  // Talk Now has no separate consent step -- startInstantIntakeAction (intakeActions.ts)
  // consents on the user's behalf immediately after creating the intake, before computing
  // matches, since sharing the issue is what makes an advocate able to see the request at all.
  expect(intake.consent_given_at, "consent must be recorded immediately, before matches are computed").toBeTruthy();

  // "matches computed so advocates are offered the request" -- the legacy assertion's real-row
  // equivalent: a match_results row naming the one verified, matching advocate this suite seeds.
  const { data: matchRows } = await admin.from("match_results").select("*").eq("intake_id", intake.id);
  expect(matchRows, "computeMatches must persist a match for the seeded, matching advocate").toHaveLength(1);
  expect(matchRows![0].advocate_id).toBe(ids.advocateId);
});
