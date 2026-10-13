"use server";

import { apiClient, ApiError } from "./apiClient";
import type { MyDataExportDto } from "@vidhira/contracts";

export async function exportMyDataAction(): Promise<MyDataExportDto> {
  return apiClient.post<MyDataExportDto>("/privacy/export");
}

export type DeleteAccountResult = { ok: true } | { ok: false; error: string };

export async function deleteMyAccountAction(): Promise<DeleteAccountResult> {
  try {
    await apiClient.post("/privacy/delete");
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}
