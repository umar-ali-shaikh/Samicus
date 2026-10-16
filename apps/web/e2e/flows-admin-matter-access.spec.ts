// Break-glass matter access (admin_access_grants) -- new in apps/web, no legacy flows.mjs
// counterpart. An admin must record a reason to open a matter; a too-short reason is refused but
// still logged as `denied`; a real one opens a read-only review and leaves a timeline notice
// (without the reason) that both parties see. Verified via DATABASE ROWS, same as the other
// flows-*.spec.ts files.
import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const repoRoot = path.resolve(__dirname, "../../..");
dotenv.config({ path: path.join(repoRoot, ".env") });

const AUTH_DIR = path.join(__dirname, ".auth");
const ids = JSON.parse(fs.readFileSync(path.join(AUTH_DIR, "ids.json"), "utf8")) as { matterId: string };

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

test.use({ storageState: path.join(AUTH_DIR, "admin.json") });

const REASON = "E2E check: complaint about a missed hearing, reviewing the timeline.";

// admin_access_grants rows and the admin_access timeline event both reference the shared seeded
// matter, so they'd block global-teardown.ts from deleting it; audit_logs has no FK but is
// cleaned up too so the project looks the same before and after.
let testStart: string | undefined;
test.afterAll(async () => {
  if (!testStart) return;
  await admin.from("timeline_events").delete().eq("matter_id", ids.matterId).eq("type", "admin_access").gte("occurred_at", testStart);
  await admin.from("admin_access_grants").delete().eq("matter_id", ids.matterId).gte("created_at", testStart);
  await admin.from("audit_logs").delete().eq("subject_id", ids.matterId).eq("action", "admin_matter_access").gte("at", testStart);
});

test("admin matter access: a reason is required, every attempt is logged, and the parties get a notice", async ({ page }) => {
  testStart = new Date().toISOString();
  const { data: matter } = await admin.from("matters").select("reference").eq("id", ids.matterId).single();
  const reference = matter!.reference as string;

  await page.goto("/admin/matter-access");
  await expect(page.getByRole("heading", { name: "Matter access" })).toBeVisible();

  await page.getByLabel("Matter reference").fill(reference);
  await page.getByLabel("Reason").fill("just looking");
  await page.getByRole("button", { name: "Record reason & open" }).click();
  await expect(page.getByText(/Give a reason of at least/)).toBeVisible();

  await page.getByLabel("Reason").fill(REASON);
  await page.getByRole("button", { name: "Record reason & open" }).click();
  await expect(page.getByText("E2E Test Matter")).toBeVisible();
  await expect(page.getByText("Documents (names only)")).toBeVisible();

  const { data: grants } = await admin.from("admin_access_grants").select("outcome, reason").eq("matter_id", ids.matterId).gte("created_at", testStart);
  expect(grants!.map((g) => g.outcome).sort()).toEqual(["denied", "recorded"]);

  const { data: notices } = await admin.from("timeline_events").select("actor_type, body").eq("matter_id", ids.matterId).eq("type", "admin_access").gte("occurred_at", testStart);
  expect(notices, "only the granted attempt leaves a notice").toHaveLength(1);
  expect(notices![0]!.actor_type).toBe("platform");
  expect(notices![0]!.body, "the reason stays in the access log").not.toContain("missed a hearing");

  // The log on the same page shows both attempts.
  await page.reload();
  await expect(page.getByText("Refused")).toBeVisible();
  await expect(page.getByText(REASON)).toBeVisible();
});
