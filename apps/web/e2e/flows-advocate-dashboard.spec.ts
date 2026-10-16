// Advocate dashboard, ported from the legacy frontend/e2e/flows.mjs's "advocate dashboard:
// conflict check gates acceptance" flow. The legacy flow stubbed the conflict-check response and
// only asserted the pending state; this runs the real conflict check and verifies the resulting
// conflict_checks DATABASE ROW -- see flows-auth.spec.ts's header comment for why rows, not
// network interception.
//
// Deliberately stops short of clicking "Accept request": accepting runs the real
// accept-and-open-matter RPC (new matter, thread, timeline rows), which is a much larger cleanup
// surface for no extra coverage of the gate this flow is about.
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

test.use({ storageState: path.join(AUTH_DIR, "advocate.json") });

// Unique per run, so this spec's card can be told apart from any other open request offered to
// the seeded advocate (e.g. one flows-talknow.spec.ts's real matching produced).
const CITY = `E2E Conflict City ${Date.now()}`;

// The intake, match_results and conflict_checks rows below aren't tracked by global-setup.ts's
// seed.json, and the intake references the shared seeded client account/user -- left behind,
// they'd block global-teardown.ts from deleting those via FK violation.
let intakeId: string | undefined;
test.afterAll(async () => {
  if (!intakeId) return;
  await admin.from("conflict_checks").delete().eq("intake_id", intakeId);
  await admin.from("match_results").delete().eq("intake_id", intakeId);
  await admin.from("intake_requests").delete().eq("id", intakeId);
});

test("advocate dashboard: conflict check gates acceptance", async ({ page }) => {
  // An open request offered to the seeded advocate, from the seeded client's account.
  const { data: matter, error: matterErr } = await admin.from("matters").select("account_id").eq("id", ids.matterId).single();
  if (matterErr) throw new Error(`load seeded matter failed: ${matterErr.message}`);
  const { data: owner, error: ownerErr } = await admin.from("account_members").select("user_id").eq("account_id", matter.account_id).eq("role", "owner").single();
  if (ownerErr) throw new Error(`load seeded account owner failed: ${ownerErr.message}`);

  const { data: intake, error: intakeErr } = await admin
    .from("intake_requests")
    .insert({ account_id: matter.account_id, created_by: owner.user_id, urgency: "week", mode: "video", language: "en", kind: "instant", status: "searching", city: CITY })
    .select()
    .single();
  if (intakeErr) throw new Error(`insert intake_requests failed: ${intakeErr.message}`);
  intakeId = intake.id as string;
  const { error: matchErr } = await admin.from("match_results").insert({ intake_id: intakeId, advocate_id: ids.advocateId, rank: 1 });
  if (matchErr) throw new Error(`insert match_results failed: ${matchErr.message}`);

  await page.goto("/lawyer");
  await expect(page.getByText("Incoming requests")).toBeVisible();

  const card = page.locator("div").filter({ hasText: CITY }).filter({ has: page.getByRole("button", { name: "Accept request" }) }).last();
  await expect(card.getByText("Conflict check: pending")).toBeVisible();
  await expect(card.getByRole("button", { name: "Accept request" }), "accepting must be gated on a clear conflict check").toBeDisabled();

  // No counterparty_name on this intake, so the real check has nothing to conflict with.
  await card.getByRole("button", { name: "Run conflict check" }).click();
  await expect(card.getByText(/Conflict check clear\./)).toBeVisible();
  await expect(card.getByText("Conflict check: clear")).toBeVisible();
  await expect(card.getByRole("button", { name: "Accept request" })).toBeEnabled();

  const { data: check } = await admin.from("conflict_checks").select("status").eq("intake_id", intakeId).eq("advocate_id", ids.advocateId).single();
  expect(check?.status).toBe("clear");
  const { data: intakeAfter } = await admin.from("intake_requests").select("status").eq("id", intakeId).single();
  expect(intakeAfter?.status, "a clear check on a searching request moves it to advocate_reviewing").toBe("advocate_reviewing");
});
