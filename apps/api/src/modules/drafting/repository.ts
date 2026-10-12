/**
 * DB access for the drafting domain. Ported from routes/drafting.js's inline Supabase calls --
 * same queries, same behaviour. toTemplateShape/toClauseShape reshape snake_case columns into
 * the camelCase {baseSections, fieldSchema, bodyTemplate, ...} shape services/drafting.js's
 * pure assembleDraft/checkClauseGuards expect (same pattern as services/matching.js's callers).
 */
import { getSupabase } from "../../config/db.js";

export interface TemplateRow {
  id: string;
  category: string | null;
  name: string;
  jurisdiction: string | null;
  blurb: string | null;
  pages: number | null;
  draft_fee: number;
  review_fee: number;
  version: number;
  base_sections?: Array<{ key: string; heading: string; bodyTemplate: string }>;
  field_schema?: Array<{ key: string; label: string; placeholder: string | null; required: boolean; default?: string }>;
  stamp_duty_note?: string | null;
  retired_at: string | null;
}

export interface ClauseRow {
  id: string;
  template_id: string;
  title: string;
  body_template: string;
  rationale_note: string | null;
  disposition: "recommended" | "optional" | "review_advised";
  favors: "drafter" | "counterparty" | "balanced";
  requires_fields: string[];
  clause_conflicts?: Array<{ conflicts_with_id: string }>;
}

export function toTemplateShape(row: TemplateRow) {
  return { ...row, baseSections: row.base_sections ?? [], fieldSchema: row.field_schema ?? [] };
}

export function toClauseShape(row: ClauseRow) {
  return {
    _id: row.id,
    id: row.id,
    title: row.title,
    bodyTemplate: row.body_template,
    rationaleNote: row.rationale_note,
    requiresFields: row.requires_fields,
    disposition: row.disposition,
    favors: row.favors,
    conflictsWith: (row.clause_conflicts || []).map((c) => c.conflicts_with_id),
  };
}

export function toClauseDto(row: ClauseRow) {
  return {
    id: row.id,
    title: row.title,
    body_template: row.body_template,
    rationale_note: row.rationale_note,
    disposition: row.disposition,
    favors: row.favors,
    requires_fields: row.requires_fields,
    conflicts_with: (row.clause_conflicts || []).map((c) => c.conflicts_with_id),
  };
}

const CLAUSE_SELECT = "*, clause_conflicts!clause_id(conflicts_with_id)";

export async function listTemplates(): Promise<TemplateRow[]> {
  const { data, error } = await getSupabase()
    .from("doc_templates")
    .select("id, category, name, jurisdiction, blurb, pages, draft_fee, review_fee, version")
    .is("retired_at", null)
    .order("name");
  if (error) throw error;
  return data as TemplateRow[];
}

export async function getTemplateById(id: string): Promise<TemplateRow | null> {
  const { data, error } = await getSupabase().from("doc_templates").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as TemplateRow | null;
}

export async function getActiveTemplateById(id: string): Promise<{ id: string; version: number } | null> {
  const { data, error } = await getSupabase().from("doc_templates").select("id, version").eq("id", id).is("retired_at", null).maybeSingle();
  if (error) throw error;
  return data as { id: string; version: number } | null;
}

export async function listClausesForTemplate(templateId: string): Promise<ClauseRow[]> {
  const { data, error } = await getSupabase().from("clause_library").select(CLAUSE_SELECT).eq("template_id", templateId);
  if (error) throw error;
  return data as unknown as ClauseRow[];
}

export async function listClausesByIds(ids: string[]): Promise<ClauseRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await getSupabase().from("clause_library").select(CLAUSE_SELECT).in("id", ids);
  if (error) throw error;
  return data as unknown as ClauseRow[];
}

