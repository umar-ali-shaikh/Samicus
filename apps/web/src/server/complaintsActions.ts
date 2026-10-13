"use server";

import { revalidatePath } from "next/cache";
import { apiClient, ApiError } from "./apiClient";
import type { CreateComplaintInput, CreatedComplaintDto } from "@vidhira/contracts";

export type FileComplaintResult = { ok: true; complaint: CreatedComplaintDto } | { ok: false; error: string };

export async function fileComplaintAction(input: CreateComplaintInput): Promise<FileComplaintResult> {
  try {
    const complaint = await apiClient.post<CreatedComplaintDto>("/complaints", input);
    revalidatePath("/profile");
    return { ok: true, complaint };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}
