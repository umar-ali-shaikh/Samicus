/**
 * DB access for the matters domain. Ported from routes/matters.js's inline Supabase calls --
 * same queries, same behaviour. No generated DB types yet; rows are cast to local interfaces
 * matching what each query actually selects.
 */
import { getSupabase } from "../../config/db.js";

// An `undefined`-valued key is indistinguishable from an absent one once Supabase's client
// JSON-serializes the insert body (JSON.stringify drops undefined properties) -- Postgres
// then applies the column's own NULL default. Stripping them here keeps that behaviour
// explicit (see modules/intake/repository.ts's compact() for the full rationale).
function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

const MATTER_SELECT = "*, advocate:advocates(id, city, user:users(full_name, avatar_url)), practice_area:practice_areas(name), account:accounts(display_name, type)";

export interface MatterRow {
  id: string;
  account_id: string;
  advocate_id: string;
  stage: string;
  opened_at: string;
  [key: string]: unknown;
}

export async function grantedMatterIds(userId: string): Promise<string[]> {
  const { data, error } = await getSupabase().from("matter_access_grants").select("matter_id").eq("subject_id", userId).eq("subject_type", "user").is("revoked_at", null);
  if (error) throw error;
  return (data as Array<{ matter_id: string }>).map((g) => g.matter_id);
}

export async function listMattersByAccountIds(accountIds: string[]): Promise<MatterRow[]> {
  const { data, error } = await getSupabase().from("matters").select(MATTER_SELECT).in("account_id", accountIds);
  if (error) throw error;
  return data as unknown as MatterRow[];
}

export async function listMattersByAdvocateId(advocateId: string): Promise<MatterRow[]> {
  const { data, error } = await getSupabase().from("matters").select(MATTER_SELECT).eq("advocate_id", advocateId);
  if (error) throw error;
  return data as unknown as MatterRow[];
}

export async function listMattersByIds(ids: string[]): Promise<MatterRow[]> {
  const { data, error } = await getSupabase().from("matters").select(MATTER_SELECT).in("id", ids);
  if (error) throw error;
  return data as unknown as MatterRow[];
}

export interface OpenMatterRef {
  id: string;
  title: string;
  reference: string;
}

export async function listOpenMattersByColumn(column: "account_id" | "advocate_id", values: string[]): Promise<OpenMatterRef[]> {
  const { data, error } = await getSupabase().from("matters").select("id, title, reference").in(column, values).not("stage", "in", "(closed,archived)");
  if (error) throw error;
  return data as OpenMatterRef[];
}

