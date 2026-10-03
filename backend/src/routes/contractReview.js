import { Router } from "express";
import { getSupabase } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Same clause library backs both drafting and review (API & Data Model doc §7): a clause's
// stated `favors` + `rationaleNote` become the review's baseline comparison for free.
router.post("/contract-reviews", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const { accountId, documentId, contractType, counterpartyName } = req.body;

  const { data: template, error: templateError } = await supabase
    .from("doc_templates")
    .select("*")
    .eq("category", contractType)
    .maybeSingle();
  if (templateError) throw templateError;

  let libraryEntries = [];
  if (template) {
    const { data, error } = await supabase.from("clause_library").select("*").eq("template_id", template.id);
    if (error) throw error;
    libraryEntries = data;
  }

  const findings = libraryEntries.map((clause, i) => ({
    position: i,
    clause_type: clause.title,
    clause_ref: clause.id,
    extracted_text: clause.body_template.replace(/\{\{(\w+)\}\}/g, "[$1]"),
    library_entry_id: clause.id,
    favors: clause.favors,
    deviation_note:
      clause.disposition === "review_advised"
        ? "Deviates from the balanced baseline for this clause type."
        : "Matches the balanced baseline.",
    recommended_ask:
      clause.disposition === "review_advised"
        ? `Request the ${clause.risk_side === "client" ? "counterparty" : "client"}-favouring language be brought back to the standard position.`
        : "",
    authority_citation: "",
  }));

  const { data: review, error: reviewError } = await supabase
    .from("contract_reviews")
    .insert({
      account_id: accountId,
      document_id: documentId,
      contract_type: contractType,
      counterparty_name: counterpartyName,
      clauses_identified: findings.length,
      status: "done",
    })
    .select()
    .single();
  if (reviewError) throw reviewError;

  if (findings.length > 0) {
    const { error: findingsError } = await supabase
      .from("contract_review_findings")
      .insert(findings.map((f) => ({ ...f, contract_review_id: review.id })));
    if (findingsError) throw findingsError;
  }

  res.status(201).json({ ...review, findings });
});

router.get("/contract-reviews/:id", requireAuth, async (req, res) => {
  const { data: review, error } = await getSupabase()
    .from("contract_reviews")
    .select("*, findings:contract_review_findings(*, library_entry:clause_library(*))")
    .eq("id", req.params.id)
    .maybeSingle();
  if (error) throw error;
  if (!review) return res.status(404).json({ error: "Not found" });
  review.findings = (review.findings || []).sort((a, b) => a.position - b.position);
  res.json(review);
});

router.post("/contract-reviews/:id/redline", requireAuth, async (req, res) => {
  const { data: review, error } = await getSupabase()
    .from("contract_reviews")
    .update({ redline_key: `redline-${req.params.id}.docx` })
    .eq("id", req.params.id)
    .select()
    .single();
  if (error) throw error;
  res.json({ redlineKey: review.redline_key, note: "Comparison against the balanced baseline, not a legal opinion." });
});

export default router;
