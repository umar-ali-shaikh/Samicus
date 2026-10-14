/**
 * Business logic for the contract-review domain. Ported from routes/contractReview.js -- same
 * behaviour, including the 404-not-403 ownership check and the "every identified clause gets a
 * finding row, even unmatched ones" rule. The retrieval/judgement pipeline itself
 * (detectRedFlags/judgeClauses in services/contractReview.js, matchBaselineClauses in
 * @vidhira/rag/clauses) stays untouched, same precedent as research/assistant.
 */
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { HttpError, assertAccountMember, memberAccountIds } from "../../services/access.js";
import { extractDocumentText, segmentContract } from "../../services/docText.js";
import { detectRedFlags, judgeClauses } from "../../services/contractReview.js";
import { matchBaselineClauses } from "@vidhira/rag/clauses";
import { ragEnabled } from "@vidhira/rag/ingest";
import { getObject } from "../../services/storage.js";
import { loadReadableDocument } from "../documents/service.js";
import type { ContractReviewDetailDto, ContractReviewListItemDto, CreateContractReviewInput } from "@vidhira/contracts";
import * as repo from "./repository.js";
import type { ContractReviewRow } from "./repository.js";

async function loadOwnReview(user: { id: string }, id: string): Promise<ContractReviewRow> {
  const review = await repo.getReviewById(id);
  if (!review) throw new HttpError(404, "Not found");
  try {
    await assertAccountMember(user.id, review.account_id);
  } catch {
    throw new HttpError(404, "Not found");
  }
  return review;
}

