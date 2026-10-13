/**
 * Business logic for the advocates domain. Ported from routes/advocates.js -- same behaviour,
 * including the exact validation order, error messages and matching/ranking rules, split out
 * from HTTP concerns.
 *
 * Pagination added to the directory search per docs/MASTER-PROMPT.md's Phase 3 scope note
 * ("advocates/situations (incl. notify_requests + pagination)") -- the original had none.
 * fee_max/q can't be pushed into SQL cleanly (q matches across joined/array fields with no
 * search index), so they stay in-memory post-fetch exactly as before; pagination is applied
 * to that already-filtered, already-sorted array. A future RAG/search-index pass could push
 * `q` into the DB; out of scope here.
 */
import { HttpError } from "../../services/access.js";
import { BOOKED_STATES, buildAvailability, normalizeSchedule } from "../../services/slots.js";
import { computeFees } from "../../services/matching.js";
import { openMatterThread } from "../../services/messaging.js";
import { logAudit } from "../../platform/audit.js";
import type {
  AdvocateDto,
  AdvocateProfilePatchInput,
  AdvocateRequestListItemDto,
  ApplyAdvocateInput,
  AvailabilityDayDto,
  AvailabilityPatchInput,
  ConflictCheckDto,
  DirectoryItemDto,
  DirectoryQuery,
  DirectoryResultDto,
  NotifyWhenAvailableInput,
} from "@vidhira/contracts";
import * as repo from "./repository.js";

const OPEN_REQUEST_STATES = ["searching", "advocate_reviewing"] as const;

function flattenAdvocate(row: repo.RawAdvocateRow): AdvocateDto {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    bar_council: row.bar_council as string,
    enrolment_number: row.enrolment_number as string,
    enrolment_year: (row.enrolment_year as number | null) ?? null,
    verification_status: row.verification_status as AdvocateDto["verification_status"],
    sub_specialisations: (row.sub_specialisations as string[] | null) ?? [],
    years_of_practice: row.years_of_practice ?? null,
    education: (row.education as string[] | null) ?? [],
    relevant_experience: (row.relevant_experience as string[] | null) ?? [],
    instant_fee: row.instant_fee ?? null,
    scheduled_fee: row.scheduled_fee ?? null,
    availability_state: row.availability_state as AdvocateDto["availability_state"],
    accepts_urgent: Boolean(row.accepts_urgent),
    chamber_address: (row.chamber_address as string | null) ?? null,
    city: row.city ?? null,
    keywords: row.keywords ?? [],
    weekly_schedule: (row.weekly_schedule as Record<string, unknown>) ?? {},
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    user: row.user ? { full_name: row.user.full_name, avatar_url: row.user.avatar_url ?? null } : null,
    practice_areas: (row.advocate_practice_areas ?? []).map((r) => r.practice_area) as AdvocateDto["practice_areas"],
    jurisdictions: (row.advocate_jurisdictions ?? []).map((r) => ({ state: r.state, forum: r.forum })),
    languages: (row.advocate_languages ?? []).map((r) => r.language),
    consultation_modes: (row.advocate_consultation_modes ?? []).map((r) => r.mode),
  };
}

