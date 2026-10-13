"use server";

import { revalidatePath } from "next/cache";
import { apiClient, ApiError } from "./apiClient";
import type { CreateScanInput, PackRulesetDto, PutRulesetInput, PackScanDto } from "@vidhira/contracts";

export type PackScanResult = { ok: true; scan: PackScanDto } | { ok: false; error: string };

export async function createPackScanAction(input: CreateScanInput): Promise<PackScanResult> {
  try {
    const scan = await apiClient.post<PackScanDto>("/pack/scans", input);
    return { ok: true, scan };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function approvePackScanAction(id: string): Promise<PackScanResult> {
  try {
    const scan = await apiClient.post<PackScanDto>(`/pack/scans/${id}/approve`);
    return { ok: true, scan };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}

// --- Admin: ruleset authoring (routes/pack.js's PUT /admin/pack-rulesets) ---

export type PublishRulesetResult = { ok: true; ruleset: PackRulesetDto } | { ok: false; error: string };

export async function publishPackRulesetAction(input: PutRulesetInput): Promise<PublishRulesetResult> {
  try {
    const ruleset = await apiClient.put<PackRulesetDto>("/admin/pack-rulesets", input);
    revalidatePath("/admin/catalogue");
    revalidatePath("/pack-compliance");
    return { ok: true, ruleset };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}
