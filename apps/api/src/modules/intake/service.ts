/**
 * Business logic for the intake/matching domain. Ported from routes/intake.js -- same
 * behaviour, including the exact validation order, error messages and matching/ranking rules,
 * split out from HTTP concerns.
 */
import { HttpError, assertAccountMember, defaultAccountId, memberAccountIds } from "../../services/access.js";
import { rankAdvocates, MATCHING_WEIGHTS_VERSION } from "../../services/matching.js";
import type {
  CreateIntakeInput,
  IntakeDto,
  IntakeListItemDto,
  IntakeStatusDto,
  MatchResultDto,
  MatchesResponseDto,
  UrgentRequestInput,
  UrgentRequestResultDto,
} from "@vidhira/contracts";
import * as repo from "./repository.js";

type Candidate = Extract<UrgentRequestResultDto, { status: "advocate_reviewing" }>["candidate"];

// matching.js is pure/DB-agnostic -- it expects plain camelCase objects with flat arrays.
// These two mappers adapt the Postgres rows to that shape.
function toMatchingAdvocate(row: repo.VerifiedAdvocateJoinRow) {
  return {
    ...row,
    _id: row.id,
    verificationStatus: row.verification_status,
    practiceAreas: ((row.advocate_practice_areas as Array<{ practice_area_id: string }>) || []).map((r) => r.practice_area_id),
    jurisdictions: ((row.advocate_jurisdictions as Array<{ state: string; forum: string }>) || []).map((r) => ({ state: r.state, forum: r.forum })),
    languages: ((row.advocate_languages as Array<{ language: string }>) || []).map((r) => r.language),
    consultationModes: ((row.advocate_consultation_modes as Array<{ mode: string }>) || []).map((r) => r.mode),
    subSpecialisations: row.sub_specialisations,
    relevantExperience: row.relevant_experience,
    availabilityState: row.availability_state,
    acceptsUrgent: row.accepts_urgent,
    instantFee: row.instant_fee,
    scheduledFee: row.scheduled_fee,
  };
}

function toMatchingIntake(intake: repo.IntakeRow) {
  return {
    routedPracticeAreaId: intake.routed_practice_area_id,
    state: intake.state,
    language: intake.language,
    mode: intake.mode,
    forum: intake.forum,
    urgency: intake.urgency,
    kind: intake.kind,
  };
}

interface RankedMatch {
  advocate: { _id: string };
  rank: number;
  scoreBreakdown: Record<string, number>;
  totalScore: number;
  whyMatched: string;
  estimatedResponseSeconds: number;
  quotedFee: number | null;
}

async function attachAdvocateSummaries(
  rows: Array<{ advocate_id: string; [key: string]: unknown }>,
): Promise<Array<Record<string, unknown> & { advocate: repo.AdvocateSummaryRow | null }>> {
  if (rows.length === 0) return [];
  const advocates = await repo.findAdvocateSummaries(rows.map((r) => r.advocate_id));
  const byId = new Map(advocates.map((a) => [a.id, a]));
  return rows.map((r) => ({ ...r, advocate: byId.get(r.advocate_id) ?? null }));
}

// Creates the intake row after verifying the caller belongs to the account, and works out
// the practice area from the chosen situation when the client didn't pick one directly.
async function createIntake(user: { id: string }, input: CreateIntakeInput | UrgentRequestInput, kind: string): Promise<repo.IntakeRow> {
  const accountId = input.accountId || (await defaultAccountId(user.id));
  if (!accountId) throw new HttpError(400, "accountId is required.");
  await assertAccountMember(user.id, accountId);

  let areaId = input.routedPracticeAreaId;
  let routingConfidence: number | null = areaId ? 1 : null;
  if (!areaId && input.situationId) {
    const situation = await repo.findSituationPracticeArea(input.situationId);
    if (!situation) throw new HttpError(400, "Unknown situation.");
    areaId = situation.mapped_practice_area_id ?? undefined;
    routingConfidence = 0.95;
  }
  if (!areaId) throw new HttpError(400, "Choose a situation or practice area so we can route your request.");

  return repo.insertIntake({
    accountId,
    createdBy: user.id,
    description: input.description,
    counterpartyName: input.counterpartyName,
    situationId: input.situationId,
    routedPracticeAreaId: areaId,
    routingConfidence,
    urgency: input.urgency,
    city: input.city,
    state: input.state,
    forum: input.forum,
    mode: input.mode,
    language: input.language,
    kind,
  });
}

export async function createScheduledOrInstantIntake(user: { id: string }, input: CreateIntakeInput): Promise<IntakeDto> {
  return (await createIntake(user, input, input.kind)) as unknown as IntakeDto;
}

