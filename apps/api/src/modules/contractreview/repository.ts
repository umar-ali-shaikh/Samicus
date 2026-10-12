/**
 * DB access for the contract-review domain. Ported from routes/contractReview.js's inline
 * Supabase calls -- same queries, same behaviour.
 */
import { getSupabase } from "../../config/db.js";

export interface ContractReviewRow {
  id: string;
  account_id: string;
  document_id: string;
  contract_type: string | null;
  counterparty_name: string | null;
  clauses_identified: number | null;
  notes: string | null;
  status: "scanning" | "done" | "failed";
  created_at: string;
}

export async function insertContractReview(input: {
  accountId: string;
  documentId: string;
  contractType: string;
  counterpartyName?: string;
  clausesIdentified: number;
  notes: string;
}): Promise<ContractReviewRow> {
  const { data, error } = await getSupabase()
    .from("contract_reviews")
    .insert({
      account_id: input.accountId,
      document_id: input.documentId,
      contract_type: input.contractType,
      counterparty_name: input.counterpartyName ?? null,
      clauses_identified: input.clausesIdentified,
      status: "done",
      notes: input.notes,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ContractReviewRow;
}

export interface FindingInsert {
  contract_review_id: string;
  position: number;
  clause_type: string;
  clause_ref: string;
  extracted_text: string;
  library_entry_id: string | null;
  favors: "drafter" | "counterparty" | "balanced" | null;
  deviation_note: string | null;
  recommended_ask: string | null;
  why_it_matters: string | null;
  authority_citation: null;
  similarity: number | null;
}

export async function insertFindings(rows: FindingInsert[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await getSupabase().from("contract_review_findings").insert(rows);
  if (error) throw error;
}

export async function getTemplateByCategory(category: string): Promise<{ id: string; category: string } | null> {
  const { data, error } = await getSupabase().from("doc_templates").select("id, category").eq("category", category).is("retired_at", null).maybeSingle();
  if (error) throw error;
  return data as { id: string; category: string } | null;
}

export async function getReviewById(id: string): Promise<ContractReviewRow | null> {
  const { data, error } = await getSupabase().from("contract_reviews").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as ContractReviewRow | null;
}

export interface ContractReviewListRow {
  id: string;
  contract_type: string | null;
  counterparty_name: string | null;
  clauses_identified: number | null;
  status: ContractReviewRow["status"];
  created_at: string;
  document: { filename: string } | null;
}

export async function listReviewsForAccounts(accountIds: string[]): Promise<ContractReviewListRow[]> {
  if (accountIds.length === 0) return [];
  const { data, error } = await getSupabase()
    .from("contract_reviews")
    .select("id, contract_type, counterparty_name, clauses_identified, status, created_at, document:documents(filename)")
    .in("account_id", accountIds)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return data as unknown as ContractReviewListRow[];
}

export interface FindingRow {
  id: string;
  contract_review_id: string;
  position: number;
  clause_type: string | null;
  clause_ref: string | null;
  extracted_text: string | null;
  library_entry_id: string | null;
  favors: "drafter" | "counterparty" | "balanced" | null;
  deviation_note: string | null;
  recommended_ask: string | null;
  why_it_matters: string | null;
  authority_citation: string | null;
  similarity: number | null;
  library_entry: { title: string; rationale_note: string | null } | null;
}

export interface FullReviewRow extends ContractReviewListRow {
  notes: string | null;
  findings: FindingRow[];
}

export async function getFullReviewById(id: string): Promise<FullReviewRow> {
  const { data, error } = await getSupabase()
    .from("contract_reviews")
    .select("*, document:documents(filename), findings:contract_review_findings(*, library_entry:clause_library(title, rationale_note))")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as unknown as FullReviewRow;
}
