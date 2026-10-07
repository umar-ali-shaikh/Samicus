"use server";

import { revalidatePath } from "next/cache";
import { apiClient, ApiError } from "./apiClient";
import type { DocumentDownloadDto, DocumentDto } from "@vidhira/contracts";

export type UploadDocumentResult = { ok: true; doc: DocumentDto } | { ok: false; error: string };

export async function uploadDocumentAction(formData: FormData): Promise<UploadDocumentResult> {
  try {
    const doc = await apiClient.upload<DocumentDto>("/documents", formData);
    revalidatePath("/documents");
    if (formData.get("matterId")) revalidatePath(`/matters/${formData.get("matterId")}`);
    return { ok: true, doc };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function downloadDocumentAction(id: string): Promise<DocumentDownloadDto> {
  return apiClient.get<DocumentDownloadDto>(`/documents/${id}/download`);
}

export type ShareDocumentResult = { ok: true; doc: DocumentDto } | { ok: false; error: string };

export async function shareDocumentAction(id: string, advocateId: string, share: boolean, matterId?: string | null): Promise<ShareDocumentResult> {
  try {
    const doc = await apiClient.post<DocumentDto>(`/documents/${id}/share`, { advocateId, share });
    revalidatePath("/documents");
    if (matterId) revalidatePath(`/matters/${matterId}`);
    return { ok: true, doc };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function deleteDocumentAction(id: string, matterId?: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await apiClient.delete(`/documents/${id}`);
    revalidatePath("/documents");
    if (matterId) revalidatePath(`/matters/${matterId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}
