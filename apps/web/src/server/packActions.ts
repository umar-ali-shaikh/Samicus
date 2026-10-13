"use server";

import { apiClient, ApiError } from "./apiClient";
import type { CreateScanInput, PackScanDto } from "@vidhira/contracts";

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
