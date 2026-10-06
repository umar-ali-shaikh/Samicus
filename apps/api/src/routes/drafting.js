import { Router } from "express";
import { z } from "zod";
import { getSupabase } from "../config/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { assembleDraft, checkClauseGuards, missingRequiredFields } from "../services/drafting.js";
import { renderDocx, renderPdf } from "../services/draftRender.js";
import { HttpError, advocateForUser, assertAccountMember, defaultAccountId, memberAccountIds } from "../services/access.js";

const router = Router();

// services/drafting.js is pure/DB-agnostic — these adapters just reshape Postgres rows
// (snake_case columns, conflictsWith now a junction table) back into the camelCase shape
// it expects, the same pattern used for services/matching.js.
function toTemplateShape(row) {
  return { ...row, baseSections: row.base_sections, fieldSchema: row.field_schema };
}

function toClauseShape(row) {
  return {
    ...row,
    _id: row.id,
    bodyTemplate: row.body_template,
    rationaleNote: row.rationale_note,
    requiresFields: row.requires_fields,
    conflictsWith: (row.clause_conflicts || []).map((c) => c.conflicts_with_id),
  };
}

async function loadOwnDraft(user, id, select = "*") {
  const { data: draft, error } = await getSupabase().from("document_drafts").select(select).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!draft) throw new HttpError(404, "Not found");
  await assertAccountMember(user.id, draft.account_id).catch(() => { throw new HttpError(404, "Not found"); });
  return draft;
}

router.get("/doc-templates", requireAuth, async (req, res) => {
  const { data, error } = await getSupabase().from("doc_templates").select("id, category, name, jurisdiction, blurb, pages, draft_fee, review_fee, version").is("retired_at", null).order("name");
  if (error) throw error;
  res.json(data);
});

router.get("/doc-templates/:id", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const { data: template, error } = await supabase.from("doc_templates").select("*").eq("id", req.params.id).maybeSingle();
  if (error) throw error;
  if (!template) throw new HttpError(404, "Not found");
  const { data: clauses, error: clausesError } = await supabase.from("clause_library").select("*, clause_conflicts!clause_id(conflicts_with_id)").eq("template_id", template.id);
  if (clausesError) throw clausesError;
  res.json({ template, clauses });
});

router.post("/drafts", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const { templateId } = req.body || {};
  const accountId = req.body?.accountId || (await defaultAccountId(req.user.id));
  await assertAccountMember(req.user.id, accountId);
  const { data: template, error: templateError } = await supabase.from("doc_templates").select("id, version").eq("id", templateId).is("retired_at", null).maybeSingle();
  if (templateError) throw templateError;
  if (!template) throw new HttpError(404, "Template not found");

  const { data: draft, error } = await supabase
    .from("document_drafts")
    .insert({ account_id: accountId, template_id: template.id, template_version: template.version, created_by: req.user.id })
    .select()
    .single();
  if (error) throw error;
  res.status(201).json(draft);
});

router.get("/drafts", requireAuth, async (req, res) => {
  const accountIds = await memberAccountIds(req.user.id);
  if (accountIds.length === 0) return res.json([]);
  const { data, error } = await getSupabase()
    .from("document_drafts")
    .select("id, status, created_at, updated_at, template:doc_templates(name, category)")
    .in("account_id", accountIds)
    .order("updated_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  res.json(data);
});

router.get("/drafts/:id", requireAuth, async (req, res) => {
  res.json(await loadOwnDraft(req.user, req.params.id));
});

const patchSchema = z.object({
  fieldValues: z.record(z.string(), z.string().max(2000)).optional(),
  selectedClauseIds: z.array(z.string().uuid()).max(40).optional(),
  customClauses: z.array(z.object({ title: z.string().max(160).optional(), body: z.string().max(4000) })).max(10).optional(),
});

router.patch("/drafts/:id", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const draft = await loadOwnDraft(req.user, req.params.id);
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const { fieldValues, selectedClauseIds, customClauses } = parsed.data;

  const patch = {};
  if (selectedClauseIds) {
    const { data: clauseRows, error: clausesError } = await supabase
      .from("clause_library")
      .select("*, clause_conflicts!clause_id(conflicts_with_id)")
      .eq("template_id", draft.template_id)
      .in("id", selectedClauseIds);
    if (clausesError) throw clausesError;
    if (clauseRows.length !== selectedClauseIds.length) throw new HttpError(400, "Unknown clause for this template.");
    const errors = checkClauseGuards(selectedClauseIds, clauseRows.map(toClauseShape), { ...draft.field_values, ...fieldValues });
    if (errors.length) return res.status(422).json({ error: errors.join(" "), errors });
    patch.selected_clause_ids = selectedClauseIds;
  }
  if (fieldValues) patch.field_values = { ...draft.field_values, ...fieldValues };
  if (customClauses) patch.custom_clauses = customClauses;
  if (Object.keys(patch).length === 0) return res.json(draft);

  const { data: updated, error: updateError } = await supabase.from("document_drafts").update(patch).eq("id", draft.id).select().single();
  if (updateError) throw updateError;
  res.json(updated);
});

