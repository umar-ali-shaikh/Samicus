// Matter detail, ported from the legacy frontend/e2e/flows.mjs's "matter: client sees fees and
// can't see advocate-only tools; tasks complete via API" flow. The legacy flow checked the
// task-complete request payload via network interception; this checks the resulting tasks
// DATABASE ROW instead -- see flows-auth.spec.ts's header comment for why.
//
// The legacy flow's "Online payment isn't enabled" assertion is NOT ported: that copy only
// renders on an unpaid invoice AND only while Razorpay keys are absent from .env, so it would
// make this spec's outcome depend on local payment configuration rather than app behaviour.
// The fee proposal itself (and the absence of the advocate-only proposal/invoice forms) is
// still checked.
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

const TASK_LABEL = "Upload purchase order";
const SCOPE_TEXT = "E2E scope: demand notice and recovery follow-up.";

// The task, fee proposal and the task_completed timeline event the app writes aren't tracked
// by global-setup.ts's seed.json, and all three reference the shared seeded matter -- left
// behind, they'd block global-teardown.ts from deleting it via FK violation.
let taskId: string | undefined;
let proposalId: string | undefined;
let testStart: string | undefined;
test.afterAll(async () => {
  if (testStart) await admin.from("timeline_events").delete().eq("matter_id", ids.matterId).eq("type", "task_completed").gte("occurred_at", testStart);
  if (taskId) await admin.from("tasks").delete().eq("id", taskId);
  if (proposalId) await admin.from("fee_proposals").delete().eq("id", proposalId);
});

test("matter: client sees fees and can't see advocate-only tools; tasks complete via API", async ({ page }) => {
  testStart = new Date().toISOString();

  const { data: task, error: taskErr } = await admin.from("tasks").insert({ matter_id: ids.matterId, label: TASK_LABEL, owner_type: "client" }).select().single();
  if (taskErr) throw new Error(`insert tasks failed: ${taskErr.message}`);
  taskId = task.id as string;

  const { data: proposal, error: proposalErr } = await admin
    .from("fee_proposals")
    .insert({ matter_id: ids.matterId, advocate_id: ids.advocateId, scope_text: SCOPE_TEXT, milestones: [{ label: "Demand notice", amount: 3200 }] })
    .select()
    .single();
  if (proposalErr) throw new Error(`insert fee_proposals failed: ${proposalErr.message}`);
  proposalId = proposal.id as string;

  await page.goto(`/matters/${ids.matterId}`);
  await expect(page.getByText("E2E Test Matter").first()).toBeVisible();

  await page.getByRole("button", { name: "Tasks & hearings" }).click();
  await expect(page.getByText(TASK_LABEL, { exact: true })).toBeVisible();
  await expect(page.getByText("Add a task"), "advocate-only form must be hidden from clients").toHaveCount(0);
  await expect(page.getByText("List a hearing"), "advocate-only form must be hidden from clients").toHaveCount(0);

  const checkbox = page.getByLabel(TASK_LABEL);
  await expect(checkbox).toBeEnabled();
  await checkbox.check();
  await expect(checkbox).toBeChecked();

  // The real tasks row, not the request payload.
  await expect
    .poll(async () => (await admin.from("tasks").select("completed_at").eq("id", taskId!).single()).data?.completed_at ?? null, { timeout: 10_000 })
    .not.toBeNull();

  await page.getByRole("button", { name: "Fees" }).click();
  await expect(page.getByText(/^Fee proposal · /)).toBeVisible();
  await expect(page.getByText(SCOPE_TEXT)).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept & confirm engagement" })).toBeVisible();
  await expect(page.getByText("Send a fee proposal"), "advocate-only form must be hidden from clients").toHaveCount(0);
  await expect(page.getByText("Raise an invoice"), "advocate-only form must be hidden from clients").toHaveCount(0);
});
