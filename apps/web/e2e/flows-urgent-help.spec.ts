// Urgent help, ported from the legacy frontend/e2e/flows.mjs's "urgent help: safety screen ->
// category -> waits -> advocate accepts -> join call" flow, now that apps/web has the
// /urgent-help page (it previously had none -- see flows-talknow.spec.ts's header). Checks the
// resulting DATABASE ROWS, not network payloads, like the other flows-*.spec.ts files. Stops at
// "waiting for an advocate": accepting is the advocate side, covered by
// flows-advocate-dashboard.spec.ts.
import path from "node:path";
import dotenv from "dotenv";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const repoRoot = path.resolve(__dirname, "../../..");
dotenv.config({ path: path.join(repoRoot, ".env") });

const AUTH_DIR = path.join(__dirname, ".auth");

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

test.use({ storageState: path.join(AUTH_DIR, "client.json") });

// The urgent intake (and the conflict_checks row offering it to an advocate) aren't tracked by
// global-setup.ts, and the intake references the shared seeded client account/user.
let createdIntakeId: string | undefined;
test.afterAll(async () => {
  if (!createdIntakeId) return;
  await admin.from("conflict_checks").delete().eq("intake_id", createdIntakeId);
  await admin.from("match_results").delete().eq("intake_id", createdIntakeId);
  await admin.from("intake_requests").delete().eq("id", createdIntakeId);
});

test("urgent help: safety screen -> category -> consent required -> offered to an available advocate", async ({ page }) => {
  const testStart = new Date().toISOString();

  await page.goto("/urgent-help");
  await expect(page.getByRole("heading", { name: "Is anyone in immediate danger?" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Call 112 now" })).toHaveAttribute("href", "tel:112");
  await page.getByRole("button", { name: /No immediate danger/ }).click();

  await expect(page.getByRole("heading", { name: "What's happening?" })).toBeVisible();
  // The seeded E2E advocate accepts urgent work and practises "Contract & commercial recovery",
  // which is what this category maps to.
  await page.getByRole("radio", { name: "Urgent business injunction" }).click();
  await page.getByRole("button", { name: "Find an advocate now" }).click();
  await expect(page.getByText(/tick the consent box/), "consent is required before anything is sent").toBeVisible();

  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Find an advocate now" }).click();
  await expect(page.getByRole("heading", { name: "Finding an advocate" })).toBeVisible({ timeout: 15_000 });

  const { data: rows } = await admin.from("intake_requests").select("*").eq("kind", "urgent").gte("created_at", testStart).order("created_at", { ascending: false }).limit(1);
  const intake = rows![0]!;
  createdIntakeId = intake.id as string;
  expect(intake.status).toBe("advocate_reviewing");
  expect(intake.urgency).toBe("today");
  expect(intake.consent_given_at, "consent recorded").not.toBeNull();

  const { data: checks } = await admin.from("conflict_checks").select("status").eq("intake_id", intake.id);
  expect(checks, "offered to exactly one advocate, pending their conflict check").toEqual([{ status: "pending" }]);
});
