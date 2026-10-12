/**
 * Research library domain contracts. Ported from apps/api/src/routes/research.js's inline
 * validation and response shapes. Row shapes mirror apps/api/src/db/schema.sql's
 * research_queries / research_answers / research_chat_turns / corpus_documents / corpus_chunks
 * column lists exactly -- the retrieval/scoring/generation pipeline itself stays in
 * services/research.js (and its own test suite), called from the new module's service layer.
 */
import { z } from "zod";

export const RESEARCH_SOURCES = ["bare_act", "supreme_court", "high_court", "rules", "ccpa", "asci", "tribunal", "other", "web"] as const;
export const PARAGRAPH_CLASSES = [
  "provision",
  "facts",
  "issues",
  "petitioner_arguments",
  "respondent_arguments",
  "reasoning",
  "holding",
  "directions",
  "quoted_precedent",
] as const;
export const NOT_FOUND_REASONS = ["corpus_gap", "ingest_failed", "below_threshold"] as const;

export const retrieveResearchSchema = z.object({
  text: z.string().trim().min(5, "Enter a question of 5–1,000 characters.").max(1000, "Enter a question of 5–1,000 characters."),
  sourcesEnabled: z.array(z.string()).optional(),
  accountId: z.string().uuid().optional(),
});
export type RetrieveResearchInput = z.infer<typeof retrieveResearchSchema>;

export const answerResearchSchema = z.object({ retrievalId: z.string().uuid() });
export type AnswerResearchInput = z.infer<typeof answerResearchSchema>;

export const patchResearchQuerySchema = z
  .object({ pinned: z.boolean().optional(), tags: z.array(z.string()).optional() })
  .refine((v) => v.pinned !== undefined || v.tags !== undefined, { message: "Nothing to update — pass pinned and/or tags." });
export type PatchResearchQueryInput = z.infer<typeof patchResearchQuerySchema>;

export const askResearchFollowUpSchema = z.object({
  question: z.string().trim().min(3, "Enter a question of 3–500 characters.").max(500, "Enter a question of 3–500 characters."),
});
export type AskResearchFollowUpInput = z.infer<typeof askResearchFollowUpSchema>;