export async function searchDirectory(filters: DirectoryQuery): Promise<DirectoryResultDto> {
  const rows = await repo.searchDirectoryRows(filters);
  let advocates = rows.map(flattenAdvocate);

  if (filters.fee_max !== undefined) {
    advocates = advocates.filter((a) => (a.scheduled_fee ?? a.instant_fee ?? 0) <= filters.fee_max!);
  }
  if (filters.q) {
    const needle = filters.q.toLowerCase();
    advocates = advocates.filter((a) =>
      [a.user?.full_name, a.city, ...a.keywords, ...a.sub_specialisations, ...a.practice_areas.map((p) => p.name)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }

  // Deterministic, payment-neutral order: available first, then more experienced.
  advocates.sort(
    (a, b) =>
      Number(b.availability_state === "available") - Number(a.availability_state === "available") ||
      (b.years_of_practice || 0) - (a.years_of_practice || 0),
  );

  const whyMatched = `Matched on ${
    [filters.issue && "practice area", filters.city && "city", filters.language && "language", filters.mode && "consultation mode", filters.q && "your search"]
      .filter(Boolean)
      .join(", ") || "verified status"
  } — ordered by availability and experience, never by payment or rating.`;

  const total = advocates.length;
  const start = filters.page * filters.pageSize;
  const items: DirectoryItemDto[] = advocates.slice(start, start + filters.pageSize).map((a) => ({ ...a, whyMatched }));

  return { items, page: filters.page, pageSize: filters.pageSize, total, hasMore: start + items.length < total };
}

export async function getAdvocateById(id: string): Promise<AdvocateDto> {
  const row = await repo.findVerifiedAdvocateById(id);
  if (!row) throw new HttpError(404, "Advocate not found or not listed");
  return flattenAdvocate(row);
}

export async function getSlots(advocateId: string): Promise<AvailabilityDayDto[]> {
  const advocate = await repo.findScheduleForVerifiedAdvocate(advocateId);
  if (!advocate) throw new HttpError(404, "Advocate not found or not listed");
  const bookedStarts = await repo.listBookedSlotStarts(advocate.id, BOOKED_STATES);
  const taken = new Set(bookedStarts);
  return buildAvailability(normalizeSchedule(advocate.weekly_schedule), taken) as AvailabilityDayDto[];
}

export async function notifyWhenAvailable(userId: string, input: NotifyWhenAvailableInput): Promise<void> {
  await repo.insertNotifyRequest({ userId, accountId: input.accountId, practiceAreaId: input.practiceAreaId });
}

// --- Onboarding ---

export async function applyAsAdvocate(user: { id: string; role: string; email?: string | null }, input: ApplyAdvocateInput): Promise<AdvocateDto> {
  if (user.role === "admin" || user.role === "founder") throw new HttpError(403, "Staff accounts cannot register as advocates.");
  const existing = await repo.findSelfAdvocate(user.id);
  if (existing) throw new HttpError(409, "You have already applied. Check your verification status.");

  const advocate = await repo.insertAdvocate({
    userId: user.id,
    barCouncil: input.barCouncil,
    enrolmentNumber: input.enrolmentNumber,
    enrolmentYear: input.enrolmentYear,
    subSpecialisations: input.subSpecialisations,
    yearsOfPractice: input.yearsOfPractice,
    education: input.education,
    relevantExperience: input.relevantExperience,
    instantFee: input.instantFee,
    scheduledFee: input.scheduledFee,
    acceptsUrgent: input.acceptsUrgent,
    chamberAddress: input.chamberAddress,
    city: input.city,
    keywords: input.keywords,
  });

  await syncRelations(advocate.id, input);
  await repo.insertVerificationCase(advocate.id, input.barCouncil, input.enrolmentNumber, user.email);
  await repo.markUserAsAdvocate(user.id);

  return flattenAdvocate(advocate);
}

async function syncRelations(
  advocateId: string,
  input: { practiceAreaIds?: string[]; languages?: string[]; consultationModes?: string[]; jurisdictions?: Array<{ state: string; forum: string }> },
): Promise<void> {
  if (input.practiceAreaIds) await repo.replaceJunctionRows("advocate_practice_areas", advocateId, input.practiceAreaIds.map((id) => ({ advocate_id: advocateId, practice_area_id: id })));
  if (input.languages) await repo.replaceJunctionRows("advocate_languages", advocateId, input.languages.map((language) => ({ advocate_id: advocateId, language })));
  if (input.consultationModes) await repo.replaceJunctionRows("advocate_consultation_modes", advocateId, input.consultationModes.map((mode) => ({ advocate_id: advocateId, mode })));
  if (input.jurisdictions) await repo.replaceJunctionRows("advocate_jurisdictions", advocateId, input.jurisdictions.map((j) => ({ advocate_id: advocateId, state: j.state, forum: j.forum })));
}

// --- Self-service ---

export interface SelfAdvocate {
  id: string;
  user_id: string;
  verification_status: string;
  practice_area_ids: string[];
  [key: string]: unknown;
}

export async function loadSelfAdvocate(userId: string): Promise<SelfAdvocate | null> {
  const row = await repo.findSelfAdvocate(userId);
  if (!row) return null;
  return { ...row, practice_area_ids: (row.advocate_practice_areas ?? []).map((r) => r.practice_area_id) } as SelfAdvocate;
}

// Ported from admin.js's resubmitRouter.
export async function resubmit(advocate: SelfAdvocate): Promise<void> {
  if (advocate.verification_status !== "documents_requested") throw new HttpError(409, "Nothing to resubmit.");
  await repo.insertResubmissionCase(advocate.id);
  await repo.updateAdvocate(advocate.id, { verification_status: "submitted" });
}

export async function updateAvailability(advocate: SelfAdvocate, input: AvailabilityPatchInput): Promise<AdvocateDto> {
  const patch: Record<string, unknown> = {};
  if (input.availabilityState) {
    if (input.availabilityState !== "offline" && advocate.verification_status !== "verified") {
      throw new HttpError(403, "You can go live once your Bar Council enrolment is verified.");
    }
    patch.availability_state = input.availabilityState;
  }
  if (input.acceptsUrgent !== undefined) patch.accepts_urgent = input.acceptsUrgent;
  const updated = await repo.updateAdvocate(advocate.id, patch);
  return flattenAdvocate(updated);
}

async function loadOfferedIntake(advocate: SelfAdvocate, intakeId: string, columns = "*"): Promise<Record<string, unknown>> {
  const ids = await repo.offeredIntakeIds(advocate.id);
  if (!ids.includes(intakeId)) throw new HttpError(404, "Request not found.");
  const intake = await repo.findIntakeRaw(intakeId, columns);
  if (!intake) throw new HttpError(404, "Request not found.");
  return intake;
}

export async function listMyRequests(advocate: SelfAdvocate): Promise<AdvocateRequestListItemDto[]> {
  const ids = await repo.offeredIntakeIds(advocate.id);
  if (ids.length === 0) return [];
  const rows = await repo.listOfferedOpenIntakes(ids, OPEN_REQUEST_STATES);
  const byIntake = await repo.listConflictStatusesForAdvocate(advocate.id, ids);
  return rows.map((r) => ({ ...r, conflict_status: byIntake.get(r.id as string) || "pending" })) as AdvocateRequestListItemDto[];
}

export async function getRequestDetail(advocate: SelfAdvocate, intakeId: string): Promise<Record<string, unknown>> {
  const intake = await loadOfferedIntake(advocate, intakeId);
  const check = await repo.findConflictCheck(intakeId, advocate.id);
  const released = check?.status === "clear" && Boolean(intake.consent_given_at);
  const { description, counterparty_name, created_by, voice_transcript_id, ...safe } = intake;
  return { ...safe, conflict_status: check?.status || "pending", description: released ? description : null, factsReleased: released };
}

export async function runConflictCheck(advocate: SelfAdvocate, intakeId: string): Promise<ConflictCheckDto> {
  const intake = await loadOfferedIntake(advocate, intakeId);
  let status = "clear";
  const counterpartyName = intake.counterparty_name as string | null;
  if (counterpartyName) {
    const matters = await repo.listOpenMattersForConflictCheck(advocate.id);
    const needle = counterpartyName.trim().toLowerCase();
    const matchedClient = matters
      .map((m) => m.account?.display_name)
      .find((n) => n && (n.toLowerCase().includes(needle) || needle.includes(n.toLowerCase().replace(/\s*\(.*\)$/, ""))));
    if (matchedClient) status = "conflict";
  }

  const check = await repo.upsertConflictCheck(intakeId, advocate.id, status);
  if (status === "clear" && intake.status === "searching") await repo.updateIntakeStatus(intakeId, "advocate_reviewing");
  return { ...check, intake_id: intakeId, advocate_id: advocate.id, counterpartyChecked: Boolean(counterpartyName) };
}

export async function acceptRequest(
  advocate: SelfAdvocate,
  userId: string,
  intakeId: string,
): Promise<{ intake: Record<string, unknown>; matter: Record<string, unknown>; consultation: Record<string, unknown> | null }> {
  if (advocate.verification_status !== "verified") throw new HttpError(403, "Your listing is not verified yet.");
  const intake = await loadOfferedIntake(advocate, intakeId);
  if (!OPEN_REQUEST_STATES.includes(intake.status as (typeof OPEN_REQUEST_STATES)[number])) throw new HttpError(409, "This request is no longer open.");

  const clear = await repo.findConflictCheckClear(intakeId, advocate.id);
  if (!clear) throw new HttpError(409, "Conflict check must be clear before accepting");

  const practiceAreaId = intake.routed_practice_area_id as string | null;
  const areaName = practiceAreaId ? await repo.findPracticeAreaName(practiceAreaId) : null;
  const city = (intake.city as string | null) || "IN";
  const reference = `SM-${city.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) || "IN"}-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;

  const matter = await repo.rpcAcceptIntakeAndOpenMatter({
    p_intake_id: intakeId,
    p_account_id: intake.account_id as string,
    p_advocate_id: advocate.id,
    p_title: areaName ? `${areaName} matter` : "New engagement",
    p_practice_area_id: practiceAreaId,
    p_forum: intake.forum as string | null,
    p_reference: reference,
  });

  await openMatterThread(matter, { advocateUserId: userId, accountId: intake.account_id, requesterId: intake.created_by });

  let consultation: Record<string, unknown> | null = null;
  if (["instant", "urgent"].includes(intake.kind as string)) {
    const fee = computeFees(Number(advocate.instant_fee ?? advocate.scheduled_fee ?? 0));
    consultation = await repo.insertConsultationForAcceptedIntake({
      intakeId,
      advocateId: advocate.id,
      accountId: intake.account_id as string,
      mode: intake.mode as string,
      fee,
    });
  }

  await repo.insertTimelineEvent({
    matterId: matter.id,
    type: "matter_opened",
    title: "Advocate accepted your request",
    body: "Conflict check cleared. Your advocate will confirm the engagement scope next.",
    actorType: "advocate",
    actorId: advocate.id,
  });

  const updatedIntake = await repo.findIntakeRaw(intakeId);
  return { intake: updatedIntake as Record<string, unknown>, matter, consultation };
}

export async function declineRequest(advocate: SelfAdvocate, actorUserId: string, intakeId: string): Promise<void> {
  const intake = await loadOfferedIntake(advocate, intakeId, "id");
  await repo.deleteOfferRows(intake.id as string, advocate.id);
  // Internal-only counter for the founder dashboard (never shown to clients or ranked).
  await logAudit({ actorId: actorUserId, actorRole: "advocate", action: "request_declined", subjectType: "IntakeRequest", subjectId: intake.id as string });
}

export async function getMyProfile(userId: string): Promise<AdvocateDto> {
  const row = await repo.findAdvocateProfileByUserId(userId);
  if (!row) throw new HttpError(404, "No advocate profile for this user");
  return flattenAdvocate(row);
}

const PATCH_FIELD_MAP: Record<string, string> = {
  subSpecialisations: "sub_specialisations",
  yearsOfPractice: "years_of_practice",
  education: "education",
  relevantExperience: "relevant_experience",
  instantFee: "instant_fee",
  scheduledFee: "scheduled_fee",
  acceptsUrgent: "accepts_urgent",
  chamberAddress: "chamber_address",
  city: "city",
  keywords: "keywords",
};

export async function updateMyProfile(userId: string, input: AdvocateProfilePatchInput): Promise<AdvocateDto> {
  const advocate = await repo.findSelfAdvocate(userId);
  if (!advocate) throw new HttpError(404, "No advocate profile for this user");

  const patch: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(PATCH_FIELD_MAP)) {
    const value = (input as Record<string, unknown>)[key];
    if (value !== undefined) patch[column] = value;
  }
  if (input.weeklySchedule) patch.weekly_schedule = normalizeSchedule(input.weeklySchedule);

  if (Object.keys(patch).length) await repo.updateAdvocate(advocate.id, patch);
  await syncRelations(advocate.id, input);

  const refreshed = await repo.findAdvocateJoinedById(advocate.id);
  return flattenAdvocate(refreshed);
}
