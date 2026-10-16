"use server";

import { apiClient, ApiError } from "./apiClient";
import type { CreateIntakeInput, IntakeDto, IntakeStatusDto, MatchesResponseDto, UrgentRequestInput, UrgentRequestResultDto } from "@vidhira/contracts";

export type StartIntakeResult = { ok: true; intakeId: string; matchCount: number } | { ok: false; error: string };

// Mirrors frontend/src/screens/TalkNow.jsx's `start` mutation: create the intake, consent to
// sharing it immediately (Talk now has no separate consent step), then compute matches --
// computing the matches is what offers the request to the best-matched advocates.
export async function startInstantIntakeAction(input: CreateIntakeInput): Promise<StartIntakeResult> {
  try {
    const intake = await apiClient.post<IntakeDto>("/intake-requests", input);
    await apiClient.post(`/intake-requests/${intake.id}/consent`);
    const { matches } = await apiClient.get<MatchesResponseDto>(`/intake-requests/${intake.id}/matches`);
    return { ok: true, intakeId: intake.id, matchCount: matches.length };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}

export type StartUrgentResult = { ok: true; status: "advocate_reviewing"; intakeId: string } | { ok: true; status: "none_available"; helpline: string } | { ok: false; error: string };

// Mirrors frontend/src/modals/UrgentModal.jsx's `start` mutation: POST /urgent-requests already
// offers the request to the first available verified advocate who accepts urgent work (relaxed
// language/mode/state filters); consent is recorded right after, as the page collects it before
// submitting. Nothing to consent to when no advocate was available.
export async function startUrgentRequestAction(input: UrgentRequestInput): Promise<StartUrgentResult> {
  try {
    const res = await apiClient.post<UrgentRequestResultDto>("/urgent-requests", input);
    if (res.status === "none_available") return { ok: true, status: "none_available", helpline: res.helpline };
    await apiClient.post(`/intake-requests/${res.intake.id}/consent`);
    return { ok: true, status: "advocate_reviewing", intakeId: res.intake.id };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function getIntakeStatusAction(intakeId: string): Promise<IntakeStatusDto> {
  return apiClient.get<IntakeStatusDto>(`/intake-requests/${intakeId}`);
}

export async function cancelIntakeAction(intakeId: string): Promise<void> {
  await apiClient.post(`/intake-requests/${intakeId}/cancel`);
}

export async function joinConsultationRoomAction(consultationId: string): Promise<{ roomToken: string; roomUrl: string }> {
  return apiClient.post(`/consultations/${consultationId}/room`);
}
