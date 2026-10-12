"use server";

import { revalidatePath } from "next/cache";
import { apiClient, ApiError } from "./apiClient";
import type {
  AdvocateDraftReviewDetailDto,
  CreateDraftInput,
  DocumentDraftDto,
  DraftPreviewResultDto,
  DraftReviewDto,
  PatchDraftInput,
  ReturnDraftReviewInput,
} from "@vidhira/contracts";

export type DraftActionResult = { ok: true; draft: DocumentDraftDto } | { ok: false; error: string };

export async function createDraftAction(input: CreateDraftInput): Promise<DraftActionResult> {
  try {
    const draft = await apiClient.post<DocumentDraftDto>("/drafts", input);
    revalidatePath("/drafts");
    return { ok: true, draft };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function patchDraftAction(draftId: string, input: PatchDraftInput): Promise<DraftActionResult> {
  try {
    const draft = await apiClient.patch<DocumentDraftDto>(`/drafts/${draftId}`, input);
    return { ok: true, draft };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}

export type PreviewActionResult = { ok: true; preview: DraftPreviewResultDto } | { ok: false; error: string };

export async function previewDraftAction(draftId: string): Promise<PreviewActionResult> {
  try {
    const preview = await apiClient.post<DraftPreviewResultDto>(`/drafts/${draftId}/preview`);
    return { ok: true, preview };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}

export type RequestReviewResult = { ok: true; review: DraftReviewDto } | { ok: false; error: string };

export async function requestDraftReviewAction(draftId: string, advocateId: string): Promise<RequestReviewResult> {
  try {
    const review = await apiClient.post<DraftReviewDto>(`/drafts/${draftId}/reviews`, { advocateId });
    revalidatePath(`/drafts/${draftId}`);
    return { ok: true, review };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}

export type ReturnDraftReviewResult = { ok: true; review: DraftReviewDto } | { ok: false; error: string };

export async function returnDraftReviewAction(reviewId: string, input: ReturnDraftReviewInput): Promise<ReturnDraftReviewResult> {
  try {
    const review = await apiClient.post<DraftReviewDto>(`/advocate/draft-reviews/${reviewId}/return`, input);
    revalidatePath("/lawyer/draft-reviews");
    revalidatePath(`/lawyer/draft-reviews/${reviewId}`);
    return { ok: true, review };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function getAdvocateDraftReviewDetailAction(reviewId: string): Promise<AdvocateDraftReviewDetailDto> {
  return apiClient.get<AdvocateDraftReviewDetailDto>(`/advocate/draft-reviews/${reviewId}`);
}
