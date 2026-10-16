import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke-level e2e coverage (Phase 5 of docs/MASTER-PROMPT.md): every screen renders, no
 * console/page errors, no serious/critical axe-core a11y violations -- matching the legacy
 * frontend/e2e/smoke.mjs's breadth (every screen, every role). Its sibling flows.mjs
 * (interactive flows) is ported as e2e/flows-*.spec.ts; see e2e/README.md for the list and
 * which of them make metered AI/Indian Kanoon calls.
 *
 * Runs against REAL apps/api + apps/web (webServer below), backed by the real Supabase/Qdrant
 * project in .env -- not a stubbed network like the legacy suite. e2e/global-setup.ts creates
 * disposable test users + the minimal seed data each screen needs directly via the service-role
 * client, captures one authenticated storageState per role, and e2e/global-teardown.ts deletes
 * all of it afterward.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // shares seeded data/auth state across the whole run; avoid races
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npx tsx --env-file-if-exists=../../.env src/index.js",
      cwd: "../api",
      url: "http://localhost:4000/api/config",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "npx next dev",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
