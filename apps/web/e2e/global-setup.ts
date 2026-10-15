// Creates 4 disposable test users (client, advocate, admin, founder) and the minimal seed data
// each smoke-tested screen needs, directly via the Supabase service-role client -- the same
// "create real rows, clean up in teardown" approach already used for apps/api's Phase 4 load
// test (docs/architecture/04-performance.md), not the legacy frontend's stubbed-network
// approach. admin_access_grants-sensitive write but a dev/staging project only -- confirmed
// before this file was written, never run this against a real production Supabase project.
//
// Roles are assigned by inserting the `users` row directly (auth_id pre-linked) rather than
// going through middleware/auth.ts's normal provisioning flow: admin/founder are normally only
// grantable via the ADMIN_EMAILS/FOUNDER_EMAILS env allow-list at first login
// (services/auth/provision.ts), and there's no test-only bypass for that -- pre-inserting the
// row with the role already set sidesteps it, matching how apps/api's own fakeSupabase-backed
// tests seed roles directly rather than exercising the bootstrap path.
import path from "node:path";
import dotenv from "dotenv";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import type { SeedIds } from "./seedIds";

const repoRoot = path.resolve(__dirname, "../../..");
dotenv.config({ path: path.join(repoRoot, ".env") });

const AUTH_DIR = path.join(__dirname, ".auth");
const SEED_FILE = path.join(AUTH_DIR, "seed.json");
const IDS_FILE = path.join(AUTH_DIR, "ids.json");

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const seed: SeedIds = { authUserIds: [], rows: [] };
function track(table: string, match: Record<string, string>) {
  seed.rows.push({ table, match });
  // Written after every insert, not just at the end: if a later insert throws, teardown still
  // has a record of everything created so far instead of leaving it permanently orphaned.
  fs.writeFileSync(SEED_FILE, JSON.stringify(seed, null, 2));
}

async function insertOne(table: string, values: Record<string, unknown>): Promise<{ id: string } & Record<string, unknown>> {
  const { data, error } = await admin.from(table).insert(values).select().single();
  if (error) throw new Error(`insert ${table} failed: ${error.message}`);
  track(table, { id: data.id });
  return data;
}

// thread_participants has no `id` column -- its primary key is the (thread_id, participant_id)
// pair (schema.sql), so it needs its own composite-match tracking instead of insertOne's.
async function insertThreadParticipant(threadId: string, participantId: string) {
  const { error } = await admin.from("thread_participants").insert({ thread_id: threadId, participant_id: participantId });
  if (error) throw new Error(`insert thread_participants failed: ${error.message}`);
  track("thread_participants", { thread_id: threadId, participant_id: participantId });
}

// Same composite-key shape as thread_participants, primary key (advocate_id, mode) -- an
// advocate with zero rows here has consultation_modes: [], which the booking wizard correctly
// refuses to let a client book through (see components/booking/BookingWizard.tsx), so the
// seeded E2E advocate needs at least one or flows-booking.spec.ts can never reach "Confirm".
async function insertAdvocateConsultationMode(advocateId: string, mode: string) {
  const { error } = await admin.from("advocate_consultation_modes").insert({ advocate_id: advocateId, mode });
  if (error) throw new Error(`insert advocate_consultation_modes failed: ${error.message}`);
  track("advocate_consultation_modes", { advocate_id: advocateId, mode });
}

// services/matching.js's passesHardFilters requires BOTH an exact practice-area match and (when
// the intake specifies one) a language match -- an advocate with zero advocate_practice_areas/
// advocate_languages rows (true of a freshly-inserted row here) matches nothing, ever, including
// via Talk Now, which is real matching, not a stub. flows-talknow.spec.ts needs this advocate to
// actually be matchable.
async function insertAdvocatePracticeArea(advocateId: string, practiceAreaId: string) {
  const { error } = await admin.from("advocate_practice_areas").insert({ advocate_id: advocateId, practice_area_id: practiceAreaId });
  if (error) throw new Error(`insert advocate_practice_areas failed: ${error.message}`);
  track("advocate_practice_areas", { advocate_id: advocateId, practice_area_id: practiceAreaId });
}

