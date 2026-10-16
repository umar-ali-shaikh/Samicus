/**
 * DB access for the admin (trust & safety) domain. Ported from routes/admin.js's inline
 * Supabase calls -- same queries, same behaviour.
 */
import { getSupabase } from "../../config/db.js";

// The exact PostgrestFilterBuilder instance returned by .select() on this project's
// (ungenerated, see access.ts's file comment) Supabase client -- derived via typeof rather than
// imported, since every filter method (.eq/.gte/.not/...) narrows its own generic parameters.
type FilterBuilder = ReturnType<ReturnType<ReturnType<typeof getSupabase>["from"]>["select"]>;

export async function count(table: string, apply: (q: FilterBuilder) => FilterBuilder = (q) => q): Promise<number> {
  const { count: n, error } = await apply(getSupabase().from(table).select("*", { count: "exact", head: true }));
  if (error) throw error;
  return n || 0;
}

export interface VerificationCheck {
  type: string;
  status: string;
  detail?: string | null;
  note?: string;
}

export interface VerificationCaseListRow {
  id: string;
  checks: VerificationCheck[];
  decision: "pending" | "approved" | "sent_back";
  created_at: string;
  advocate: {
    id: string;
    bar_council: string;
    enrolment_number: string;
    enrolment_year: number | null;
    city: string | null;
    years_of_practice: number | null;
    education: string[];
    verification_status: string;
    user: { full_name: string; email: string | null } | null;
    advocate_practice_areas: Array<{ practice_area: { name: string } | null }>;
  };
}

export async function listPendingVerificationCases(): Promise<VerificationCaseListRow[]> {
  const { data, error } = await getSupabase()
    .from("verification_cases")
    .select(
      "id, checks, decision, created_at, advocate:advocates(id, bar_council, enrolment_number, enrolment_year, city, years_of_practice, education, verification_status, user:users(full_name, email), advocate_practice_areas(practice_area:practice_areas(name)))",
    )
    .eq("decision", "pending")
    .order("created_at");
  if (error) throw error;
  return data as unknown as VerificationCaseListRow[];
}

export interface VerificationCaseRow {
  id: string;
  advocate_id: string;
  checks: VerificationCheck[];
  decision: "pending" | "approved" | "sent_back";
  decided_at: string | null;
  reviewer_id: string | null;
  created_at: string;
}

export async function getVerificationCaseById(id: string): Promise<VerificationCaseRow | null> {
  const { data, error } = await getSupabase().from("verification_cases").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as VerificationCaseRow | null;
}

export async function updateVerificationCase(id: string, patch: { decision: string; checks: VerificationCheck[]; decided_at: string; reviewer_id: string }): Promise<VerificationCaseRow> {
  const { data, error } = await getSupabase().from("verification_cases").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data as VerificationCaseRow;
}

export async function updateAdvocateVerificationStatus(advocateId: string, status: string): Promise<{ user_id: string }> {
  const { data, error } = await getSupabase().from("advocates").update({ verification_status: status }).eq("id", advocateId).select("user_id").single();
  if (error) throw error;
  return data as { user_id: string };
}

export async function updateUserKycStatus(userId: string, status: string): Promise<void> {
  const { error } = await getSupabase().from("users").update({ kyc_status: status }).eq("id", userId);
  if (error) throw error;
}

export async function insertVerificationAuditLog(input: { actorId: string; subjectId: string; reason: string | null }): Promise<void> {
  const { error } = await getSupabase().from("audit_logs").insert({
    actor_id: input.actorId,
    actor_role: "admin",
    action: "advocate_verification_decision",
    subject_type: "Advocate",
    subject_id: input.subjectId,
    reason: input.reason,
  });
  if (error) throw error;
}

export async function findMatterIdByReference(reference: string): Promise<string | null> {
  const { data, error } = await getSupabase().from("matters").select("id").eq("reference", reference).maybeSingle();
  if (error) throw error;
  return (data as { id: string } | null)?.id ?? null;
}

export async function insertAdminAccessGrant(input: { actorId: string; matterId: string; reason: string; outcome: "recorded" | "denied" }): Promise<{ id: string; reason: string; created_at: string }> {
  const { data, error } = await getSupabase()
    .from("admin_access_grants")
    .insert({ actor_id: input.actorId, matter_id: input.matterId, reason: input.reason, outcome: input.outcome })
    .select("id, reason, created_at")
    .single();
  if (error) throw error;
  return data as { id: string; reason: string; created_at: string };
}

export async function listAdminAccessGrants(limit = 100): Promise<Record<string, unknown>[]> {
  const { data, error } = await getSupabase()
    .from("admin_access_grants")
    .select("id, reason, outcome, created_at, actor:users(full_name, email), matter:matters(id, reference, title)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as Record<string, unknown>[];
}
