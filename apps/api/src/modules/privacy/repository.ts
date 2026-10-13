/**
 * DB access for the privacy domain. Ported from routes/privacy.js's inline Supabase calls --
 * same queries, same behaviour.
 */
import { getSupabase } from "../../config/db.js";

type Row = Record<string, unknown>;

async function inAccounts(table: string, columns: string, accountIds: string[]): Promise<Row[]> {
  if (accountIds.length === 0) return [];
  const { data, error } = await getSupabase().from(table).select(columns).in("account_id", accountIds);
  if (error) throw error;
  return data as Row[];
}

export interface ExportData {
  memberships: Row[];
  requests: Row[];
  consultations: Row[];
  matters: Row[];
  documents: Row[];
  publicQuestions: Row[];
  complaints: Row[];
  payments: Row[];
  aiAssistantHistory: Row[];
}

export async function loadExportData(userId: string, accountIds: string[]): Promise<ExportData> {
  const supabase = getSupabase();
  const [memberships, requests, consultations, matters, documents, publicQuestions, complaints, payments, aiAssistantHistory] = await Promise.all([
    supabase.from("account_members").select("*").eq("user_id", userId),
    inAccounts("intake_requests", "id, description, urgency, city, mode, language, kind, status, created_at", accountIds),
    inAccounts("consultations", "id, mode, scheduled_start, state, fee_total, paid_at, created_at", accountIds),
    inAccounts("matters", "id, reference, title, stage, opened_at", accountIds),
    inAccounts("documents", "id, filename, kind, size_bytes, created_at", accountIds),
    accountIds.length ? supabase.from("public_questions").select("id, body, status, created_at").in("author_account_id", accountIds) : Promise.resolve({ data: [], error: null }),
    supabase.from("complaints").select("ref, title, category, status, created_at").eq("raised_by", userId),
    supabase.from("payment_orders").select("kind, amount_paise, status, paid_at").eq("created_by", userId),
    supabase.from("legal_assistant_sessions").select("session_id, created_at, turns:legal_assistant_turns(question, created_at)").eq("user_id", userId),
  ]);
  if (memberships.error) throw memberships.error;
  const publicQuestionsResult = publicQuestions as { data: Row[]; error: unknown };
  if (publicQuestionsResult.error) throw publicQuestionsResult.error;
  if (complaints.error) throw complaints.error;
  if (payments.error) throw payments.error;
  if (aiAssistantHistory.error) throw aiAssistantHistory.error;

  return {
    memberships: memberships.data as Row[],
    requests,
    consultations,
    matters,
    documents,
    publicQuestions: publicQuestionsResult.data,
    complaints: complaints.data as Row[],
    payments: payments.data as Row[],
    aiAssistantHistory: aiAssistantHistory.data as unknown as Row[],
  };
}

export async function countActiveMattersForAccounts(accountIds: string[]): Promise<number> {
  if (accountIds.length === 0) return 0;
  const { count, error } = await getSupabase().from("matters").select("*", { count: "exact", head: true }).in("account_id", accountIds).not("stage", "in", "(closed,archived)");
  if (error) throw error;
  return count || 0;
}

export async function countActiveMattersForAdvocate(advocateId: string): Promise<number> {
  const { count, error } = await getSupabase().from("matters").select("*", { count: "exact", head: true }).eq("advocate_id", advocateId).not("stage", "in", "(closed,archived)");
  if (error) throw error;
  return count || 0;
}

export async function takeAdvocateOffline(advocateId: string): Promise<void> {
  const { error } = await getSupabase().from("advocates").update({ availability_state: "offline", verification_status: "rejected" }).eq("id", advocateId);
  if (error) throw error;
}

export async function countAccountMembers(accountId: string): Promise<number> {
  const { count, error } = await getSupabase().from("account_members").select("*", { count: "exact", head: true }).eq("account_id", accountId);
  if (error) throw error;
  return count || 0;
}

export async function listDocumentsForAccount(accountId: string): Promise<Array<{ id: string; storage_key: string }>> {
  const { data, error } = await getSupabase().from("documents").select("id, storage_key").eq("account_id", accountId);
  if (error) throw error;
  return data as Array<{ id: string; storage_key: string }>;
}

export async function deleteDocumentsByIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await getSupabase().from("documents").delete().in("id", ids);
  if (error) throw error;
}

export async function anonymiseUser(userId: string): Promise<void> {
  const { error } = await getSupabase().from("users").update({ email: null, phone: null, full_name: "Deleted user", avatar_url: null, city: null, state: null, auth_id: null }).eq("id", userId);
  if (error) throw error;
}

export async function removeAllAccountMemberships(userId: string): Promise<void> {
  const { error } = await getSupabase().from("account_members").delete().eq("user_id", userId);
  if (error) throw error;
}

export async function deleteAuthUser(authId: string): Promise<{ error: { message: string } | null }> {
  return getSupabase().auth.admin.deleteUser(authId);
}
