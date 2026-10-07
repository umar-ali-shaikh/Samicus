"use server";

import { revalidatePath } from "next/cache";
import { apiClient, ApiError } from "./apiClient";
import type { ConsultationDto, ConvertToMatterResultDto } from "@vidhira/contracts";

export type ConsultationActionResult = { ok: true; consultation: ConsultationDto } | { ok: false; error: string };

async function patchConsultation(id: string, body: Record<string, unknown>): Promise<ConsultationActionResult> {
  try {
    const consultation = await apiClient.patch<ConsultationDto>(`/consultations/${id}`, body);
    revalidatePath("/consultations");
    return { ok: true, consultation };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function cancelConsultationAction(id: string): Promise<ConsultationActionResult> {
  return patchConsultation(id, { state: "cancelled" });
}

export async function markCompletedAction(id: string): Promise<ConsultationActionResult> {
  return patchConsultation(id, { state: "completed" });
}

export async function saveNotesAction(id: string, notes: string): Promise<ConsultationActionResult> {
  return patchConsultation(id, { notes });
}

export async function submitFeedbackAction(id: string, rating: number, comment?: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await apiClient.post(`/consultations/${id}/feedback`, { rating, comment });
    revalidatePath("/consultations");
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}

export type ConvertToMatterResult = { ok: true; result: ConvertToMatterResultDto } | { ok: false; error: string };

export async function convertToMatterAction(id: string, title?: string): Promise<ConvertToMatterResult> {
  try {
    const result = await apiClient.post<ConvertToMatterResultDto>(`/consultations/${id}/convert-to-matter`, { title });
    revalidatePath("/consultations");
    return { ok: true, result };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}
