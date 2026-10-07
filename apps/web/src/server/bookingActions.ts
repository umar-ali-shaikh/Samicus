"use server";

import { revalidatePath } from "next/cache";
import { apiClient, ApiError } from "./apiClient";
import type { AvailabilityDayDto, BookConsultationInput, ConsultationDto, CreateIntakeInput, IntakeDto } from "@vidhira/contracts";

export type CreateBookingIntakeResult = { ok: true; intakeId: string } | { ok: false; error: string };

// Mirrors frontend/src/modals/BookingModal.jsx's createIntake mutation -- a plain "scheduled"
// intake, no consent/matching yet (consent + the actual booking happen together at confirm time).
export async function createBookingIntakeAction(input: CreateIntakeInput): Promise<CreateBookingIntakeResult> {
  try {
    const intake = await apiClient.post<IntakeDto>("/intake-requests", input);
    return { ok: true, intakeId: intake.id };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}

// Fetched fresh client-side when the wizard reaches the slot-picking step, rather than at
// page-load time, so a slot taken by someone else in the meantime doesn't show as open.
export async function getAdvocateSlotsAction(advocateId: string): Promise<AvailabilityDayDto[]> {
  return apiClient.get<AvailabilityDayDto[]>(`/advocates/${advocateId}/slots`);
}

export type ConfirmBookingResult = { ok: true; consultation: ConsultationDto } | { ok: false; error: string };

export async function confirmBookingAction(intakeId: string, input: BookConsultationInput): Promise<ConfirmBookingResult> {
  try {
    await apiClient.post(`/intake-requests/${intakeId}/consent`);
    const consultation = await apiClient.post<ConsultationDto>("/consultations", input);
    revalidatePath("/consultations");
    revalidatePath(`/advocates/${input.advocateId}/slots`);
    return { ok: true, consultation };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}