async function loadOwnIntake(user: { id: string }, id: string): Promise<repo.IntakeRow> {
  const intake = await repo.findIntakeById(id);
  if (!intake) throw new HttpError(404, "Not found");
  await assertAccountMember(user.id, intake.account_id).catch(() => {
    throw new HttpError(404, "Not found");
  });
  return intake;
}

export async function listMyIntakes(userId: string): Promise<IntakeListItemDto[]> {
  const accountIds = await memberAccountIds(userId);
  if (accountIds.length === 0) return [];
  return (await repo.listIntakesForAccounts(accountIds)) as unknown as IntakeListItemDto[];
}

export async function computeMatches(user: { id: string }, intakeId: string): Promise<MatchesResponseDto> {
  const intake = await loadOwnIntake(user, intakeId);
  const advocateRows = await repo.listVerifiedAdvocatesForMatching();
  const advocates = advocateRows.map(toMatchingAdvocate);
  const ranked = rankAdvocates(advocates, toMatchingIntake(intake)).slice(0, 3) as RankedMatch[];

  // MatchResult.deleteMany + insertMany as one transaction -- see replace_match_results() in schema.sql.
  const saved = await repo.replaceMatchResults(
    intake.id,
    ranked.map((m) => ({
      advocate_id: m.advocate._id,
      rank: m.rank,
      score_breakdown: m.scoreBreakdown,
      total_score: m.totalScore,
      why_matched: m.whyMatched,
      estimated_response_seconds: m.estimatedResponseSeconds,
      quoted_fee: m.quotedFee,
    })),
  );

  const matches = await attachAdvocateSummaries(saved as Array<{ advocate_id: string; [key: string]: unknown }>);
  return { weightsVersion: MATCHING_WEIGHTS_VERSION, matches: matches as unknown as MatchResultDto[] };
}

export async function giveConsent(user: { id: string }, intakeId: string): Promise<IntakeDto> {
  const intake = await loadOwnIntake(user, intakeId);
  return (await repo.updateIntakeConsent(intake.id)) as unknown as IntakeDto;
}

export async function cancelIntake(user: { id: string }, intakeId: string): Promise<IntakeDto> {
  const intake = await loadOwnIntake(user, intakeId);
  if (!["searching", "advocate_reviewing", "none_available"].includes(intake.status)) {
    throw new HttpError(409, "This request can no longer be cancelled.");
  }
  return (await repo.updateIntakeStatus(intake.id, "declined")) as unknown as IntakeDto;
}

export async function getIntakeStatus(user: { id: string }, intakeId: string): Promise<IntakeStatusDto> {
  const intake = await loadOwnIntake(user, intakeId);
  const [consultation, matter] = await Promise.all([
    repo.findLatestConsultationForIntake(intake.id),
    intake.status === "matched" ? repo.findFirstMatterForAccountSince(intake.account_id, intake.created_at) : Promise.resolve(null),
  ]);
  return { intake: intake as unknown as IntakeDto, consultation: consultation as unknown as IntakeStatusDto["consultation"], matter };
}

// Urgent path -- same request model, shorter SLA framing, fastest-callback fallback.
export async function createUrgentRequest(user: { id: string }, input: UrgentRequestInput): Promise<UrgentRequestResultDto> {
  const intake = await createIntake(user, input, "urgent");

  const advocateRows = await repo.listAvailableUrgentAdvocatesForMatching();
  // Urgent matching ignores language/mode/state hard filters: the first available
  // verified advocate in the right practice area is better than none.
  const relaxed = { ...toMatchingIntake(intake), state: undefined, language: undefined, mode: undefined };
  const ranked = rankAdvocates(advocateRows.map(toMatchingAdvocate), relaxed) as RankedMatch[];

  if (ranked.length === 0) {
    const updatedIntake = await repo.updateIntakeStatus(intake.id, "none_available");
    return { status: "none_available", intake: updatedIntake as unknown as IntakeDto, helpline: "NALSA free legal aid helpline · 15100" };
  }

  const top = ranked[0]!;
  await repo.insertConflictCheck(intake.id, top.advocate._id);
  const updatedIntake = await repo.updateIntakeStatus(intake.id, "advocate_reviewing");

  const [candidate] = await attachAdvocateSummaries([{ advocate_id: top.advocate._id, why_matched: top.whyMatched, quoted_fee: top.quotedFee }]);
  return {
    status: "advocate_reviewing",
    intake: updatedIntake as unknown as IntakeDto,
    candidate: candidate as unknown as Candidate,
  };
}
