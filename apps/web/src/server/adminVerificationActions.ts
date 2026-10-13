"use server";

import { revalidatePath } from "next/cache";
import { apiClient, ApiError } from "./apiClient";
import type { AdminStatsDto, DecideVerificationInput, UsageDto, VerificationCaseDto, VerificationCaseListItemDto } from "@vidhira/contracts";

export async function getAdminStatsAction(): Promise<AdminStatsDto> {
  return apiClient.get<AdminStatsDto>("/admin/stats");
}

export async function getUsageAction(): Promise<UsageDto> {
  return apiClient.get<UsageDto>("/admin/usage");
}

export async function listVerificationCasesAction(): Promise<VerificationCaseListItemDto[]> {
  return apiClient.get<VerificationCaseListItemDto[]>("/admin/verification-cases");
}

export type DecideVerificationResult = { ok: true; case: VerificationCaseDto } | { ok: false; error: string };

export async function decideVerificationAction(caseId: string, input: DecideVerificationInput): Promise<DecideVerificationResult> {
  try {
    const result = await apiClient.post<VerificationCaseDto>(`/admin/verification-cases/${caseId}/decide`, input);
    revalidatePath("/admin/verification");
    return { ok: true, case: result };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}
