/** Situations domain contracts. Ported from apps/api/src/routes/situations.js. */
import { z } from "zod";
import { practiceAreaDto } from "./advocates.js";

export const intakeRouteSchema = z.object({
  situationId: z.string().uuid().optional(),
  freeText: z.string().trim().optional(),
});
export type IntakeRouteInput = z.infer<typeof intakeRouteSchema>;

export const situationDto = z
  .object({
    id: z.string(),
    label_en: z.string(),
    label_hi: z.string(),
    mapped_practice_area_id: z.string(),
    urgency_default: z.enum(["today", "48h", "week", "deadline"]),
    routing_note: z.string().nullable(),
    version: z.number(),
    mapped_practice_area: practiceAreaDto.nullable(),
  })
  .strict();
export type SituationDto = z.infer<typeof situationDto>;

export const routingResultDto = z
  .object({
    routedPracticeArea: practiceAreaDto.nullable(),
    routingConfidence: z.number(),
    disclaimer: z.string(),
  })
  .strict();
export type RoutingResultDto = z.infer<typeof routingResultDto>;