async function insertAdvocateLanguage(advocateId: string, language: string) {
  const { error } = await admin.from("advocate_languages").insert({ advocate_id: advocateId, language });
  if (error) throw new Error(`insert advocate_languages failed: ${error.message}`);
  track("advocate_languages", { advocate_id: advocateId, language });
}

const RUN = Date.now();
function email(role: string) {
  return `e2e-${role}-${RUN}@vidhira-e2e.internal`;
}
const PASSWORD = `E2e-${RUN}-!Aa1`;

async function createAuthUser(roleLabel: string): Promise<{ authId: string; email: string }> {
  const addr = email(roleLabel);
  const { data, error } = await admin.auth.admin.createUser({ email: addr, password: PASSWORD, email_confirm: true });
  if (error) throw new Error(`createUser(${roleLabel}) failed: ${error.message}`);
  seed.authUserIds.push(data.user.id);
  fs.writeFileSync(SEED_FILE, JSON.stringify(seed, null, 2));
  return { authId: data.user.id, email: addr };
}

async function createUserRow(authId: string, authEmail: string, fullName: string, role: "client" | "advocate" | "admin" | "founder") {
  return insertOne("users", { auth_id: authId, email: authEmail, full_name: fullName, role, kyc_status: "verified", preferred_language: "en" });
}

async function createAccount(type: "individual" | "business", displayName: string, userId: string) {
  const account = await insertOne("accounts", { type, display_name: displayName, seat_limit: 5 });
  await insertOne("account_members", { account_id: account.id, user_id: userId, role: "owner", accepted_at: new Date().toISOString() });
  return account;
}

