import { Router } from "express";
import { getSupabase } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { assembleDraft, checkClauseGuards } from "../services/drafting.js";

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

router.get("/doc-templates", async (req, res) => {
  const { data, error } = await getSupabase().from("doc_templates").select("*").is("retired_at", null);
  if (error) throw error;
  res.json(data);
});

router.get("/doc-templates/:id", async (req, res) => {
  const supabase = getSupabase();
  const { data: template, error } = await supabase.from("doc_templates").select("*").eq("id", req.params.id).maybeSingle();
  if (error) throw error;
  if (!template) return res.status(404).json({ error: "Not found" });
  const { data: clauses, error: clausesError } = await supabase.from("clause_library").select("*").eq("template_id", template.id);
  if (clausesError) throw clausesError;
  res.json({ template, clauses });
});

router.post("/drafts", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const { accountId, templateId } = req.body;
  const { data: template, error: templateError } = await supabase.from("doc_templates").select("*").eq("id", templateId).maybeSingle();
  if (templateError) throw templateError;
  if (!template) return res.status(404).json({ error: "Template not found" });

  const { data: draft, error } = await supabase
    .from("document_drafts")
    .insert({ account_id: accountId, template_id: templateId, template_version: template.version, created_by: req.user.id })
    .select()
    .single();
  if (error) throw error;
  res.status(201).json(draft);
});

router.patch("/drafts/:id", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const { fieldValues, selectedClauseIds, customClauses } = req.body;
  const { data: draft, error } = await supabase.from("document_drafts").select("*").eq("id", req.params.id).maybeSingle();
  if (error) throw error;
  if (!draft) return res.status(404).json({ error: "Not found" });

  const patch = {};
  if (selectedClauseIds) {
    const { data: clauseRows, error: clausesError } = await supabase
      .from("clause_library")
      .select("*, clause_conflicts(conflicts_with_id)")
      .in("id", selectedClauseIds);
    if (clausesError) throw clausesError;
    const clauses = clauseRows.map(toClauseShape);
    const errors = checkClauseGuards(selectedClauseIds, clauses, { ...draft.field_values, ...fieldValues });
    if (errors.length) return res.status(422).json({ errors });
    patch.selected_clause_ids = selectedClauseIds;
  }
  if (fieldValues) patch.field_values = { ...draft.field_values, ...fieldValues };
  if (customClauses) patch.custom_clauses = customClauses;

  const { data: updated, error: updateError } = await supabase
    .from("document_drafts")
    .update(patch)
    .eq("id", req.params.id)
    .select()
    .single();
  if (updateError) throw updateError;
  res.json(updated);
});

// Server-authoritative rendering: same inputs always assemble identically (pinned template version).
router.post("/drafts/:id/preview", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const { data: draft, error } = await supabase
    .from("document_drafts")
    .select("*, template:doc_templates(*)")
    .eq("id", req.params.id)
    .maybeSingle();
  if (error) throw error;
  if (!draft) return res.status(404).json({ error: "Not found" });

  let selectedClauses = [];
  if (draft.selected_clause_ids?.length) {
    const { data: clauseRows, error: clausesError } = await supabase
      .from("clause_library")
      .select("*, clause_conflicts(conflicts_with_id)")
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
  res.json(assembled);
});

router.post("/drafts/:id/render", requireAuth, async (req, res) => {
  const format = req.query.format === "pdf" ? "pdf" : "docx";
  const supabase = getSupabase();
  const { data: draft, error } = await supabase.from("document_drafts").select("*").eq("id", req.params.id).maybeSingle();
  if (error) throw error;
  if (!draft) return res.status(404).json({ error: "Not found" });

  const renderKey = `draft-${draft.id}.${format}`;
  const patch = format === "pdf" ? { render_key_pdf: renderKey, status: "rendered" } : { render_key_docx: renderKey, status: "rendered" };
  const { error: updateError } = await supabase.from("document_drafts").update(patch).eq("id", req.params.id);
  if (updateError) throw updateError;
  res.json({ renderKey, format });
});

router.post("/drafts/:id/reviews", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const { advocateId } = req.body;
  const { data: advocate, error: advocateError } = await supabase.from("advocates").select("id").eq("id", advocateId).maybeSingle();
  if (advocateError) throw advocateError;
  if (!advocate) return res.status(404).json({ error: "Advocate not found" });

  const { data: review, error } = await supabase
    .from("draft_reviews")
    .insert({ draft_id: req.params.id, advocate_id: advocateId, fee: 1499 })
    .select()
    .single();
  if (error) throw error;

  const { error: draftError } = await supabase
    .from("document_drafts")
    .update({ status: "sent_for_review", review_id: review.id })
    .eq("id", req.params.id);
  if (draftError) throw draftError;

  res.status(201).json(review);
});

router.get("/drafts/:id/reviews/:rid", requireAuth, async (req, res) => {
  const { data: review, error } = await getSupabase()
    .from("draft_reviews")
    .select("*")
    .eq("id", req.params.rid)
    .eq("draft_id", req.params.id)
    .maybeSingle();
  if (error) throw error;
  if (!review) return res.status(404).json({ error: "Not found" });
  res.json(review);
});

router.post("/drafts/:id/stamp-orders", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const { data: draft, error } = await supabase
    .from("document_drafts")
    .select("*, template:doc_templates(category)")
    .eq("id", req.params.id)
    .maybeSingle();
  if (error) throw error;

  const { data: order, error: orderError } = await supabase
    .from("stamp_orders")
    .insert({
      draft_id: req.params.id,
      state: req.body.state,
      instrument_type: draft.template.category,
      duty_amount: req.body.dutyAmount ?? 500,
      status: "quoted",
    })
    .select()
    .single();
  if (orderError) throw orderError;
  res.status(201).json(order);
});

export default router;