async function assemble(draftId) {
  const supabase = getSupabase();
  const { data: draft, error } = await supabase.from("document_drafts").select("*, template:doc_templates(*)").eq("id", draftId).single();
  if (error) throw error;

  let selectedClauses = [];
  if (draft.selected_clause_ids?.length) {
    const { data: clauseRows, error: clausesError } = await supabase
      .from("clause_library")
      .select("*, clause_conflicts!clause_id(conflicts_with_id)")
      .in("id", draft.selected_clause_ids);
    if (clausesError) throw clausesError;
    selectedClauses = clauseRows.map(toClauseShape);
  }
  const assembled = assembleDraft({
    template: toTemplateShape(draft.template),
    fieldValues: draft.field_values,
    selectedClauses,
    customClauses: draft.custom_clauses,
  });
  return { draft, assembled };
}

// Server-authoritative rendering: same inputs always assemble identically (pinned template version).
router.post("/drafts/:id/preview", requireAuth, async (req, res) => {
  await loadOwnDraft(req.user, req.params.id, "id, account_id");
  const { draft, assembled } = await assemble(req.params.id);
  const missing = missingRequiredFields(draft.template.field_schema, draft.field_values);
  res.json({ ...assembled, missingRequiredFields: missing });
});

router.get("/drafts/:id/download", requireAuth, async (req, res) => {
  const format = req.query.format === "pdf" ? "pdf" : "docx";
  await loadOwnDraft(req.user, req.params.id, "id, account_id");
  const { draft, assembled } = await assemble(req.params.id);
  const missing = missingRequiredFields(draft.template.field_schema, draft.field_values);
  if (missing.length > 0) throw new HttpError(422, `Fill in the required fields before downloading: ${missing.join(", ")}.`);
  const title = draft.template.name;
  const buffer = format === "pdf" ? await renderPdf({ title, blocks: assembled.blocks }) : await renderDocx({ title, blocks: assembled.blocks });

  await getSupabase().from("document_drafts").update({ status: draft.status === "draft" ? "rendered" : draft.status }).eq("id", draft.id);
  const filename = `${title.replace(/[^\w]+/g, "-")}-draft.${format}`;
  res.setHeader("Content-Type", format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
});

// Advocate review of a draft (fee comes from the template; collected through /payments).
router.post("/drafts/:id/reviews", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const draft = await loadOwnDraft(req.user, req.params.id, "*, template:doc_templates(review_fee)");
  const { advocateId } = req.body || {};
  const { data: advocate, error: advocateError } = await supabase.from("advocates").select("id").eq("id", advocateId).eq("verification_status", "verified").maybeSingle();
  if (advocateError) throw advocateError;
  if (!advocate) throw new HttpError(404, "Advocate not found");

  const { data: review, error } = await supabase
    .from("draft_reviews")
    .insert({ draft_id: draft.id, advocate_id: advocate.id, fee: draft.template.review_fee })
    .select()
    .single();
  if (error) throw error;
  const { error: draftError } = await supabase.from("document_drafts").update({ status: "sent_for_review", review_id: review.id }).eq("id", draft.id);
  if (draftError) throw draftError;
  res.status(201).json(review);
});

router.get("/drafts/:id/reviews/:rid", requireAuth, async (req, res) => {
  await loadOwnDraft(req.user, req.params.id, "id, account_id");
  const { data: review, error } = await getSupabase().from("draft_reviews").select("*").eq("id", req.params.rid).eq("draft_id", req.params.id).maybeSingle();
  if (error) throw error;
  if (!review) throw new HttpError(404, "Not found");
  res.json(review);
});

// --- Advocate side ---

router.get("/advocate/draft-reviews", requireAuth, requireRole("advocate"), async (req, res) => {
  const advocate = await advocateForUser(req.user.id);
  if (!advocate) return res.json([]);
  const { data, error } = await getSupabase()
    .from("draft_reviews")
    .select("id, status, fee, submitted_at, draft:document_drafts!draft_id(id, template:doc_templates(name))")
    .eq("advocate_id", advocate.id)
    .order("submitted_at", { ascending: false });
  if (error) throw error;
  res.json(data);
});

router.get("/advocate/draft-reviews/:id", requireAuth, requireRole("advocate"), async (req, res) => {
  const advocate = await advocateForUser(req.user.id);
  const { data: review, error } = await getSupabase().from("draft_reviews").select("*").eq("id", req.params.id).eq("advocate_id", advocate?.id).maybeSingle();
  if (error) throw error;
  if (!review) throw new HttpError(404, "Not found");
  const { assembled } = await assemble(review.draft_id);
  res.json({ review, draft: assembled });
});

const returnSchema = z.object({
  comments: z.array(z.object({ severity: z.enum(["info", "warn", "critical"]).default("info"), body: z.string().trim().min(3).max(2000), clauseId: z.string().optional() })).min(1).max(50),
});

router.post("/advocate/draft-reviews/:id/return", requireAuth, requireRole("advocate"), async (req, res) => {
  const advocate = await advocateForUser(req.user.id);
  const parsed = returnSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Add at least one comment.");
  const { data, error } = await getSupabase()
    .from("draft_reviews")
    .update({ comments: parsed.data.comments, status: "returned", returned_at: new Date().toISOString() })
    .eq("id", req.params.id)
    .eq("advocate_id", advocate?.id)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "Not found");
  const { error: draftError } = await getSupabase().from("document_drafts").update({ status: "reviewed" }).eq("id", data.draft_id);
  if (draftError) throw draftError;
  res.json(data);
});

export default router;
