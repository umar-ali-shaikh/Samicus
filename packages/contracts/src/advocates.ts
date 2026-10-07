/**
 * Advocates domain contracts. Ported from apps/api/src/routes/advocates.js's inline
 * validation (applySchema, the PATCH profile fieldShape() builder) and flattenAdvocate's
 * response shape -- same rules, same copy.
 */
import { z } from "zod";

export const CONSULTATION_MODES = ["video", "phone", "chat", "in_person"] as const;
export const VERIFICATION_STATUSES = ["submitted", "documents_requested", "under_review", "verified", "rejected"] as const;
export const AVAILABILITY_STATES = ["available", "busy", "offline"] as const;

// --- Request schemas ---

const jurisdictionInput = z.object({ state: z.string().trim().min(2).max(60), forum: z.string().trim().min(2).max(100) });

/**
 * Zod 4's .partial() still applies .default() values, which would silently wipe arrays on a
 * partial PATCH -- so the optional (profile patch) and defaulted (apply) shapes are built
 * separately, same as the original fieldShape({ forApply }) helper. Split into two concrete
 * functions (rather than one parameterized by a runtime boolean) because TypeScript can't
 * specialize a return type on a non-literal boolean parameter -- a single shared helper would
 * infer every field as possibly-undefined in BOTH schemas, even the one with .default().
 */
function applyFieldShape() {
  return {
    subSpecialisations: z.array(z.string().trim().max(60)).max(10).default([]),
    yearsOfPractice: z.number().int().min(0).max(70).optional(),
    education: z.array(z.string().trim().max(160)).max(6).default([]),
    relevantExperience: z.array(z.string().trim().max(300)).max(10).default([]),
    city: z.string().trim().min(2).max(80),
    chamberAddress: z.string().trim().max(300).optional(),
    languages: z.array(z.string().trim().min(2).max(20)).min(1).max(8),
    consultationModes: z.array(z.enum(CONSULTATION_MODES)).min(1),
    jurisdictions: z.array(jurisdictionInput).max(12).default([]),
    instantFee: z.number().min(0).max(1000000).optional(),
    scheduledFee: z.number().min(0).max(1000000).optional(),
    acceptsUrgent: z.boolean().default(false),
    keywords: z.array(z.string().trim().max(40)).max(15).default([]),
  };
}

function profileFieldShape() {
  return {
    subSpecialisations: z.array(z.string().trim().max(60)).max(10).optional(),
    yearsOfPractice: z.number().int().min(0).max(70).optional(),
    education: z.array(z.string().trim().max(160)).max(6).optional(),
    relevantExperience: z.array(z.string().trim().max(300)).max(10).optional(),
    city: z.string().trim().min(2).max(80).optional(),
    chamberAddress: z.string().trim().max(300).optional(),
    languages: z.array(z.string().trim().min(2).max(20)).min(1).max(8).optional(),
    consultationModes: z.array(z.enum(CONSULTATION_MODES)).min(1).optional(),
    jurisdictions: z.array(jurisdictionInput).max(12).optional(),
    instantFee: z.number().min(0).max(1000000).optional(),
    scheduledFee: z.number().min(0).max(1000000).optional(),
    acceptsUrgent: z.boolean().optional(),
    keywords: z.array(z.string().trim().max(40)).max(15).optional(),
  };
}

export const applyAdvocateSchema = z.object({
  barCouncil: z.string().trim().min(2).max(120),
  enrolmentNumber: z.string().trim().min(3).max(60),
  enrolmentYear: z.number().int().min(1950).max(new Date().getFullYear()).optional(),
  practiceAreaIds: z.array(z.string().uuid()).min(1).max(6),
  ...applyFieldShape(),
});
export type ApplyAdvocateInput = z.infer<typeof applyAdvocateSchema>;

export const advocateProfilePatchSchema = z.object({
  ...profileFieldShape(),
  weeklySchedule: z.looseObject({}).optional(),
});
export type AdvocateProfilePatchInput = z.infer<typeof advocateProfilePatchSchema>;

