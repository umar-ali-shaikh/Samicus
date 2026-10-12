/**
 * Drafting domain contracts. Ported from apps/api/src/routes/drafting.js's inline validation
 * (createSchema/patchSchema/returnSchema) and its handlers' response shapes. The document-
 * assembly engine itself (assembleDraft/checkClauseGuards/missingRequiredFields) stays in
 * services/drafting.js, untouched -- same precedent as research/assistant keeping their
 * retrieval pipelines in place.
 */
import { z } from "zod";

export const createDraftSchema = z.object({
  templateId: z.string().uuid(),
  accountId: z.string().uuid().optional(),
});
export type CreateDraftInput = z.infer<typeof createDraftSchema>;

export const patchDraftSchema = z.object({
  fieldValues: z.record(z.string(), z.string().max(2000)).optional(),
  selectedClauseIds: z.array(z.string().uuid()).max(40).optional(),
  customClauses: z.array(z.object({ title: z.string().max(160).optional(), body: z.string().max(4000) })).max(10).optional(),
});
export type PatchDraftInput = z.infer<typeof patchDraftSchema>;

export const requestDraftReviewSchema = z.object({ advocateId: z.string().uuid() });
export type RequestDraftReviewInput = z.infer<typeof requestDraftReviewSchema>;

export const returnDraftReviewSchema = z.object({
  comments: z
    .array(z.object({ severity: z.enum(["info", "warn", "critical"]).default("info"), body: z.string().trim().min(3).max(2000), clauseId: z.string().optional() }))
    .min(1)
    .max(50),
});
export type ReturnDraftReviewInput = z.infer<typeof returnDraftReviewSchema>;

const fieldSchemaEntryDto = z
  .object({ key: z.string(), label: z.string(), placeholder: z.string().nullable().optional(), required: z.boolean(), default: z.string().optional() })
  .strict();

export const docTemplateListItemDto = z
  .object({
    id: z.string(),
    category: z.string().nullable(),
    name: z.string(),
    jurisdiction: z.string().nullable(),
    blurb: z.string().nullable(),
    pages: z.number().nullable(),
    draft_fee: z.number(),
    review_fee: z.number(),
    version: z.number(),
  })
  .strict();
export type DocTemplateListItemDto = z.infer<typeof docTemplateListItemDto>;

export const clauseDto = z
  .object({
    id: z.string(),
    title: z.string(),
    body_template: z.string(),
    rationale_note: z.string().nullable(),
    disposition: z.enum(["recommended", "optional", "review_advised"]),
    favors: z.enum(["drafter", "counterparty", "balanced"]),
    requires_fields: z.array(z.string()),
    conflicts_with: z.array(z.string()),
  })
  .strict();
export type ClauseDto = z.infer<typeof clauseDto>;

export const docTemplateDetailDto = z
  .object({
    template: docTemplateListItemDto.extend({
      base_sections: z.array(z.object({ key: z.string(), heading: z.string(), bodyTemplate: z.string() }).strict()),
      field_schema: z.array(fieldSchemaEntryDto),
      stamp_duty_note: z.string().nullable(),
    }),
    clauses: z.array(clauseDto),
  })
  .strict();
export type DocTemplateDetailDto = z.infer<typeof docTemplateDetailDto>;

export const documentDraftDto = z
  .object({
    id: z.string(),
    account_id: z.string(),
    template_id: z.string(),
    template_version: z.number(),
    field_values: z.record(z.string(), z.string()),
    selected_clause_ids: z.array(z.string()),
    custom_clauses: z.array(z.object({ title: z.string().optional(), body: z.string() }).strict()),
    status: z.enum(["draft", "sent_for_review", "reviewed", "rendered"]),
    review_id: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();
export type DocumentDraftDto = z.infer<typeof documentDraftDto>;

export const draftListItemDto = z
  .object({
    id: z.string(),
    status: z.enum(["draft", "sent_for_review", "reviewed", "rendered"]),
    created_at: z.string(),
    updated_at: z.string(),
    template: z.object({ name: z.string(), category: z.string().nullable() }).strict().nullable(),
  })
  .strict();
export type DraftListItemDto = z.infer<typeof draftListItemDto>;

export const assembledBlockDto = z
  .object({
    n: z.number(),
    heading: z.string(),
    text: z.string(),
    source: z.enum(["base", "library", "custom"]),
    favors: z.enum(["drafter", "counterparty", "balanced"]).optional(),
    disposition: z.enum(["recommended", "optional", "review_advised"]).optional(),
    rationaleNote: z.string().nullable().optional(),
    reviewAdvised: z.boolean(),
  })
  .strict();
export type AssembledBlockDto = z.infer<typeof assembledBlockDto>;

export const draftPreviewResultDto = z
  .object({ blocks: z.array(assembledBlockDto), flaggedFields: z.array(z.string()), missingRequiredFields: z.array(z.string()) })
  .strict();
export type DraftPreviewResultDto = z.infer<typeof draftPreviewResultDto>;

export const draftReviewDto = z
  .object({
    id: z.string(),
    draft_id: z.string(),
    advocate_id: z.string(),
    fee: z.number(),
    comments: z.array(z.object({ severity: z.enum(["info", "warn", "critical"]), body: z.string(), clauseId: z.string().optional() }).strict()),
    status: z.enum(["pending", "in_progress", "returned"]),
    submitted_at: z.string(),
    returned_at: z.string().nullable(),
  })
  .strict();
export type DraftReviewDto = z.infer<typeof draftReviewDto>;

export const advocateDraftReviewListItemDto = z
  .object({
    id: z.string(),
    status: z.enum(["pending", "in_progress", "returned"]),
    fee: z.number(),
    submitted_at: z.string(),
    draft: z.object({ id: z.string(), template: z.object({ name: z.string() }).strict().nullable() }).strict().nullable(),
  })
  .strict();
export type AdvocateDraftReviewListItemDto = z.infer<typeof advocateDraftReviewListItemDto>;

export const advocateDraftReviewDetailDto = z
  .object({ review: draftReviewDto, draft: z.object({ blocks: z.array(assembledBlockDto), flaggedFields: z.array(z.string()) }).strict() })
  .strict();
export type AdvocateDraftReviewDetailDto = z.infer<typeof advocateDraftReviewDetailDto>;