export async function createReview(user: { id: string }, input: CreateContractReviewInput): Promise<ContractReviewDetailDto> {
  if (!ragEnabled()) throw new HttpError(503, "Contract review needs the knowledge base (QDRANT_URL and OPENROUTER_API_KEY) to be configured.", { code: "RAG_DISABLED" });

  const { doc, owner } = await loadReadableDocument(user, input.documentId);
  if (!owner) throw new HttpError(403, "You can only review documents from your own account.");
  await assertAccountMember(user.id, doc.account_id, ["owner", "admin", "member"]);

  const template = await repo.getTemplateByCategory(input.contractType);
  if (!template) throw new HttpError(400, "We don't have a baseline for that contract type yet.");

  const text = await extractDocumentText(await getObject(doc.storage_key), doc.mime ?? "");
  const segments: string[] = segmentContract(text);
  if (segments.length === 0) throw new HttpError(422, "No clauses could be identified in this document.");

  const matches = await matchBaselineClauses(segments, template.category);
  const redFlagsBySegment = segments.map((seg) => detectRedFlags(seg));
  const matched = segments.map((seg, i) => ({ index: i, text: seg, match: matches[i] })).filter((m) => m.match);

  const judgements = await judgeClauses(matched.map((m) => ({ index: m.index, text: m.text, baseline: m.match! })));
  const unmatched = segments.length - matched.length;
  const redFlagCount = redFlagsBySegment.filter((f) => f.length > 0).length;

  const notes = [
    `${matched.length} of ${segments.length} clauses were compared against the balanced baseline; ${unmatched} had no close baseline clause and are listed as not assessed.`,
    judgements === null ? "Automatic comparison was unavailable, so matched clauses are listed without a verdict." : null,
    redFlagCount > 0 ? `${redFlagCount} clause${redFlagCount === 1 ? "" : "s"} matched a known one-sided pattern and ${redFlagCount === 1 ? "was" : "were"} flagged automatically.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const review = await repo.insertContractReview({
    accountId: doc.account_id,
    documentId: doc.id,
    contractType: input.contractType,
    counterpartyName: input.counterpartyName,
    clausesIdentified: segments.length,
    notes,
  });

  const findings = segments.map((text, index) => {
    const match = matches[index];
    const flags = redFlagsBySegment[index]!;
    const j = match ? judgements?.get(index) : null;
    const flagged = flags.length > 0;
    return {
      contract_review_id: review.id,
      position: index,
      clause_type: match ? match.title : flags[0]?.title || "Unclassified clause",
      clause_ref: `Clause ${index + 1}`,
      extracted_text: text,
      library_entry_id: match ? match.clauseId : null,
      favors: flagged ? ("counterparty" as const) : ((j?.favors ?? null) as "drafter" | "counterparty" | "balanced" | null),
      deviation_note: flagged
        ? flags.map((f) => f.note).join(" ")
        : match
          ? j?.deviation ?? `Matched to the baseline "${match.title}". An automatic comparison was not available for this clause.`
          : "No close baseline clause was found for this text — not automatically assessed. Consider having an advocate review it directly.",
      recommended_ask: flagged ? "Ask for this clause to be removed or rebalanced before signing." : j?.ask ?? null,
      why_it_matters: flagged ? flags.map((f) => f.whyItMatters).join(" ") : j?.whyItMatters ?? null,
      authority_citation: null,
      similarity: match ? Math.round(match.score * 1000) / 1000 : null,
    };
  });
  await repo.insertFindings(findings);

  return getReviewDetail(user, review.id);
}

export async function listMyReviews(user: { id: string }): Promise<ContractReviewListItemDto[]> {
  const accountIds = await memberAccountIds(user.id);
  const rows = await repo.listReviewsForAccounts(accountIds);
  return rows.map((r) => ({
    id: r.id,
    contract_type: r.contract_type,
    counterparty_name: r.counterparty_name,
    clauses_identified: r.clauses_identified,
    status: r.status,
    created_at: r.created_at,
    document: r.document ? { filename: r.document.filename } : null,
  }));
}

export async function getReviewDetail(user: { id: string }, id: string): Promise<ContractReviewDetailDto> {
  await loadOwnReview(user, id);
  const review = await repo.getFullReviewById(id);
  const findings = (review.findings || []).slice().sort((a, b) => a.position - b.position);
  return {
    id: review.id,
    contract_type: review.contract_type,
    counterparty_name: review.counterparty_name,
    clauses_identified: review.clauses_identified,
    status: review.status,
    created_at: review.created_at,
    document: review.document ? { filename: review.document.filename } : null,
    notes: review.notes,
    findings: findings.map((f) => ({
      id: f.id,
      contract_review_id: f.contract_review_id,
      position: f.position,
      clause_type: f.clause_type,
      clause_ref: f.clause_ref,
      extracted_text: f.extracted_text,
      library_entry_id: f.library_entry_id,
      favors: f.favors,
      deviation_note: f.deviation_note,
      recommended_ask: f.recommended_ask,
      why_it_matters: f.why_it_matters,
      authority_citation: f.authority_citation,
      similarity: f.similarity,
      library_entry: f.library_entry ? { title: f.library_entry.title, rationale_note: f.library_entry.rationale_note } : null,
    })),
  };
}

const FAVOUR_LABEL: Record<string, string> = { drafter: "Favours you", counterparty: "Favours the other side", balanced: "Balanced" };

export async function exportNegotiationNote(user: { id: string }, id: string): Promise<Buffer> {
  const review = await getReviewDetail(user, id);
  const doc = new Document({
    creator: "Vidhira",
    sections: [
      {
        children: [
          new Paragraph({ text: `Contract review — ${review.document?.filename || "document"}`, heading: HeadingLevel.TITLE }),
          new Paragraph({ children: [new TextRun({ text: "Comparison against a balanced baseline. This is not a legal opinion.", italics: true })] }),
          ...(review.notes ? [new Paragraph({ text: review.notes })] : []),
          ...review.findings.flatMap((f) => [
            new Paragraph({ text: `${f.clause_ref} — ${f.clause_type}${f.favors ? ` (${FAVOUR_LABEL[f.favors]})` : ""}`, heading: HeadingLevel.HEADING_2, spacing: { before: 240 } }),
            new Paragraph({ children: [new TextRun({ text: "Contract says: ", bold: true }), new TextRun(f.extracted_text || "")] }),
            new Paragraph({ children: [new TextRun({ text: "Assessment: ", bold: true }), new TextRun(f.deviation_note || "")] }),
            ...(f.why_it_matters ? [new Paragraph({ children: [new TextRun({ text: "Why it matters: ", bold: true }), new TextRun(f.why_it_matters)] })] : []),
            ...(f.recommended_ask ? [new Paragraph({ children: [new TextRun({ text: "What to ask for: ", bold: true }), new TextRun(f.recommended_ask)] })] : []),
          ]),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
