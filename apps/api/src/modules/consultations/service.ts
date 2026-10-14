/**
 * Business logic for the consultations domain. Ported from routes/consultations.js -- same
 * behaviour, including the exact validation order, error messages and timing windows, split
 * out from HTTP concerns.
 */
import crypto from "crypto";
import { HttpError, advocateForUser, assertAccountMember, memberAccountIds, type Advocate } from "../../services/access.js";
import { computeFees } from "../../services/matching.js";
import { isOfferedSlot, normalizeSchedule } from "../../services/slots.js";
import { openMatterThread } from "../../services/messaging.js";
import type {
  BookConsultationInput,
  ConsultationDto,
  ConsultationFeedbackInput,
  ConsultationListItemDto,
  ConvertToMatterResultDto,
  PatchConsultationInput,
} from "@vidhira/contracts";
import * as repo from "./repository.js";

type Side = "client" | "advocate";

interface ConsultationContext {
  consultation: repo.ConsultationRow;
  side: Side;
  advocate: Advocate | null;
}

async function loadConsultationForUser(user: { id: string }, id: string): Promise<ConsultationContext> {
  const consultation = await repo.findConsultationById(id);
  if (!consultation) throw new HttpError(404, "Not found");

  const advocate = await advocateForUser(user.id);
  if (advocate && advocate.id === consultation.advocate_id) return { consultation, side: "advocate", advocate };
  const accountIds = await memberAccountIds(user.id);
  if (accountIds.includes(consultation.account_id)) return { consultation, side: "client", advocate };
  throw new HttpError(404, "Not found");
}

export async function bookConsultation(user: { id: string }, input: BookConsultationInput): Promise<ConsultationDto> {
  const intake = await repo.findIntakeForBooking(input.intakeId);
  if (!intake) throw new HttpError(404, "Intake request not found.");
  await assertAccountMember(user.id, intake.account_id);
  if (!intake.consent_given_at) throw new HttpError(409, "Please consent to sharing your issue with the advocate before booking.");

  const advocate = await repo.findVerifiedAdvocateForBooking(input.advocateId);
  if (!advocate) throw new HttpError(404, "Advocate not found or not listed");
  if (!advocate.advocate_consultation_modes.some((m) => m.mode === input.mode)) throw new HttpError(400, "This advocate does not offer that consultation mode.");

  if (!isOfferedSlot(normalizeSchedule(advocate.weekly_schedule), input.scheduledStart)) {
    throw new HttpError(409, "That time is not an available slot for this advocate.");
  }

  const professionalFee = advocate.scheduled_fee ?? advocate.instant_fee ?? 0;
  const fees = computeFees(Number(professionalFee));

  const { row, conflict } = await repo.insertConsultation({
    intakeId: intake.id,
    advocateId: advocate.id,
    accountId: intake.account_id,
    mode: input.mode,
    scheduledStart: input.scheduledStart,
    fees,
  });
  if (conflict) throw new HttpError(409, "Someone just booked that slot. Please pick another time.");

  await repo.markIntakeMatched(intake.id);
  return row as unknown as ConsultationDto;
}

export async function listMyConsultations(userId: string): Promise<ConsultationListItemDto[]> {
  const advocate = await advocateForUser(userId);
  const accountIds = await memberAccountIds(userId);

  const [accountRows, advocateRows] = await Promise.all([
    accountIds.length ? repo.listConsultationsForAccounts(accountIds) : Promise.resolve([]),
    advocate ? repo.listConsultationsForAdvocate(advocate.id) : Promise.resolve([]),
  ]);
  const rows = new Map<string, Record<string, unknown>>();
  for (const c of [...accountRows, ...advocateRows]) rows.set(c.id as string, c);
  return [...rows.values()].sort(
    (a, b) =>
      new Date((b.scheduled_start as string | null) || (b.created_at as string)).getTime() -
      new Date((a.scheduled_start as string | null) || (a.created_at as string)).getTime(),
  ) as unknown as ConsultationListItemDto[];
}

const CLIENT_STATES = ["cancelled", "rescheduled"];
const ADVOCATE_STATES = ["completed", "notes_published", "cancelled"];