export const availabilityPatchSchema = z.object({
  availabilityState: z.enum(AVAILABILITY_STATES).optional(),
  acceptsUrgent: z.boolean().optional(),
});
export type AvailabilityPatchInput = z.infer<typeof availabilityPatchSchema>;

export const notifyWhenAvailableSchema = z.object({
  accountId: z.string().uuid().optional(),
  practiceAreaId: z.string().uuid().optional(),
});
export type NotifyWhenAvailableInput = z.infer<typeof notifyWhenAvailableSchema>;

export const directoryQuerySchema = z.object({
  issue: z.string().uuid().optional(),
  city: z.string().trim().max(80).optional(),
  forum: z.string().trim().max(100).optional(),
  language: z.string().trim().max(20).optional(),
  mode: z.enum(CONSULTATION_MODES).optional(),
  fee_max: z.coerce.number().min(0).optional(),
  available_today: z.enum(["true", "false"]).optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type DirectoryQuery = z.infer<typeof directoryQuerySchema>;

// --- Response DTOs ---

export const practiceAreaDto = z
  .object({
    id: z.string(),
    name: z.string(),
    sub_specialisations: z.array(z.string()),
    typical_forums: z.array(z.string()),
    statute_tags: z.array(z.string()),
  })
  .strict();

export const jurisdictionDto = z.object({ state: z.string().nullable(), forum: z.string().nullable() }).strict();

export const advocateDto = z
  .object({
    id: z.string(),
    user_id: z.string(),
    bar_council: z.string(),
    enrolment_number: z.string(),
    enrolment_year: z.number().nullable(),
    verification_status: z.enum(VERIFICATION_STATUSES),
    sub_specialisations: z.array(z.string()),
    years_of_practice: z.number().nullable(),
    education: z.array(z.string()),
    relevant_experience: z.array(z.string()),
    instant_fee: z.number().nullable(),
    scheduled_fee: z.number().nullable(),
    availability_state: z.enum(AVAILABILITY_STATES),
    accepts_urgent: z.boolean(),
    chamber_address: z.string().nullable(),
    city: z.string().nullable(),
    keywords: z.array(z.string()),
    weekly_schedule: z.looseObject({}),
    created_at: z.string(),
    updated_at: z.string(),
    user: z.object({ full_name: z.string(), avatar_url: z.string().nullable() }).strict().nullable(),
    practice_areas: z.array(practiceAreaDto),
    jurisdictions: z.array(jurisdictionDto),
    languages: z.array(z.string()),
    consultation_modes: z.array(z.string()),
  })
  .strict();
export type AdvocateDto = z.infer<typeof advocateDto>;

export const directoryItemDto = advocateDto.extend({ whyMatched: z.string() });
export type DirectoryItemDto = z.infer<typeof directoryItemDto>;

export const directoryResultDto = z
  .object({
    items: z.array(directoryItemDto),
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
    hasMore: z.boolean(),
  })
  .strict();
export type DirectoryResultDto = z.infer<typeof directoryResultDto>;

export const slotDto = z.object({ time: z.string(), startsAt: z.string(), full: z.boolean() }).strict();
export const availabilityDayDto = z.object({ date: z.string(), slots: z.array(slotDto) }).strict();
export type AvailabilityDayDto = z.infer<typeof availabilityDayDto>;

export const advocateRequestListItemDto = z
  .object({
    id: z.string(),
    account_id: z.string(),
    situation_id: z.string().nullable(),
    routed_practice_area_id: z.string().nullable(),
    urgency: z.string(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    forum: z.string().nullable(),
    mode: z.string(),
    language: z.string(),
    kind: z.string(),
    status: z.string(),
    consent_given_at: z.string().nullable(),
    created_at: z.string(),
    practice_area: z.object({ name: z.string() }).strict().nullable(),
    conflict_status: z.string(),
  })
  .strict();
export type AdvocateRequestListItemDto = z.infer<typeof advocateRequestListItemDto>;

export const conflictCheckDto = z
  .object({
    id: z.string(),
    intake_id: z.string(),
    advocate_id: z.string(),
    status: z.string(),
    checked_at: z.string(),
    counterpartyChecked: z.boolean(),
  })
  .strict();
export type ConflictCheckDto = z.infer<typeof conflictCheckDto>;