export interface TaskRow {
  id: string;
  matter_id: string;
  label: string;
  owner_type: string;
  due_at: string | null;
  is_statutory_deadline: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function listOpenTasksForOwner(matterIds: string[], ownerType: string): Promise<TaskRow[]> {
  const { data, error } = await getSupabase().from("tasks").select("*").in("matter_id", matterIds).eq("owner_type", ownerType).is("completed_at", null);
  if (error) throw error;
  return data as TaskRow[];
}

export async function findMatterRawById(id: string): Promise<{ id: string; [key: string]: unknown } | null> {
  const { data, error } = await getSupabase().from("matters").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as { id: string; [key: string]: unknown } | null;
}

export async function findMatterJoinedById(id: string): Promise<Record<string, unknown>> {
  const { data, error } = await getSupabase().from("matters").select(MATTER_SELECT).eq("id", id).single();
  if (error) throw error;
  return data as unknown as Record<string, unknown>;
}

export async function listTimelineForMatter(matterId: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await getSupabase().from("timeline_events").select("*").eq("matter_id", matterId).order("occurred_at", { ascending: true });
  if (error) throw error;
  return data as Record<string, unknown>[];
}

export async function listTasksForMatter(matterId: string): Promise<TaskRow[]> {
  const { data, error } = await getSupabase().from("tasks").select("*").eq("matter_id", matterId).order("due_at", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data as TaskRow[];
}

export async function listHearingsForMatter(matterId: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await getSupabase().from("hearings").select("*").eq("matter_id", matterId).order("listed_at", { ascending: true });
  if (error) throw error;
  return data as Record<string, unknown>[];
}

export async function listDocumentsForMatter(matterId: string, sharedWithAdvocateId: string | null): Promise<Record<string, unknown>[]> {
  let query = getSupabase().from("documents").select("id, filename, mime, size_bytes, kind, shared_with, created_at, uploaded_by").eq("matter_id", matterId).order("created_at", { ascending: false });
  // The advocate only ever sees documents the client explicitly shared with them.
  if (sharedWithAdvocateId) query = query.contains("shared_with", [sharedWithAdvocateId]);
  const { data, error } = await query;
  if (error) throw error;
  return data as Record<string, unknown>[];
}

export async function listAccessGrantsForMatter(matterId: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await getSupabase().from("matter_access_grants").select("*").eq("matter_id", matterId).is("revoked_at", null);
  if (error) throw error;
  return data as Record<string, unknown>[];
}

export async function listFeeProposalsForMatter(matterId: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await getSupabase().from("fee_proposals").select("*").eq("matter_id", matterId).order("created_at", { ascending: false });
  if (error) throw error;
  return data as Record<string, unknown>[];
}

export async function listInvoicesForMatter(matterId: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await getSupabase().from("invoices").select("*, invoice_line_items(*)").eq("matter_id", matterId).order("created_at", { ascending: false });
  if (error) throw error;
  return data as Record<string, unknown>[];
}

export async function updateMatter(id: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await getSupabase().from("matters").update(patch).eq("id", id).select(MATTER_SELECT).single();
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function insertTimelineEvent(input: { matterId: string; type: string; title: string; actorType: string; actorId: string; body?: string }): Promise<void> {
  const { error } = await getSupabase().from("timeline_events").insert(
    compact({
      matter_id: input.matterId,
      type: input.type,
      title: input.title,
      body: input.body,
      actor_type: input.actorType,
      actor_id: input.actorId,
    }),
  );
  if (error) throw error;
}

export async function insertTask(input: { matterId: string; label: string; ownerType: string; dueAt?: string; isStatutoryDeadline: boolean }): Promise<TaskRow> {
  const { data, error } = await getSupabase()
    .from("tasks")
    .insert(compact({ matter_id: input.matterId, label: input.label, owner_type: input.ownerType, due_at: input.dueAt, is_statutory_deadline: input.isStatutoryDeadline }))
    .select()
    .single();
  if (error) throw error;
  return data as TaskRow;
}

export async function findTaskById(matterId: string, taskId: string): Promise<TaskRow | null> {
  const { data, error } = await getSupabase().from("tasks").select("*").eq("id", taskId).eq("matter_id", matterId).maybeSingle();
  if (error) throw error;
  return data as TaskRow | null;
}

export async function updateTaskCompletion(id: string, completedAt: string | null): Promise<TaskRow> {
  const { data, error } = await getSupabase().from("tasks").update({ completed_at: completedAt }).eq("id", id).select().single();
  if (error) throw error;
  return data as TaskRow;
}

export async function insertHearing(input: { matterId: string; listedAt: string; forum?: string; courtHall?: string; purpose?: string }): Promise<Record<string, unknown>> {
  const { data, error } = await getSupabase()
    .from("hearings")
    .insert(compact({ matter_id: input.matterId, listed_at: input.listedAt, forum: input.forum, court_hall: input.courtHall, purpose: input.purpose }))
    .select()
    .single();
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function findUserByEmail(email: string): Promise<{ id: string; full_name: string } | null> {
  const { data, error } = await getSupabase().from("users").select("id, full_name").eq("email", email.toLowerCase()).maybeSingle();
  if (error) throw error;
  return data as { id: string; full_name: string } | null;
}

export async function insertAccessGrant(input: { matterId: string; subjectId: string; subjectName: string; subjectRole: string; scope: string[] }): Promise<Record<string, unknown>> {
  const { data, error } = await getSupabase()
    .from("matter_access_grants")
    .insert({ matter_id: input.matterId, subject_id: input.subjectId, subject_type: "user", subject_name: input.subjectName, subject_role: input.subjectRole, scope: input.scope })
    .select()
    .single();
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function revokeAccessGrant(id: string, matterId: string): Promise<void> {
  const { error } = await getSupabase().from("matter_access_grants").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("matter_id", matterId);
  if (error) throw error;
}

export async function insertAuditLog(input: { actorId: string; actorRole: string; action: string; subjectType: string; subjectId: string }): Promise<void> {
  const { error } = await getSupabase().from("audit_logs").insert({ actor_id: input.actorId, actor_role: input.actorRole, action: input.action, subject_type: input.subjectType, subject_id: input.subjectId });
  if (error) throw error;
}

export async function insertFeeProposal(input: {
  matterId: string;
  advocateId: string;
  scopeText: string;
  milestones: Array<{ label: string; amount: number; trigger?: string }>;
  statutoryEstimate?: string;
  exclusions: string[];
  validUntil?: string;
}): Promise<Record<string, unknown>> {
  const { data, error } = await getSupabase()
    .from("fee_proposals")
    .insert(
      compact({
        matter_id: input.matterId,
        advocate_id: input.advocateId,
        scope_text: input.scopeText,
        milestones: input.milestones,
        statutory_estimate: input.statutoryEstimate,
        exclusions: input.exclusions,
        valid_until: input.validUntil,
      }),
    )
    .select()
    .single();
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function findFeeProposalById(matterId: string, proposalId: string): Promise<{ id: string; accepted_at: string | null; valid_until: string | null; [key: string]: unknown } | null> {
  const { data, error } = await getSupabase().from("fee_proposals").select("*").eq("id", proposalId).eq("matter_id", matterId).maybeSingle();
  if (error) throw error;
  return data as { id: string; accepted_at: string | null; valid_until: string | null; [key: string]: unknown } | null;
}

export async function acceptFeeProposal(id: string): Promise<Record<string, unknown>> {
  const { data, error } = await getSupabase().from("fee_proposals").update({ accepted_at: new Date().toISOString() }).eq("id", id).select().single();
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function insertInvoice(input: { matterId: string; total: number; dueAt?: string }): Promise<{ id: string; [key: string]: unknown }> {
  const { data, error } = await getSupabase().from("invoices").insert(compact({ matter_id: input.matterId, total: input.total, due_at: input.dueAt, status: "due" })).select().single();
  if (error) throw error;
  return data as { id: string; [key: string]: unknown };
}

export interface InvoiceLineInput {
  invoiceId: string;
  position: number;
  label: string;
  amount: number;
  category: string;
  taxRate: number;
}

export async function insertInvoiceLineItems(lines: InvoiceLineInput[]): Promise<void> {
  const { error } = await getSupabase()
    .from("invoice_line_items")
    .insert(lines.map((l) => ({ invoice_id: l.invoiceId, position: l.position, label: l.label, amount: l.amount, category: l.category, tax_rate: l.taxRate })));
  if (error) throw error;
}

export async function updateInvoiceStatusIfUnpaid(id: string, matterId: string, status: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await getSupabase().from("invoices").update({ status }).eq("id", id).eq("matter_id", matterId).neq("status", "paid").select().maybeSingle();
  if (error) throw error;
  return data as Record<string, unknown> | null;
}

export async function listMattersForAccount(accountId: string): Promise<Array<{ id: string; stage: string }>> {
  const { data, error } = await getSupabase().from("matters").select("id, stage").eq("account_id", accountId);
  if (error) throw error;
  return data as Array<{ id: string; stage: string }>;
}

export async function listInvoiceTotalsForMatters(matterIds: string[]): Promise<Array<{ total: number; status: string; invoice_line_items: Array<{ category: string; amount: number }> }>> {
  if (matterIds.length === 0) return [];
  const { data, error } = await getSupabase().from("invoices").select("total, status, invoice_line_items(category, amount)").in("matter_id", matterIds);
  if (error) throw error;
  return data as unknown as Array<{ total: number; status: string; invoice_line_items: Array<{ category: string; amount: number }> }>;
}
