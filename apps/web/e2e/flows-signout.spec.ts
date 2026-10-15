// Sign-out hygiene, ported from the legacy frontend/e2e/flows.mjs's "sign out clears every app
// key from storage (shared-device hygiene)" flow.
//
// apps/web has no persistent app shell/header yet (dashboard/page.tsx is still explicitly a
// Phase-2 placeholder -- "the real dashboard... is built per docs/MASTER-PROMPT.md's Phase 3
// domain slices"), so there's no "Account menu" to open first like the legacy fixture's UI had.
// The one real "Sign out" control in the whole app lives directly on /dashboard.
//
// This test manages its own disposable auth user and signs in through the real UI (same
// precedent as flows-auth.spec.ts), rather than reusing the shared `client.json` storageState
// the rest of this suite depends on. That's not just style: discovered the hard way -- Supabase's
// auth.signOut() revokes the session server-side, not just locally, so actually signing out with
// the SHARED client fixture poisons it for every later spec in the same run (every other test
// that loads client.json afterward lands back on /login, signed out).
//
// Found and fixed a real bug while writing this: signOutAction (server/authActions.ts) only ever
// ended the server-side session (httpOnly cookies) -- nothing clears client-side storage, so a
// stale key like AssistantClient.tsx's own `legalAssistant.sessionId.<userId>` (see
// flows-assistant.spec.ts) would survive sign-out indefinitely, visible to the next person on a
// shared device. Fixed with a new SignOutButton client component (components/SignOutButton.tsx)
// that clears both storages right before calling signOutAction; PrivacySection.tsx's
// delete-account flow (which also signs out) got the same fix.
import path from "node:path";
import dotenv from "dotenv";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const repoRoot = path.resolve(__dirname, "../../..");
dotenv.config({ path: path.join(repoRoot, ".env") });

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const EMAIL = `e2e-flow-signout-${Date.now()}@vidhira-e2e.internal`;
const PASSWORD = "correct horse battery";

let authId: string | undefined;
test.afterAll(async () => {
  if (authId) await admin.auth.admin.deleteUser(authId).catch(() => {});
});

test("sign out clears every app key from storage (shared-device hygiene)", async ({ page }) => {
  const { data: created, error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  authId = created.user.id;

  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/dashboard");
  await expect(page.getByRole("heading", { name: "Signed in" })).toBeVisible();

  // Simulates leftover state from this session (an assistant session id, plus something generic)
  // that must never survive into whoever uses this browser next.
  await page.evaluate(() => {
    window.localStorage.setItem("legalAssistant.sessionId.some-user", "stale-session-id");
    window.localStorage.setItem("vidhira.whatever", "stale-value");
    window.sessionStorage.setItem("whatever.else", "1");
  });

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("/login");
  await expect(page.getByText("Welcome back")).toBeVisible();

  const remaining = await page.evaluate(() => ({ local: window.localStorage.length, session: window.sessionStorage.length }));
  expect(remaining.local, "localStorage must be fully cleared on sign-out").toBe(0);
  expect(remaining.session, "sessionStorage must be fully cleared on sign-out").toBe(0);
});
