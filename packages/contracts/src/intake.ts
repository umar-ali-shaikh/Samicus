/**
 * Intake/matching domain contracts. Ported from apps/api/src/routes/intake.js's inline
 * validation (intakeSchema, urgentSchema) and its handlers' response shapes (full
 * intake_requests row, {weightsVersion, matches}, the urgent-request outcome union).
 */
import { z } from "zod";
import { AVAILABILITY_STATES, CONSULTATION_MODES } from "./advocates.js";

export const INTAKE_URGENCIES = ["today", "48h", "week", "deadline"] as const;
export const INTAKE_KINDS = ["instant", "scheduled", "urgent"] as const;
export const INTAKE_STATUSES = [
  "created",
  "searching",
  "advocate_reviewing",
  "matched",
  "connected",
  "completed",
  "none_available",
  "callback_scheduled",
  "declined",
] as const;

// --- Request schemas ---

export const createIntakeSchema = z.object({
  accountId: z.string().uuid().optional(),
  description: z.string().trim().max(5000).optional(),
  counterpartyName: z.string().trim().max(160).optional(),
  situationId: z.string().uuid().optional(),
  routedPracticeAreaId: z.string().uuid().optional(),
  urgency: z.enum(INTAKE_URGENCIES),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  forum: z.string().trim().max(120).optional(),
  mode: z.enum(CONSULTATION_MODES),
  language: z.string().trim().min(2).max(20),
  kind: z.enum(["instant", "scheduled"]).default("scheduled"),
});
export type CreateIntakeInput = z.infer<typeof createIntakeSchema>;

export const urgentRequestSchema = createIntakeSchema.omit({ kind: true, mode: true, language: true, urgency: true }).extend({
  mode: z.enum(CONSULTATION_MODES).default("phone"),
  language: z.string().trim().min(2).max(20).default("en"),
  urgency: z.enum(INTAKE_URGENCIES).default("today"),
});
export type UrgentRequestInput = z.infer<typeof urgentRequestSchema>;

// --- Response DTOs ---

export const intakeDto = z
  .object({
    id: z.string(),
    account_id: z.string(),
    created_by: z.string(),
    description: z.string().nullable(),
    counterparty_name: z.string().nullable(),
    voice_transcript_id: z.string().nullable(),
    situation_id: z.string().nullable(),
    routed_practice_area_id: z.string().nullable(),
    routing_confidence: z.number().nullable(),
    urgency: z.enum(INTAKE_URGENCIES),
    city: z.string().nullable(),
    state: z.string().nullable(),
    forum: z.string().nullable(),
    mode: z.enum(CONSULTATION_MODES),
    language: z.string(),
    kind: z.enum(INTAKE_KINDS),
    status: z.enum(INTAKE_STATUSES),
    consent_given_at: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();
export type IntakeDto = z.infer<typeof intakeDto>;

export const intakeListItemDto = intakeDto.extend({
  practice_area: z.object({ name: z.string() }).strict().nullable(),
});
export type IntakeListItemDto = z.infer<typeof intakeListItemDto>;

const advocateSummaryDto = z
  .object({
    id: z.string(),
    city: z.string().nullable(),
    years_of_practice: z.number().nullable(),
    availability_state: z.enum(AVAILABILITY_STATES),
    instant_fee: z.number().nullable(),
    scheduled_fee: z.number().nullable(),
    bar_council: z.string(),
    user: z.object({ full_name: z.string(), avatar_url: z.string().nullable() }).strict().nullable(),
  })
  .strict();

export const matchResultDto = z
  .object({
    id: z.string(),
    intake_id: z.string(),
    advocate_id: z.string(),
    rank: z.number().nullable(),
    score_breakdown: z.record(z.string(), z.number()).nullable(),
    total_score: z.number().nullable(),
    why_matched: z.string().nullable(),
    estimated_response_seconds: z.number().nullable(),
    quoted_fee: z.number().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
    advocate: advocateSummaryDto.nullable(),
  })
  .strict();
export type MatchResultDto = z.infer<typeof matchResultDto>;

export const matchesResponseDto = z.object({ weightsVersion: z.string(), matches: z.array(matchResultDto) }).strict();
export type MatchesResponseDto = z.infer<typeof matchesResponseDto>;

const candidateDto = z
  .object({
    advocate_id: z.string(),
    why_matched: z.string().nullable(),
    quoted_fee: z.number().nullable(),
    advocate: advocateSummaryDto.nullable(),
  })
  .strict();

export const urgentRequestResultDto = z.discriminatedUnion("status", [
  z.object({ status: z.literal("none_available"), intake: intakeDto, helpline: z.string() }).strict(),
  z.object({ status: z.literal("advocate_reviewing"), intake: intakeDto, candidate: candidateDto }).strict(),
]);
export type UrgentRequestResultDto = z.infer<typeof urgentRequestResultDto>;

const consultationPollDto = z
  .object({
    id: z.string(),
    mode: z.enum(CONSULTATION_MODES),
    scheduled_start: z.string().nullable(),
    state: z.string(),
    fee_total: z.number().nullable(),
    paid_at: z.string().nullable(),
    advocate: z.object({ id: z.string(), user: z.object({ full_name: z.string() }).strict().nullable() }).strict().nullable(),
  })
  .strict();

const matterRefDto = z.object({ id: z.string(), reference: z.string(), stage: z.string() }).strict();

export const intakeStatusDto = z
  .object({
    intake: intakeDto,
    consultation: consultationPollDto.nullable(),
    matter: matterRefDto.nullable(),
  })
  .strict();
export type IntakeStatusDto = z.infer<typeof intakeStatusDto>;