export async function patchConsultation(user: { id: string }, id: string, input: PatchConsultationInput): Promise<ConsultationDto> {
  const { consultation, side } = await loadConsultationForUser(user, id);
  const patch: Record<string, unknown> = {};

  if (input.state !== undefined) {
    const allowed = side === "client" ? CLIENT_STATES : ADVOCATE_STATES;
    if (!allowed.includes(input.state)) throw new HttpError(403, `You cannot set a consultation to "${input.state}".`);
    if (CLIENT_STATES.includes(input.state) && consultation.scheduled_start) {
      const fourHoursBeforeStart = new Date(new Date(consultation.scheduled_start).getTime() - 4 * 60 * 60 * 1000);
      if (new Date() > fourHoursBeforeStart) throw new HttpError(409, "Cannot reschedule/cancel within 4 hours of the start time");
    }
    patch.state = input.state;
  }
  if (side === "advocate" && input.notes !== undefined) patch.notes = input.notes.slice(0, 20000);
  if (input.recordingEnabled !== undefined) patch.recording_enabled = input.recordingEnabled;
  if (input.scheduledStart !== undefined) {
    if (side !== "client") throw new HttpError(403, "Only the client can reschedule.");
    const adv = await repo.findAdvocateSchedule(consultation.advocate_id);
    if (!isOfferedSlot(normalizeSchedule(adv.weekly_schedule), input.scheduledStart)) throw new HttpError(409, "That time is not an available slot.");
    patch.scheduled_start = new Date(input.scheduledStart).toISOString();
    patch.state = "scheduled";
  }
  if (Object.keys(patch).length === 0) throw new HttpError(400, "Nothing to update.");

  const { row, conflict } = await repo.updateConsultation(consultation.id, patch);
  if (conflict) throw new HttpError(409, "That slot was just taken.");
  return row as unknown as ConsultationDto;
}

export async function submitFeedback(user: { id: string }, id: string, input: ConsultationFeedbackInput): Promise<{ id: string; csat_rating: number }> {
  const { consultation, side } = await loadConsultationForUser(user, id);
  if (side !== "client") throw new HttpError(403, "Only the client can rate a consultation.");
  if (!["completed", "notes_published"].includes(consultation.state)) throw new HttpError(409, "You can rate a consultation once it is completed.");
  return repo.updateFeedback(consultation.id, input.rating, input.comment ?? null);
}

// Video/phone rooms are hosted on Jitsi Meet (free, no account). The room name is an
// unguessable per-consultation token that only the two participants receive.
const JOIN_EARLY_MS = 15 * 60 * 1000;
const JOIN_LATE_MS = 3 * 60 * 60 * 1000;

export async function openRoom(user: { id: string }, id: string): Promise<{ roomToken: string; roomUrl: string; consultation: ConsultationDto }> {
  const { consultation } = await loadConsultationForUser(user, id);
  if (!["scheduled", "reminder_sent", "in_progress"].includes(consultation.state)) {
    throw new HttpError(409, `This consultation is ${consultation.state.replace("_", " ")}.`);
  }
  if (consultation.mode === "in_person") throw new HttpError(400, "This is an in-person consultation.");
  if (consultation.mode === "chat") throw new HttpError(400, "This is a chat consultation — use Messages.");

  const start = new Date(consultation.scheduled_start as string).getTime();
  const now = Date.now();
  if (now < start - JOIN_EARLY_MS) throw new HttpError(409, "The room opens 15 minutes before the scheduled time.");
  if (now > start + JOIN_LATE_MS) throw new HttpError(409, "This consultation window has ended.");

  const roomToken = consultation.room_token || crypto.randomBytes(16).toString("hex");
  const { row: updated } = await repo.updateConsultation(consultation.id, { room_token: roomToken, state: "in_progress" });
  const roomUrl = `${process.env.VIDEO_BASE_URL || "https://meet.jit.si"}/Vidhira-${roomToken}`;
  return {
    roomToken,
    roomUrl: consultation.mode === "phone" ? `${roomUrl}#config.startWithVideoMuted=true` : roomUrl,
    consultation: updated as unknown as ConsultationDto,
  };
}

export async function convertToMatter(user: { id: string }, id: string, title?: string): Promise<ConvertToMatterResultDto> {
  const { consultation, side } = await loadConsultationForUser(user, id);
  if (side !== "advocate") throw new HttpError(403, "Only the advocate can open a matter.");
  if (consultation.converted_matter_id) throw new HttpError(409, "Already converted to a matter.");

  const intake = await repo.findIntakeForConversion(consultation.intake_id);
  const reference = `SM-CON-${new Date().getFullYear()}-${crypto.randomInt(10000, 99999)}`;

  const matter = await repo.insertMatterFromConsultation({
    reference,
    accountId: consultation.account_id,
    advocateId: consultation.advocate_id,
    title: title?.trim() || `${intake.practice_area?.name || "Legal"} matter`,
    practiceAreaId: intake.routed_practice_area_id,
    forum: intake.forum,
  });

  await openMatterThread(matter, { advocateUserId: user.id, accountId: consultation.account_id, requesterId: intake.created_by });
  await repo.insertMatterOpenedTimelineEvent(matter.id as string, consultation.advocate_id);

  const updatedConsultation = await repo.markConsultationConverted(consultation.id, matter.id as string);
  return { matter: matter as { id: string; [key: string]: unknown }, consultation: updatedConsultation as unknown as ConsultationDto };
}
