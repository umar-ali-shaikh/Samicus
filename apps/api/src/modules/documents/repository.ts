/**
 * DB access for the documents domain. Ported from routes/documents.js's inline Supabase
 * calls -- same queries, same behaviour. No generated DB types yet; rows are cast to local
 * interfaces matching what each query actually selects.
 */
import { getSupabase } from "../../config/db.js";

const LIST_COLUMNS = "id, account_id, matter_id, filename, mime, size_bytes, kind, shared_with, virus_scan_status, created_at, uploaded_by";

export interface DocumentListRow {
  id: string;
  account_id: string;
  matter_id: string | null;
  filename: string;
  mime: string | null;
  size_bytes: number | null;
  kind: string;
  shared_with: string[];
  virus_scan_status: string;
  created_at: string;
  uploaded_by: string;
}

export interface FullDocumentRow extends DocumentListRow {
  storage_key: string;
}

export interface NewDocumentInput {
  accountId: string;
  matterId: string | null;
  filename: string;
  mime: string;
  sizeBytes: number;
  kind: string;
  storageKey: string;
  uploadedBy: string;
  virusScanStatus: "clean" | "pending";
}

export async function insertDocument(input: NewDocumentInput): Promise<DocumentListRow> {
  const { data, error } = await getSupabase()
    .from("documents")
    .insert({
      account_id: input.accountId,
      matter_id: input.matterId,
      filename: input.filename,
      mime: input.mime,
      size_bytes: input.sizeBytes,
      kind: input.kind,
      storage_key: input.storageKey,
      uploaded_by: input.uploadedBy,
      virus_scan_status: input.virusScanStatus, // see platform/clamav.ts
    })
    .select(LIST_COLUMNS)
    .single();
  if (error) throw error;
  return data as DocumentListRow;
}

export async function findMatterOnAccount(matterId: string, accountId: string): Promise<{ id: string } | null> {
  const { data, error } = await getSupabase().from("matters").select("id").eq("id", matterId).eq("account_id", accountId).maybeSingle();
  if (error) throw error;
  return data as { id: string } | null;
}

export interface DocumentListFilters {
  accountId?: string;
  matterId?: string;
}

export async function listDocumentsForAccounts(accountIds: string[], filters: DocumentListFilters): Promise<DocumentListRow[]> {
  let query = getSupabase().from("documents").select(LIST_COLUMNS).in("account_id", accountIds);
  if (filters.accountId) query = query.eq("account_id", filters.accountId);
  if (filters.matterId) query = query.eq("matter_id", filters.matterId);
  const { data, error } = await query;
  if (error) throw error;
  return data as DocumentListRow[];
}

export async function listDocumentsSharedWithAdvocate(advocateId: string, filters: Pick<DocumentListFilters, "matterId">): Promise<DocumentListRow[]> {
  let query = getSupabase().from("documents").select(LIST_COLUMNS).contains("shared_with", [advocateId]);
  if (filters.matterId) query = query.eq("matter_id", filters.matterId);
  const { data, error } = await query;
  if (error) throw error;
  return data as DocumentListRow[];
}

export async function findDocumentById(id: string): Promise<FullDocumentRow | null> {
  const { data, error } = await getSupabase().from("documents").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as FullDocumentRow | null;
}

export async function findActiveAccessGrantScope(matterId: string, userId: string): Promise<{ scope: string[] } | null> {
  const { data, error } = await getSupabase().from("matter_access_grants").select("scope").eq("matter_id", matterId).eq("subject_id", userId).is("revoked_at", null).maybeSingle();
  if (error) throw error;
  return data as { scope: string[] } | null;
}

export async function listAdvocateIdsWorkedWithByAccount(accountId: string): Promise<string[]> {
  const supabase = getSupabase();
  const [matters, consultations] = await Promise.all([
    supabase.from("matters").select("advocate_id").eq("account_id", accountId),
    supabase.from("consultations").select("advocate_id").eq("account_id", accountId),
  ]);
  if (matters.error) throw matters.error;
  if (consultations.error) throw consultations.error;
  return [...(matters.data as Array<{ advocate_id: string }>), ...(consultations.data as Array<{ advocate_id: string }>)].map((r) => r.advocate_id);
}

export async function updateSharedWith(id: string, sharedWith: string[]): Promise<DocumentListRow> {
  const { data, error } = await getSupabase().from("documents").update({ shared_with: sharedWith }).eq("id", id).select(LIST_COLUMNS).single();
  if (error) throw error;
  return data as DocumentListRow;
}

export async function deleteDocumentRow(id: string): Promise<void> {
  const { error } = await getSupabase().from("documents").delete().eq("id", id);
  if (error) throw error;
}

export async function insertAuditLog(input: { actorId: string; actorRole: string; action: string; subjectId: string }): Promise<void> {
  const { error } = await getSupabase().from("audit_logs").insert({ actor_id: input.actorId, actor_role: input.actorRole, action: input.action, subject_type: "Document", subject_id: input.subjectId });
  if (error) throw error;
}
