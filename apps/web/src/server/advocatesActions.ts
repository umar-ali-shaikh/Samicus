"use server";

import { revalidatePath } from "next/cache";
import { apiClient, ApiError } from "./apiClient";
import type {
  AdvocateDto,
  AdvocateProfilePatchInput,
  AdvocateRequestListItemDto,
  ApplyAdvocateInput,
  AvailabilityPatchInput,
  ConflictCheckDto,
} from "@vidhira/contracts";

export interface NotifyState {
  notified: boolean;
  error?: string;
}

export async function notifyWhenAvailableAction(_prev: NotifyState, formData: FormData): Promise<NotifyState> {
  const accountId = String(formData.get("accountId") || "") || undefined;
  const practiceAreaId = String(formData.get("practiceAreaId") || "") || undefined;
  try {
    await apiClient.post("/advocates/notify-when-available", { accountId, practiceAreaId });
    return { notified: true };
  } catch (err) {
    if (err instanceof ApiError) return { notified: false, error: err.message || "Something went wrong — please try again." };
    throw err;
  }
}

export type AdvocateActionResult = { ok: true; advocate: AdvocateDto } | { ok: false; error: string };

export async function applyAdvocateAction(input: ApplyAdvocateInput): Promise<AdvocateActionResult> {
  try {
    const advocate = await apiClient.post<AdvocateDto>("/advocate/apply", input);
    revalidatePath("/profile");
    revalidatePath("/lawyer");
    return { ok: true, advocate };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function updateAdvocateProfileAction(input: AdvocateProfilePatchInput): Promise<AdvocateActionResult> {
  try {
    const advocate = await apiClient.patch<AdvocateDto>("/advocate/profile", input);
    revalidatePath("/profile");
    revalidatePath("/lawyer");
    revalidatePath(`/advocates/${advocate.id}`);
    return { ok: true, advocate };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function resubmitAdvocateAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await apiClient.post("/advocate/resubmit");
    revalidatePath("/profile");
    revalidatePath("/lawyer");
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function updateAvailabilityAction(input: AvailabilityPatchInput): Promise<AdvocateActionResult> {
  try {
    const advocate = await apiClient.patch<AdvocateDto>("/advocate/availability", input);
    revalidatePath("/lawyer");
    return { ok: true, advocate };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function listMyRequestsAction(): Promise<AdvocateRequestListItemDto[]> {
  return apiClient.get<AdvocateRequestListItemDto[]>("/advocate/requests");
}

export async function getRequestDetailAction(intakeId: string): Promise<Record<string, unknown>> {
  return apiClient.get(`/advocate/requests/${intakeId}`);
}

export async function runConflictCheckAction(intakeId: string): Promise<{ ok: true; check: ConflictCheckDto } | { ok: false; error: string }> {
  try {
    const check = await apiClient.post<ConflictCheckDto>(`/advocate/requests/${intakeId}/conflict-check`);
    revalidatePath("/lawyer");
    return { ok: true, check };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function acceptRequestAction(intakeId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await apiClient.post(`/advocate/requests/${intakeId}/accept`);
    revalidatePath("/lawyer");
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function declineRequestAction(intakeId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await apiClient.post(`/advocate/requests/${intakeId}/decline`);
    revalidatePath("/lawyer");
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}