async function main() {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  // ---- 4 disposable users -------------------------------------------------------------
  const client = await createAuthUser("client");
  const advocate = await createAuthUser("advocate");
  const adminAuth = await createAuthUser("admin");
  const founder = await createAuthUser("founder");

  const clientUser = await createUserRow(client.authId, client.email, "E2E Client", "client");
  const advocateUser = await createUserRow(advocate.authId, advocate.email, "E2E Advocate", "advocate");
  const adminUser = await createUserRow(adminAuth.authId, adminAuth.email, "E2E Admin", "admin");
  const founderUser = await createUserRow(founder.authId, founder.email, "E2E Founder", "founder");

  // Business type (not individual) so the client account can also smoke-test Pack compliance
  // without needing an account-switcher flow -- one account per test user keeps "which account
  // is active" unambiguous.
  const clientAccount = await createAccount("business", `E2E Client Account ${RUN}`, clientUser.id);
  await createAccount("individual", `E2E Advocate Account ${RUN}`, advocateUser.id);
  await createAccount("individual", `E2E Admin Account ${RUN}`, adminUser.id);
  await createAccount("individual", `E2E Founder Account ${RUN}`, founderUser.id);

  const advocateRow = await insertOne("advocates", {
    user_id: advocateUser.id,
    bar_council: "E2E Bar Council",
    enrolment_number: `E2E/${RUN}`,
    enrolment_year: 2015,
    verification_status: "verified",
    years_of_practice: 10,
    instant_fee: 1500,
    scheduled_fee: 2500,
    availability_state: "available",
    accepts_urgent: true,
    city: "Bengaluru",
    keywords: ["general advisory"],
  });
  await insertAdvocateConsultationMode(advocateRow.id, "video");
  await insertAdvocateLanguage(advocateRow.id, "en");

  // ---- shared reference rows already seeded by apps/api's boot-time seedAll() ---------
  const { data: situation, error: situationErr } = await admin.from("situations").select("id").limit(1).single();
  if (situationErr) throw new Error(`no situations row found -- did apps/api seed reference data? ${situationErr.message}`);
  const { data: rentalTemplate, error: templateErr } = await admin.from("doc_templates").select("id").eq("name", "Rental Agreement").single();
  if (templateErr) throw new Error(`"Rental Agreement" template not found -- did apps/api seed reference data? ${templateErr.message}`);
  const { data: contractArea, error: areaErr } = await admin.from("practice_areas").select("id").eq("name", "Contract & commercial recovery").single();
  if (areaErr) throw new Error(`"Contract & commercial recovery" practice area not found -- did apps/api seed reference data? ${areaErr.message}`);
  await insertAdvocatePracticeArea(advocateRow.id, contractArea.id);

  // ---- business data: one of nearly everything, enough for each screen to render something
  const intake = await insertOne("intake_requests", {
    account_id: clientAccount.id, created_by: clientUser.id, situation_id: situation.id,
    urgency: "week", mode: "video", language: "en", kind: "scheduled", status: "matched",
  });
  const matter = await insertOne("matters", {
    reference: `E2E-${RUN}`, account_id: clientAccount.id, advocate_id: advocateRow.id,
    title: "E2E Test Matter", stage: "consultation",
  });
  await insertOne("consultations", {
    intake_id: intake.id, advocate_id: advocateRow.id, account_id: clientAccount.id,
    mode: "video", scheduled_start: new Date(Date.now() + 86400000).toISOString(), state: "scheduled",
  });
  await insertOne("documents", {
    account_id: clientAccount.id, matter_id: matter.id, filename: "e2e-test-document.pdf",
    mime: "application/pdf", kind: "Agreements", storage_key: null, uploaded_by: clientUser.id,
  });
  const thread = await insertOne("message_threads", { matter_id: matter.id });
  await insertThreadParticipant(thread.id, clientUser.id);
  await insertThreadParticipant(thread.id, advocateRow.id);
  await insertOne("messages", { thread_id: thread.id, sender_id: clientUser.id, body: "E2E smoke test message." });

  const service = await insertOne("services", {
    category: "notices", name: "E2E Test Service", description: "Seeded for Playwright smoke coverage.",
    professional_fee: 999,
  });
  await insertOne("service_orders", { service_id: service.id, account_id: clientAccount.id, status: "started" });

  const draft = await insertOne("document_drafts", {
    account_id: clientAccount.id, template_id: rentalTemplate.id, template_version: 1,
    created_by: clientUser.id, status: "sent_for_review",
  });
  const draftReview = await insertOne("draft_reviews", { draft_id: draft.id, advocate_id: advocateRow.id, status: "pending" });

  await insertOne("pack_scans", { org_id: clientAccount.id, sku: "E2E-SKU-1", product_name: "E2E Test Product", status: "pass" });
  await insertOne("complaints", { ref: `E2E-${RUN}`, title: "E2E test complaint", raised_by: clientUser.id, status: "open" });
  await insertOne("verification_cases", { advocate_id: advocateRow.id, decision: "pending" });
  await insertOne("public_questions", { author_account_id: clientAccount.id, body: "E2E smoke test question?", status: "pending_moderation" });

  fs.writeFileSync(SEED_FILE, JSON.stringify(seed, null, 2));
  fs.writeFileSync(
    IDS_FILE,
    JSON.stringify({ matterId: matter.id, threadId: thread.id, draftId: draft.id, draftReviewId: draftReview.id, advocateId: advocateRow.id }, null, 2)
  );

  // ---- real sign-in per role, through the actual UI, saved as Playwright storageState -------
  // Deliberately NOT hand-crafting @supabase/ssr's cookie encoding (it chunks large JWTs across
  // multiple sb-<ref>-auth-token.N cookies) -- driving the real /login form and letting the
  // browser capture the real Set-Cookie response is both simpler and a more honest e2e check.
  const browser = await chromium.launch();
  for (const [roleLabel, addr] of [["client", client.email], ["advocate", advocate.email], ["admin", adminAuth.email], ["founder", founder.email]] as const) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("http://localhost:3000/login");
    await page.fill('input[name="email"]', addr);
    await page.fill('input[name="password"]', PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });
    await context.storageState({ path: path.join(AUTH_DIR, `${roleLabel}.json`) });
    await context.close();
  }
  await browser.close();

  console.log(`e2e global-setup: seeded ${seed.rows.length} rows + ${seed.authUserIds.length} auth users, captured 4 storageStates.`);
}

export default main;
