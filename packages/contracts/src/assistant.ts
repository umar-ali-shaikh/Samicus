/**
 * AI Legal Assistant domain contracts. Ported from apps/api/src/routes/legalAssistant.js's
 * inline validation and apps/api/src/services/legalAssistant.js's answerLegalQuestion() return
 * shape -- unchanged behaviour, the RAG pipeline itself stays in services/legalAssistant.js
 * (and its own test suite) and is only called from the new module's service layer, same
 * precedent as modules/payments/service.ts calling services/razorpay.js.
 */
import { z } from "zod";

export const SESSION_ID_RE = /^[a-zA-Z0-9-]{1,64}$/;

export const askAssistantSchema = z.object({
  question: z.string().trim().min(1, "'question' is required.").max(5000, "'question' is too long (5,000 characters max)."),
  court: z.union([z.string(), z.array(z.string())]).optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  title: z.string().optional(),
  cite: z.string().optional(),
  author: z.string().optional(),
  bench: z.string().optional(),
  topN: z.union([z.string(), z.number()]).optional(),
  sessionId: z.string().regex(SESSION_ID_RE, "'sessionId' must be a short alphanumeric/hyphen string.").optional(),
});
export type AskAssistantInput = z.infer<typeof askAssistantSchema>;

const assistantUnderstandingDto = z
  .object({
    searchQuery: z.string(),
    topic: z.string(),
    stateDependent: z.boolean(),
    mentionedState: z.string().nullable(),
    language: z.string(),
    speakerRole: z.string(),
  })
  .strict();

const assistantEmergencyDto = z
  .object({
    flag: z.boolean(),
    reason: z.string().nullable(),
    emergencyType: z.string().nullable(),
    message: z.string().nullable(),
    custodyOfRelative: z.boolean(),
  })
  .strict();

const sourceIdsField = z.array(z.string()).optional();

const immediateActionDto = z.object({ step: z.string(), why: z.string().nullable().optional(), sourceIds: sourceIdsField }).strict();
const stepByStepItemDto = z
  .object({
    order: z.number(),
    action: z.string(),
    where: z.string().nullable().optional(),
    documentsNeeded: z.array(z.string()).optional(),
    timeLimit: z.string().nullable().optional(),
    sourceIds: sourceIdsField,
  })
  .strict();
const rightItemDto = z.object({ right: z.string(), sourceIds: sourceIdsField }).strict();
const applicableLawItemDto = z
  .object({
    act: z.string(),
    section: z.string().nullable().optional(),
    plainMeaning: z.string(),
    sourceId: z.string().nullable().optional(),
    sourceUrl: z.string().nullable().optional(),
  })
  .strict();
const caseLawItemDto = z
  .object({
    caseName: z.string(),
    court: z.string().nullable().optional(),
    year: z.string().nullable().optional(),
    whatItMeansForYou: z.string(),
    sourceId: z.string().nullable().optional(),
    sourceUrl: z.string().nullable().optional(),
  })
  .strict();
const whereToGetHelpItemDto = z
  .object({ name: z.string(), contact: z.string().nullable().optional(), whenToUse: z.string(), sourceIds: sourceIdsField })
  .strict();

const assistantSectionsDto = z
  .object({
    summary: z.string().nullable(),
    immediateActions: z.array(immediateActionDto),
    stepByStep: z.array(stepByStepItemDto),
    yourRights: z.array(rightItemDto),
    applicableLaws: z.array(applicableLawItemDto),
    caseLaw: z.array(caseLawItemDto),
    whereToGetHelp: z.array(whereToGetHelpItemDto),
    gaps: z.array(z.string()),
    followUpQuestions: z.array(z.string()),
    confidence: z.enum(["high", "medium", "low"]),
    groundedInEvidence: z.boolean(),
    // Only attached when the facts match a tenancy/security-deposit dispute -- see
    // maybeAttachLegalNoticeTemplate() in services/legalAssistant.js.
    legalNoticeTemplate: z.string().optional(),
  })
  .strict();

const assistantSourceDto = z
  .object({
    tid: z.number().nullable(),
    title: z.string(),
    docsource: z.string(),
    url: z.string(),
    sourceType: z.enum(["rag", "indian_kanoon", "web"]),
  })
  .strict();

const evidenceIndexEntryDto = z.object({ title: z.string(), docsource: z.string(), url: z.string(), sourceType: z.string() }).strict();

const retrievalMetaDto = z
  .object({ mode: z.enum(["knowledge_base", "live_search"]), passages: z.number(), servedFromKnowledgeBase: z.boolean() })
  .strict();

/** Mirrors answerLegalQuestion()'s return shape exactly -- see services/legalAssistant.js. */
export const assistantAnswerDto = z
  .object({
    outcome: z.enum(["general_guidance", "answered", "unparsed", "refused"]),
    understanding: assistantUnderstandingDto,
    emergency: assistantEmergencyDto,
    sections: assistantSectionsDto,
    rawAnswer: z.string().nullable(),
    sources: z.array(assistantSourceDto),
    evidenceIndex: z.record(z.string(), evidenceIndexEntryDto),
    lawCurrencyWarning: z.boolean(),
    // Absent on the prompt-injection "refused" branch -- see promptInjectionRefusalResponse().
    actCitationWarning: z.boolean().optional(),
    evidenceOrigin: z.object({ rag: z.number(), indianKanoon: z.number(), web: z.number() }).strict(),
    // Only present once Stage 5 (generation) actually ran -- absent for general_guidance/refused.
    retrieval: retrievalMetaDto.optional(),
    disclaimer: z.string(),
  })
  .strict();
export type AssistantAnswerDto = z.infer<typeof assistantAnswerDto>;

export const assistantSessionTurnDto = z.object({ question: z.string(), result: assistantAnswerDto, created_at: z.string() }).strict();
export type AssistantSessionTurnDto = z.infer<typeof assistantSessionTurnDto>;

export const assistantSessionDto = z.object({ turns: z.array(assistantSessionTurnDto) }).strict();
export type AssistantSessionDto = z.infer<typeof assistantSessionDto>;
