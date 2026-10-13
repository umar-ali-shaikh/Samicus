/**
 * Ask & learn domain contracts. Ported from routes/askLearn.js's inline schemas and its
 * handlers' response shapes.
 */
import { z } from "zod";
import { practiceAreaDto } from "./advocates.js";

export const askQuestionSchema = z.object({
  body: z.string().trim().min(20, "Please describe your question in at least 20 characters.").max(2000),
  practiceArea: z.string().trim().max(80).optional(),
  city: z.string().trim().max(80).optional(),
  accountId: z.string().uuid().optional(),
});
export type AskQuestionInput = z.infer<typeof askQuestionSchema>;

export const answerQuestionSchema = z.object({ body: z.string().trim().min(30, "Answers must be 30–4,000 characters.").max(4000) });
export type AnswerQuestionInput = z.infer<typeof answerQuestionSchema>;

export const createGuideSchema = z.object({
  tag: z.string().trim().max(40).optional(),
  title: z.string().trim().min(5).max(160),
  body: z.string().trim().min(50).max(20000),
  locale: z.enum(["en", "hi"]).default("en"),
  readMinutes: z.number().int().min(1).max(60).optional(),
});
export type CreateGuideInput = z.infer<typeof createGuideSchema>;

export const moderationDecisionSchema = z.object({ decision: z.enum(["published", "rejected"]) });
export type ModerationDecisionInput = z.infer<typeof moderationDecisionSchema>;

export const specialisationDto = practiceAreaDto.extend({ advocateCount: z.number() });
export type SpecialisationDto = z.infer<typeof specialisationDto>;

export const createdQuestionDto = z.object({ id: z.string(), status: z.enum(["pending_moderation", "published", "rejected"]) }).strict();
export type CreatedQuestionDto = z.infer<typeof createdQuestionDto>;

const publicAnswerDto = z
  .object({
    id: z.string(),
    body: z.string(),
    helpful_count: z.number(),
    published_at: z.string().nullable(),
    advocate: z.object({ city: z.string().nullable(), user: z.object({ full_name: z.string() }).strict().nullable() }).strict().nullable(),
  })
  .strict();
export type PublicAnswerDto = z.infer<typeof publicAnswerDto>;

export const publicQuestionDto = z
  .object({
    id: z.string(),
    body: z.string(),
    practice_area: z.string().nullable(),
    city: z.string().nullable(),
    status: z.enum(["pending_moderation", "published", "rejected"]),
    view_count: z.number(),
    created_at: z.string(),
    answers: z.array(publicAnswerDto),
  })
  .strict();
export type PublicQuestionDto = z.infer<typeof publicQuestionDto>;

export const myQuestionDto = z
  .object({ id: z.string(), body: z.string(), practice_area: z.string().nullable(), status: z.enum(["pending_moderation", "published", "rejected"]), created_at: z.string() })
  .strict();
export type MyQuestionDto = z.infer<typeof myQuestionDto>;

export const createdAnswerDto = z.object({ id: z.string(), moderation_state: z.enum(["pending", "published", "rejected"]) }).strict();
export type CreatedAnswerDto = z.infer<typeof createdAnswerDto>;

export const guideListItemDto = z
  .object({ id: z.string(), tag: z.string().nullable(), title: z.string(), locale: z.string(), read_minutes: z.number().nullable(), reviewed_at: z.string().nullable() })
  .strict();
export type GuideListItemDto = z.infer<typeof guideListItemDto>;

export const guideDetailDto = guideListItemDto.extend({ body: z.string().nullable() });
export type GuideDetailDto = z.infer<typeof guideDetailDto>;

export const moderationQueueDto = z
  .object({
    questions: z.array(z.object({ id: z.string(), body: z.string(), practice_area: z.string().nullable(), city: z.string().nullable(), created_at: z.string() }).strict()),
    answers: z.array(
      z
        .object({
          id: z.string(),
          body: z.string(),
          created_at: z.string(),
          question: z.object({ id: z.string(), body: z.string() }).strict().nullable(),
          advocate: z.object({ user: z.object({ full_name: z.string() }).strict().nullable() }).strict().nullable(),
        })
        .strict(),
    ),
  })
  .strict();
export type ModerationQueueDto = z.infer<typeof moderationQueueDto>;