export const researchQueryRowDto = z
  .object({
    id: z.string(),
    account_id: z.string().nullable(),
    text: z.string(),
    title: z.string().nullable(),
    normalized_text: z.string().nullable(),
    rerun_count: z.number(),
    locale: z.string(),
    sources_enabled: z.array(z.string()),
    threshold: z.number(),
    outcome: z.enum(["answered", "partial", "not_found"]),
    not_found_reason: z.enum(NOT_FOUND_REASONS).nullable(),
    top_score: z.number().nullable(),
    live_fetch_ingest_failed: z.boolean(),
    model_version: z.string(),
    prompt_version: z.string(),
    latency_ms: z.number().nullable(),
    pinned_at: z.string().nullable(),
    tags: z.array(z.string()),
    superseded_by: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();
export type ResearchQueryRowDto = z.infer<typeof researchQueryRowDto>;

export const researchQueryListItemDto = researchQueryRowDto
  .pick({
    id: true,
    title: true,
    text: true,
    outcome: true,
    not_found_reason: true,
    top_score: true,
    pinned_at: true,
    tags: true,
    locale: true,
    created_at: true,
    updated_at: true,
    rerun_count: true,
  })
  .extend({ caseCount: z.number(), topCourt: z.string().nullable() })
  .strict();
export type ResearchQueryListItemDto = z.infer<typeof researchQueryListItemDto>;

const retrievedChunkDto = z
  .object({
    chunkId: z.string(),
    score: z.number(),
    kept: z.boolean(),
    text: z.string(),
    paragraphClass: z.enum(PARAGRAPH_CLASSES),
    sectionLabel: z.string().nullable(),
    documentTitle: z.string().optional(),
    source: z.string().optional(),
    url: z.string().nullable().optional(),
  })
  .strict();

export const researchRetrieveResultDto = z
  .object({
    retrievalId: z.string(),
    threshold: z.number(),
    fetchedNewSources: z.boolean(),
    chunks: z.array(retrievedChunkDto),
  })
  .strict();
export type ResearchRetrieveResultDto = z.infer<typeof researchRetrieveResultDto>;

const researchCaseCardDto = z
  .object({
    outcome: z.enum(["allowed", "dismissed", "partial", "not_stated"]),
    facts: z.string().nullable(),
    issues: z.string().nullable(),
    held: z.string().nullable(),
    ratio: z.string().nullable(),
    keyParagraph: z.string().nullable(),
    gloss: z.string().nullable(),
  })
  .partial()
  .passthrough();

export const researchAnswerRowDto = z
  .object({
    id: z.string(),
    query_id: z.string(),
    caveat_text: z.string().nullable(),
    unsupported_span_count: z.number(),
    reviewed_by_advocate_id: z.string().nullable(),
    helpful: z.boolean().nullable(),
    summary: z.string().nullable(),
    case_cards: z.record(z.string(), researchCaseCardDto),
    related_searches: z.array(z.string()),
    related_case_ids: z.array(z.string()),
    sections: z.array(z.unknown()).nullable(),
    authorities: z.array(z.unknown()).nullable(),
    position: z.object({ label: z.string().nullable(), note: z.string() }).strict().nullable(),
    jurisdiction: z.string().nullable(),
    law_as_on: z.string().nullable(),
    note_schema_version: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();
export type ResearchAnswerRowDto = z.infer<typeof researchAnswerRowDto>;

const researchSegmentDto = z
  .object({
    chunkId: z.string().optional(),
    documentId: z.string().optional(),
    text: z.string(),
    score: z.number().nullable(),
    documentTitle: z.string().optional(),
    citation: z.string().nullable().optional(),
    court: z.string().nullable().optional(),
    source: z.string().optional(),
    url: z.string().nullable().optional(),
    paragraphClass: z.enum(PARAGRAPH_CLASSES).optional(),
    sectionLabel: z.string().nullable().optional(),
    gloss: z.string().nullable(),
    facts: z.string().nullable(),
    issues: z.string().nullable(),
    held: z.string().nullable(),
    ratio: z.string().nullable(),
    outcome: z.enum(["allowed", "dismissed", "partial", "not_stated"]),
    keyParagraph: z.string().nullable(),
  })
  .strict();

const researchAuthorityDto = z
  .object({
    n: z.number(),
    title: z.string().optional(),
    court: z.string().nullable(),
    citation: z.string().nullable(),
    source: z.string().optional(),
    url: z.string().nullable(),
    score: z.number().nullable().optional(),
  })
  .strict();

const researchNoteParagraphDto = z.object({ text: z.string(), cites: z.array(z.number()) }).strict();
const researchNoteSectionDto = z
  .object({ id: z.string(), title: z.string(), status: z.enum(["cited", "no_authority"]), citationCount: z.number(), paragraphs: z.array(researchNoteParagraphDto) })
  .strict();

const researchNoteDto = z
  .object({
    sections: z.array(researchNoteSectionDto),
    authorities: z.array(researchAuthorityDto),
    position: z.object({ label: z.enum(["Settled law", "Unsettled", "Conflicting"]).nullable(), note: z.string() }).strict(),
    jurisdiction: z.string().nullable(),
    lawAsOn: z.string().nullable(),
  })
  .strict();

const researchRelatedCaseDto = z
  .object({ id: z.string(), title: z.string(), citation: z.string().nullable(), court: z.string().nullable(), source: z.string(), canonical_url: z.string().nullable() })
  .strict();

const researchReportProcessingDto = z.object({ status: z.literal("processing"), query: researchQueryRowDto }).strict();

const researchReportDoneDto = z
  .object({
    status: z.literal("done"),
    query: researchQueryRowDto,
    answer: researchAnswerRowDto.optional(),
    outcome: z.enum(["answered", "partial", "not_found"]),
    threshold: z.number().optional(),
    segments: z.array(researchSegmentDto),
    aiSummary: z.string().nullable(),
    relatedSearches: z.array(z.string()),
    relatedCases: z.array(researchRelatedCaseDto),
    discardedCount: z.number(),
    note: researchNoteDto.nullable().optional(),
  })
  .strict();

export const researchReportDto = z.discriminatedUnion("status", [researchReportProcessingDto, researchReportDoneDto]);
export type ResearchReportDto = z.infer<typeof researchReportDto>;

export const researchChatTurnDto = z
  .object({
    id: z.string(),
    research_query_id: z.string(),
    question: z.string(),
    answer: z.object({ text: z.string().nullable(), citations: z.array(z.unknown()) }).strict(),
    created_at: z.string(),
  })
  .strict();
export type ResearchChatTurnDto = z.infer<typeof researchChatTurnDto>;

export const corpusDocumentListItemDto = z
  .object({ id: z.string(), title: z.string(), source: z.enum(RESEARCH_SOURCES), citation: z.string(), court: z.string().nullable(), canonical_url: z.string().nullable(), indexed_at: z.string() })
  .strict();
export type CorpusDocumentListItemDto = z.infer<typeof corpusDocumentListItemDto>;

export const corpusDocumentDetailDto = corpusDocumentListItemDto
  .extend({
    decided_on: z.string().nullable(),
    act_name: z.string().nullable(),
    section_number: z.string().nullable(),
    amendment_as_of: z.string().nullable(),
    raw_text: z.string().nullable(),
    treatment: z.string().nullable(),
    superseded_by: z.string().nullable(),
    external_id: z.string().nullable(),
  })
  .strict();
export type CorpusDocumentDetailDto = z.infer<typeof corpusDocumentDetailDto>;

export const corpusChunkBriefDto = z
  .object({ id: z.string(), ordinal: z.number().nullable(), text: z.string(), paragraph_class: z.enum(PARAGRAPH_CLASSES), para_number: z.string().nullable() })
  .strict();
export type CorpusChunkBriefDto = z.infer<typeof corpusChunkBriefDto>;

export const corpusChunkDetailDto = z
  .object({
    id: z.string(),
    document_id: z.string(),
    ordinal: z.number().nullable(),
    text: z.string(),
    char_range: z.array(z.number()).nullable(),
    section_label: z.string().nullable(),
    paragraph_class: z.enum(PARAGRAPH_CLASSES),
    para_number: z.string().nullable(),
    deep_link: z.string().nullable(),
    headnote_flag: z.boolean(),
    token_count: z.number().nullable(),
    keywords: z.array(z.string()),
    embedded_at: z.string().nullable(),
    document: corpusDocumentDetailDto,
    context: z.array(corpusChunkBriefDto),
  })
  .strict();
export type CorpusChunkDetailDto = z.infer<typeof corpusChunkDetailDto>;

export const corpusStatusDto = z
  .object({
    bySource: z.array(z.object({ source: z.string(), count: z.number(), indexed_at: z.string().nullable() }).strict()).nullable(),
    lawAsOn: z.string().nullable(),
    chunkCount: z.number(),
    vectorIndex: z.record(z.string(), z.unknown()),
    asOf: z.string(),
  })
  .strict();
export type CorpusStatusDto = z.infer<typeof corpusStatusDto>;
