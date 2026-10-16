// Interactive auth-mechanics flows, ported from the legacy frontend/e2e/flows.mjs (stubbed
// network, hash routes, a fake Supabase origin) to the real backend this suite is built around.
//
// One technique from the legacy suite does NOT carry over: it asserted on exact request
// payloads by intercepting browser-level network calls (page.route("**/fake.supabase.co/**")),
// because the legacy app's client-side JS called Supabase directly from the browser. This app
// never does that -- every Supabase/apps/api call happens server-side, in a Server Action
// (see docs/architecture/01-target-architecture.md section 2: "the browser never calls Express
// directly"), invisible to Playwright's network interception entirely. Where the legacy suite
// checked a payload, this suite checks the resulting DATABASE ROW instead, via the same
// service-role admin client global-setup.ts uses -- arguably a stronger check, since it
// validates the full round trip (form -> Server Action -> Supabase/apps/api), not just what
// was sent on the wire.
//
// These tests manage their own disposable auth users per-test (not the shared per-role
// storageState global-setup.ts creates for the rest of this suite) since they test signup/
// login from a signed-out state. Never point this at a production Supabase project.
import path from "node:path";
import dotenv from "dotenv";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const repoRoot = path.resolve(__dirname, "../../..");
dotenv.config({ path: path.join(repoRoot, ".env") });

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const RUN = Date.now();
function freshEmail(tag: string) {
  return `e2e-flow-${tag}-${RUN}@vidhira-e2e.internal`;
}
// Supabase's real, public signUp() validates the email domain more strictly than the
// service-role admin API does -- @vidhira-e2e.internal (fine for admin.createUser(), used
// everywhere else in this suite) is rejected outright as "invalid" by signUp() itself.
// example.com is IANA-reserved for exactly this kind of documentation/testing use and passes.
function freshRealEmail(tag: string) {
  return `e2e-flow-${tag}-${RUN}@example.com`;
}

const createdAuthIds: string[] = [];
test.afterAll(async () => {
  for (const id of createdAuthIds) await admin.auth.admin.deleteUser(id).catch(() => {});
});

test("signed out: login screen offers Google, and starts a real PKCE redirect with the right provider", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("Welcome back")).toBeVisible();
  await expect(page.getByRole("button", { name: /Continue with Google/ })).toBeVisible();

  // signInWithOAuth() returns a redirect to the real Supabase project's own /authorize
  // endpoint, which the BROWSER then navigates to -- a real request, unlike the server-side
  // supabase-js call that produced it, so it's interceptable here. Fulfilling it with a stub
  // response (instead of letting the real chain continue on to Google's own login page) is
  // the deterministic equivalent of the legacy suite never actually leaving its stubbed origin.
  let authorizeUrl: URL | null = null;
  await page.route("**/auth/v1/authorize**", async (route) => {
    authorizeUrl = new URL(route.request().url());
    await route.fulfill({ status: 200, contentType: "text/html", body: "<html>stubbed google redirect</html>" });
  });
  await page.getByRole("button", { name: /Continue with Google/ }).click();
  await expect.poll(() => authorizeUrl).not.toBeNull();
  expect(authorizeUrl!.pathname).toContain("/authorize");
  expect(authorizeUrl!.searchParams.get("provider")).toBe("google");
  expect(authorizeUrl!.searchParams.get("code_challenge"), "PKCE challenge present").toBeTruthy();
  expect(authorizeUrl!.searchParams.get("redirect_to")).toContain("/api/bff/auth/callback");
});

test("sign up with email -> verify-email screen; resend works; the real auth user is created unconfirmed", async ({ page }) => {
  const email = freshRealEmail("signup");
  await page.goto("/signup");
  await expect(page.getByText("Create your account")).toBeVisible();
  await page.getByLabel("Full name").fill("E2E Flow User");
  await page.getByLabel("Email").fill(email);
  await page.locator('input[name="password"]').fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();

  // exact: Next's route announcer also says "Verify your email — Vidhira" once navigation settles.
  await expect(page.getByText("Verify your email", { exact: true })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const created = authList.users.find((u) => u.email === email);
  expect(created, "signUpAction must create a real Supabase Auth user").toBeTruthy();
  createdAuthIds.push(created!.id);
  expect(created!.user_metadata?.full_name, "the name field must reach Supabase as user metadata").toBe("E2E Flow User");
  expect(created!.email_confirmed_at, "a brand-new signup must start unconfirmed").toBeFalsy();

  // Resending seconds after signup can hit Supabase's per-address cooldown (60s by default on a
  // hosted project), which the app turns into a friendly "please wait" -- either outcome proves the
  // resend reached Supabase and its reply was handled, rather than a raw error or nothing at all.
  await page.getByRole("button", { name: "Resend verification email" }).click();
  await expect(page.getByText(/Verification email sent|Please wait a little before requesting another email/)).toBeVisible();
});

test("short password is rejected client-side before any Supabase account is created", async ({ page }) => {
  const email = freshEmail("shortpw");
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("E2E Flow User");
  await page.getByLabel("Email").fill(email);
  await page.locator('input[name="password"]').fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/at least 8 characters/)).toBeVisible();

  const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  expect(authList.users.some((u) => u.email === email), "no account should exist for a password rejected before any signup call").toBe(false);
});

test("signing in before email confirmation shows a clear message, not a silent bounce; succeeds once confirmed", async ({ page }) => {
  const email = freshEmail("unverified");
  const { data: created, error } = await admin.auth.admin.createUser({ email, password: "correct horse battery", email_confirm: false });
  if (error) throw error;
  createdAuthIds.push(created.user.id);

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.locator('input[name="password"]').fill("correct horse battery");
  await page.getByRole("button", { name: "Sign in" }).click();
  // Found by this test, fixed in authActions.ts: signInWithPassword() rejects an unconfirmed
  // user without ever establishing a session, so the old code's redirect("/verify-email")
  // bounced straight back to /login (that page requires a real session) with zero visible
  // feedback -- a silent, confusing dead end. Confirmed via a temporary debug log showing
  // verify-email's own getUser() returned null when reached this way. Now shows the message
  // right here instead, same as any other sign-in error.
  await expect(page.getByText(/verify your email before signing in/i)).toBeVisible();
  await expect(page.getByText("Welcome back"), "must stay on /login, not bounce through a dead-end redirect").toBeVisible();

  // Simulates clicking the real confirmation link (which this test can't actually receive an
  // email for) via the same admin API global-setup.ts uses to pre-confirm its own test users.
  await admin.auth.admin.updateUserById(created.user.id, { email_confirm: true });
  await page.getByLabel("Email").fill(email);
  await page.locator('input[name="password"]').fill("correct horse battery");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/dashboard");
  await expect(page.getByRole("heading", { name: "Signed in" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
});

test("an invalidated session redirects back to login on the next protected-page visit", async ({ page }) => {
  const email = freshEmail("expiredsession");
  const { data: created, error } = await admin.auth.admin.createUser({ email, password: "correct horse battery", email_confirm: true });
  if (error) throw error;
  createdAuthIds.push(created.user.id);

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.locator('input[name="password"]').fill("correct horse battery");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/dashboard");

  // Bans the account server-side -- the browser's own session cookie still exists, but Supabase
  // will no longer honour it on the next refresh, which is the real-world equivalent of the
  // legacy suite's stubbed "expired API session (401)" scenario.
  await admin.auth.admin.updateUserById(created.user.id, { ban_duration: "1h" });

  await page.goto("/dashboard");
  await expect(page.getByText("Welcome back")).toBeVisible();

  await admin.auth.admin.updateUserById(created.user.id, { ban_duration: "none" });
});
