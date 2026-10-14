/**
 * Contract-review domain contracts. Ported from apps/api/src/routes/contractReview.js's inline
 * createSchema and its handlers' response shapes. The retrieval/judgement pipeline itself
 * (detectRedFlags/judgeClauses in services/contractReview.js, matchBaselineClauses in
 * services/rag/clauses.js) stays untouched -- same precedent as research/assistant.
 */
import { z } from "zod";

export const createContractReviewSchema = z.object({
  documentId: z.string().uuid(),
  contractType: z.string().trim().min(2).max(40),
  counterpartyName: z.string().trim().max(160).optional(),
});
export type CreateContractReviewInput = z.infer<typeof createContractReviewSchema>;

export const contractReviewFindingDto = z
  .object({
    id: z.string(),
    contract_review_id: z.string(),
    position: z.number(),
    clause_type: z.string().nullable(),
    clause_ref: z.string().nullable(),
    extracted_text: z.string().nullable(),
    library_entry_id: z.string().nullable(),
    favors: z.enum(["drafter", "counterparty", "balanced"]).nullable(),
    deviation_note: z.string().nullable(),
    recommended_ask: z.string().nullable(),
    why_it_matters: z.string().nullable(),
    authority_citation: z.string().nullable(),
    similarity: z.number().nullable(),
    library_entry: z.object({ title: z.string(), rationale_note: z.string().nullable() }).strict().nullable().optional(),
  })
  .strict();
export type ContractReviewFindingDto = z.infer<typeof contractReviewFindingDto>;

export const contractReviewListItemDto = z
  .object({
    id: z.string(),
    contract_type: z.string().nullable(),
    counterparty_name: z.string().nullable(),
    clauses_identified: z.number().nullable(),
    status: z.enum(["scanning", "done", "failed"]),
    created_at: z.string(),
    document: z.object({ filename: z.string() }).strict().nullable(),
  })
  .strict();
export type ContractReviewListItemDto = z.infer<typeof contractReviewListItemDto>;

export const contractReviewDetailDto = contractReviewListItemDto
  .extend({ notes: z.string().nullable(), findings: z.array(contractReviewFindingDto) })
  .strict();
export type ContractReviewDetailDto = z.infer<typeof contractReviewDetailDto>;