export interface DraftRow {
  id: string;
  account_id: string;
  template_id: string;
  template_version: number;
  field_values: Record<string, string>;
  selected_clause_ids: string[];
  custom_clauses: Array<{ title?: string; body: string }>;
  status: "draft" | "sent_for_review" | "reviewed" | "rendered";
  review_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function insertDraft(input: { accountId: string; templateId: string; templateVersion: number; createdBy: string }): Promise<DraftRow> {
  const { data, error } = await getSupabase()
    .from("document_drafts")
    .insert({ account_id: input.accountId, template_id: input.templateId, template_version: input.templateVersion, created_by: input.createdBy })
    .select()
    .single();
  if (error) throw error;
  return data as DraftRow;
}

export async function getDraftById(id: string): Promise<DraftRow | null> {
  const { data, error } = await getSupabase().from("document_drafts").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as DraftRow | null;
}

export interface DraftListRow {
  id: string;
  status: DraftRow["status"];
  created_at: string;
  updated_at: string;
  template: { name: string; category: string | null } | null;
}

export async function listDraftsForAccounts(accountIds: string[]): Promise<DraftListRow[]> {
  if (accountIds.length === 0) return [];
  const { data, error } = await getSupabase()
    .from("document_drafts")
    .select("id, status, created_at, updated_at, template:doc_templates(name, category)")
    .in("account_id", accountIds)
    .order("updated_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return data as unknown as DraftListRow[];
}

export async function patchDraft(id: string, patch: Record<string, unknown>): Promise<DraftRow> {
  const { data, error } = await getSupabase().from("document_drafts").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data as DraftRow;
}

export interface DraftWithTemplate extends DraftRow {
  template: TemplateRow;
}

export async function getDraftWithTemplate(id: string): Promise<DraftWithTemplate> {
  const { data, error } = await getSupabase().from("document_drafts").select("*, template:doc_templates(*)").eq("id", id).single();
  if (error) throw error;
  return data as unknown as DraftWithTemplate;
}

export async function markDraftRenderedIfDraft(id: string, currentStatus: DraftRow["status"]): Promise<void> {
  const { error } = await getSupabase()
    .from("document_drafts")
    .update({ status: currentStatus === "draft" ? "rendered" : currentStatus })
    .eq("id", id);
  if (error) throw error;
}

export interface VerifiedAdvocate {
  id: string;
}

export async function getVerifiedAdvocate(advocateId: string): Promise<VerifiedAdvocate | null> {
  const { data, error } = await getSupabase().from("advocates").select("id").eq("id", advocateId).eq("verification_status", "verified").maybeSingle();
  if (error) throw error;
  return data as VerifiedAdvocate | null;
}

export interface ReviewRow {
  id: string;
  draft_id: string;
  advocate_id: string;
  fee: number;
  comments: Array<{ severity: "info" | "warn" | "critical"; body: string; clauseId?: string }>;
  status: "pending" | "in_progress" | "returned";
  submitted_at: string;
  returned_at: string | null;
}

export async function insertDraftReview(input: { draftId: string; advocateId: string; fee: number }): Promise<ReviewRow> {
  const { data, error } = await getSupabase()
    .from("draft_reviews")
    .insert({ draft_id: input.draftId, advocate_id: input.advocateId, fee: input.fee })
    .select()
    .single();
  if (error) throw error;
  return data as ReviewRow;
}

export async function setDraftSentForReview(draftId: string, reviewId: string): Promise<void> {
  const { error } = await getSupabase().from("document_drafts").update({ status: "sent_for_review", review_id: reviewId }).eq("id", draftId);
  if (error) throw error;
}

export async function getReviewForDraft(draftId: string, reviewId: string): Promise<ReviewRow | null> {
  const { data, error } = await getSupabase().from("draft_reviews").select("*").eq("id", reviewId).eq("draft_id", draftId).maybeSingle();
  if (error) throw error;
  return data as ReviewRow | null;
}

export interface AdvocateReviewListRow {
  id: string;
  status: ReviewRow["status"];
  fee: number;
  submitted_at: string;
  draft: { id: string; template: { name: string } | null } | null;
}

export async function listReviewsForAdvocate(advocateId: string): Promise<AdvocateReviewListRow[]> {
  // No "!draft_id" FK hint: draft_reviews has exactly one FK to document_drafts, so it's
  // unambiguous without the hint (unlike clause_library's clause_conflicts, which has two FKs
  // to itself and genuinely needs one) -- written this way so the embed is exercisable through
  // the fakeSupabase test double's alias-resolution regex, which doesn't support the "!col" hint
  // syntax at all.
  const { data, error } = await getSupabase()
    .from("draft_reviews")
    .select("id, status, fee, submitted_at, draft:document_drafts(id, template:doc_templates(name))")
    .eq("advocate_id", advocateId)
    .order("submitted_at", { ascending: false });
  if (error) throw error;
  return data as unknown as AdvocateReviewListRow[];
}

export async function getReviewForAdvocate(id: string, advocateId: string): Promise<ReviewRow | null> {
  const { data, error } = await getSupabase().from("draft_reviews").select("*").eq("id", id).eq("advocate_id", advocateId).maybeSingle();
  if (error) throw error;
  return data as ReviewRow | null;
}

export async function returnReview(id: string, advocateId: string, comments: ReviewRow["comments"]): Promise<ReviewRow | null> {
  const { data, error } = await getSupabase()
    .from("draft_reviews")
    .update({ comments, status: "returned", returned_at: new Date().toISOString() })
    .eq("id", id)
    .eq("advocate_id", advocateId)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as ReviewRow | null;
}

export async function markDraftReviewed(draftId: string): Promise<void> {
  const { error } = await getSupabase().from("document_drafts").update({ status: "reviewed" }).eq("id", draftId);
  if (error) throw error;
}
