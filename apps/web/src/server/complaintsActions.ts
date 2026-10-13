"use server";

import { revalidatePath } from "next/cache";
import { apiClient, ApiError } from "./apiClient";
import type { ComplaintDto, ComplaintsReportDto, CreateComplaintInput, CreatedComplaintDto, UpdateComplaintInput } from "@vidhira/contracts";

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

// --- Admin: triage (routes/complaints.js's PATCH /admin/complaints/:id) + the dashboard
// report shared with the founder's fcomplaints analytics tab (routes/admin.js) ---

export async function getComplaintsReportAction(): Promise<ComplaintsReportDto> {
  return apiClient.get<ComplaintsReportDto>("/admin/complaints");
}

export type UpdateComplaintResult = { ok: true; complaint: ComplaintDto } | { ok: false; error: string };

export async function updateComplaintAction(id: string, input: UpdateComplaintInput): Promise<UpdateComplaintResult> {
  try {
    const complaint = await apiClient.patch<ComplaintDto>(`/admin/complaints/${id}`, input);
    revalidatePath("/admin/complaints");
    revalidatePath("/founder/fcomplaints");
    return { ok: true, complaint };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}
