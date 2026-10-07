/**
 * Consultations domain contracts. Ported from apps/api/src/routes/consultations.js's inline
 * validation (bookSchema, the ad hoc PATCH body) and its handlers' full-row response shapes.
 */
import { z } from "zod";
import { CONSULTATION_MODES } from "./advocates.js";

export const CONSULTATION_STATES = ["scheduled", "reminder_sent", "in_progress", "completed", "notes_published", "rescheduled", "cancelled"] as const;

// --- Request schemas ---

export const bookConsultationSchema = z.object({
  intakeId: z.string().uuid(),
  advocateId: z.string().uuid(),
  mode: z.enum(CONSULTATION_MODES),
  scheduledStart: z.string().datetime({ offset: true }),
});
export type BookConsultationInput = z.infer<typeof bookConsultationSchema>;

// state/notes/recordingEnabled/scheduledStart are all optional and independently applicable --
// which combinations are actually allowed (client vs. advocate side, which states, etc.) is a
// runtime policy decision (same as the original's ad hoc req.body reads), not a shape the
// schema itself can express, so every field here stays optional.
export const patchConsultationSchema = z.object({
  state: z.enum(CONSULTATION_STATES).optional(),
  notes: z.string().max(20000).optional(),
  recordingEnabled: z.boolean().optional(),
  scheduledStart: z.string().datetime({ offset: true }).optional(),
});
export type PatchConsultationInput = z.infer<typeof patchConsultationSchema>;

export const consultationFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});
export type ConsultationFeedbackInput = z.infer<typeof consultationFeedbackSchema>;

// --- Response DTOs ---

export const consultationDto = z
  .object({
    id: z.string(),
    intake_id: z.string(),
    advocate_id: z.string(),
    account_id: z.string(),
    mode: z.enum(CONSULTATION_MODES),
    scheduled_start: z.string().nullable(),
    duration_minutes: z.number(),
    room_token: z.string().nullable(),
    state: z.enum(CONSULTATION_STATES),
    recording_enabled: z.boolean(),
    notes: z.string().nullable(),
    converted_matter_id: z.string().nullable(),
    fee_professional: z.number().nullable(),
    fee_platform: z.number().nullable(),
    fee_gst: z.number().nullable(),
    fee_total: z.number().nullable(),
    payment_method: z.string().nullable(),
    paid_at: z.string().nullable(),
    csat_rating: z.number().nullable(),
    csat_comment: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();
export type ConsultationDto = z.infer<typeof consultationDto>;

export const consultationListItemDto = consultationDto.extend({
  advocate: z
    .object({
      id: z.string(),
      city: z.string().nullable(),
      user: z.object({ full_name: z.string(), avatar_url: z.string().nullable() }).strict().nullable(),
    })
    .strict()
    .nullable(),
  account: z.object({ display_name: z.string() }).strict().nullable(),
  intake: z
    .object({
      kind: z.string(),
      situation_id: z.string().nullable(),
      practice_area: z.object({ name: z.string() }).strict().nullable(),
    })
    .strict()
    .nullable(),
});
export type ConsultationListItemDto = z.infer<typeof consultationListItemDto>;

export const consultationFeedbackResultDto = z.object({ id: z.string(), csat_rating: z.number() }).strict();

export const consultationRoomDto = z.object({ roomToken: z.string(), roomUrl: z.string(), consultation: consultationDto }).strict();

// matters isn't a converted domain yet -- the inserted row is returned in full by the
// original handler, so this stays a loose shape (same precedent as advocateDto's
// weekly_schedule) rather than guessing at the matters table's full column list here.
export const convertToMatterResultDto = z
  .object({
    matter: z.looseObject({ id: z.string() }),
    consultation: consultationDto,
  })
  .strict();
export type ConvertToMatterResultDto = z.infer<typeof convertToMatterResultDto>;
