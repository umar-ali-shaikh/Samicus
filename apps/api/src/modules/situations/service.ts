import { HttpError } from "../../services/access.js";
import type { IntakeRouteInput, RoutingResultDto, SituationDto } from "@vidhira/contracts";
import * as repo from "./repository.js";

const DISCLAIMER = "This routes you to a practice area. It is not legal advice.";

function toDto(row: repo.RawSituationRow): SituationDto {
  return {
    id: row.id,
    label_en: row.label_en,
    label_hi: row.label_hi,
    mapped_practice_area_id: row.mapped_practice_area_id,
    urgency_default: row.urgency_default as SituationDto["urgency_default"],
    routing_note: row.routing_note,
    version: row.version,
    mapped_practice_area: row.mapped_practice_area as SituationDto["mapped_practice_area"],
  };
}

export async function listSituations(): Promise<SituationDto[]> {
  const rows = await repo.listSituations();
  return rows.map(toDto);
}

export async function routeIntake(input: IntakeRouteInput): Promise<RoutingResultDto> {
  if (input.situationId) {
    const situation = await repo.findSituationById(input.situationId);
    if (!situation) throw new HttpError(404, "Situation not found");
    return { routedPracticeArea: situation.mapped_practice_area as RoutingResultDto["routedPracticeArea"], routingConfidence: 0.95, disclaimer: DISCLAIMER };
  }

  if (!input.freeText?.trim()) {
    throw new HttpError(400, "situationId or freeText is required");
  }

  const situations = await repo.listSituations();
  const words = new Set(input.freeText.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  let best: repo.RawSituationRow | null = null;
  let bestScore = 0;
  for (const s of situations) {
    const score = s.label_en.toLowerCase().split(/\W+/).filter((w) => w.length > 3 && words.has(w)).length;
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  return {
    routedPracticeArea: (best?.mapped_practice_area as RoutingResultDto["routedPracticeArea"]) ?? null,
    routingConfidence: best ? Math.min(0.9, 0.5 + bestScore * 0.2) : 0,
    disclaimer: DISCLAIMER,
  };
}
