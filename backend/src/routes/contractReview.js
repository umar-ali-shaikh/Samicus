import { Router } from "express";
import { z } from "zod";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { getSupabase } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError, assertAccountMember, memberAccountIds } from "../services/access.js";
import { extractDocumentText, segmentContract } from "../services/docText.js";
import { judgeClauses } from "../services/contractReview.js";
import { matchBaselineClauses } from "../services/rag/clauses.js";
import { ragEnabled } from "../services/rag/ingest.js";
import { getObject } from "../services/storage.js";
import { loadReadableDocument } from "./documents.js";

const router = Router();

const createSchema = z.object({
  documentId: z.string().uuid(),
  contractType: z.string().trim().min(2).max(40),
  counterpartyName: z.string().trim().max(160).optional(),
});

async function loadOwnReview(user, id, select = "*") {
  const { data: review, error } = await getSupabase().from("contract_reviews").select(select).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!review) throw new HttpError(404, "Not found");
  await assertAccountMember(user.id, review.account_id).catch(() => { throw new HttpError(404, "Not found"); });
  return review;
}

router.post("/contract-reviews", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const { documentId, contractType, counterpartyName } = parsed.data;
  if (!ragEnabled()) {
    throw new HttpError(503, "Contract review needs the knowledge base (QDRANT_URL and GEMINI_API_KEY) to be configured.", { code: "RAG_DISABLED" });
  }

  const { doc, owner } = await loadReadableDocument(req.user, documentId);
  if (!owner) throw new HttpError(403, "You can only review documents from your own account.");
  await assertAccountMember(req.user.id, doc.account_id, ["owner", "admin", "member"]);

  const { data: template, error: templateError } = await supabase.from("doc_templates").select("id, category").eq("category", contractType).is("retired_at", null).maybeSingle();
  if (templateError) throw templateError;
  if (!template) throw new HttpError(400, "We don't have a baseline for that contract type yet.");

  const text = await extractDocumentText(await getObject(doc.storage_key), doc.mime);
  const segments = segmentContract(text);
  if (segments.length === 0) throw new HttpError(422, "No clauses could be identified in this document.");

  const matches = await matchBaselineClauses(segments, template.category);
  const matched = segments.map((seg, i) => ({ index: i, text: seg, match: matches[i] })).filter((m) => m.match);

  const judgements = await judgeClauses(matched.map((m) => ({ index: m.index, text: m.text, baseline: m.match })));
  const unmatched = segments.length - matched.length;

  const { data: review, error } = await supabase
    .from("contract_reviews")
    .insert({
      account_id: doc.account_id,
      document_id: doc.id,
      contract_type: contractType,
      counterparty_name: counterpartyName,
      clauses_identified: segments.length,
      status: "done",
      notes: [
        `${matched.length} of ${segments.length} clauses were compared against the balanced baseline; ${unmatched} had no close baseline clause and were not assessed.`,
        judgements === null ? "Automatic comparison was unavailable, so matched clauses are listed without a verdict." : null,
      ].filter(Boolean).join(" "),
    })
    .select()
    .single();
  if (error) throw error;

  const findings = matched.map((m, position) => {
    const j = judgements?.get(m.index);
    return {
      contract_review_id: review.id,
      position,
      clause_type: m.match.title,
      clause_ref: `Clause ${m.index + 1}`,
      extracted_text: m.text,
      library_entry_id: m.match.clauseId,
      favors: j?.favors ?? null,
      deviation_note: j?.deviation ?? `Matched to the baseline “${m.match.title}”. An automatic comparison was not available for this clause.`,
      recommended_ask: j?.ask ?? null,
      why_it_matters: j?.whyItMatters ?? null,
      authority_citation: null,
      similarity: Math.round(m.match.score * 1000) / 1000,
    };
  });
  if (findings.length > 0) {
    const { error: findingsError } = await supabase.from("contract_review_findings").insert(findings);
    if (findingsError) throw findingsError;
  }
  res.status(201).json({ ...review, findings });
});

router.get("/contract-reviews", requireAuth, async (req, res) => {
  const accountIds = await memberAccountIds(req.user.id);
  if (accountIds.length === 0) return res.json([]);
  const { data, error } = await getSupabase()
    .from("contract_reviews")
    .select("id, contract_type, counterparty_name, clauses_identified, status, created_at, document:documents(filename)")
    .in("account_id", accountIds)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  res.json(data);
});

async function loadFullReview(user, id) {
  await loadOwnReview(user, id, "id, account_id");
  const { data: review, error } = await getSupabase()
    .from("contract_reviews")
    .select("*, document:documents(filename), findings:contract_review_findings(*, library_entry:clause_library(title, rationale_note))")
    .eq("id", id)
    .single();
  if (error) throw error;
  review.findings = (review.findings || []).sort((a, b) => a.position - b.position);
  return review;
}

router.get("/contract-reviews/:id", requireAuth, async (req, res) => {
  res.json(await loadFullReview(req.user, req.params.id));
});

// Negotiation note as a DOCX — comparison against a baseline, not a legal opinion.
router.get("/contract-reviews/:id/export", requireAuth, async (req, res) => {
  const review = await loadFullReview(req.user, req.params.id);
  const label = { drafter: "Favours you", counterparty: "Favours the other side", balanced: "Balanced" };
  const doc = new Document({
    creator: "Vidhira",
    sections: [
      {
        children: [
          new Paragraph({ text: `Contract review — ${review.document?.filename || "document"}`, heading: HeadingLevel.TITLE }),
          new Paragraph({ children: [new TextRun({ text: "Comparison against a balanced baseline. This is not a legal opinion.", italics: true })] }),
          ...(review.notes ? [new Paragraph({ text: review.notes })] : []),
          ...review.findings.flatMap((f) => [
            new Paragraph({ text: `${f.clause_ref} — ${f.clause_type}${f.favors ? ` (${label[f.favors]})` : ""}`, heading: HeadingLevel.HEADING_2, spacing: { before: 240 } }),
            new Paragraph({ children: [new TextRun({ text: "Contract says: ", bold: true }), new TextRun(f.extracted_text || "")] }),
            new Paragraph({ children: [new TextRun({ text: "Assessment: ", bold: true }), new TextRun(f.deviation_note || "")] }),
            ...(f.why_it_matters ? [new Paragraph({ children: [new TextRun({ text: "Why it matters: ", bold: true }), new TextRun(f.why_it_matters)] })] : []),
            ...(f.recommended_ask ? [new Paragraph({ children: [new TextRun({ text: "What to ask for: ", bold: true }), new TextRun(f.recommended_ask)] })] : []),
          ]),
        ],
      },
    ],
  });
  const buffer = await Packer.toBuffer(doc);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  res.setHeader("Content-Disposition", 'attachment; filename="contract-review-note.docx"');
  res.send(buffer);
});

export default router;
