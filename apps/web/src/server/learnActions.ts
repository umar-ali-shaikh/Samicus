"use server";

import { revalidatePath } from "next/cache";
import { apiClient, ApiError } from "./apiClient";
import type {
  AnswerQuestionInput,
  AskQuestionInput,
  CreateGuideInput,
  CreatedAnswerDto,
  CreatedQuestionDto,
  GuideDetailDto,
  ModerationDecisionInput,
  ModerationQueueDto,
  PublicQuestionDto,
} from "@vidhira/contracts";

export type AskQuestionResult = { ok: true; question: CreatedQuestionDto } | { ok: false; error: string };

export async function askQuestionAction(input: AskQuestionInput): Promise<AskQuestionResult> {
  try {
    const question = await apiClient.post<CreatedQuestionDto>("/questions", input);
    return { ok: true, question };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function listQuestionsAction(area?: string): Promise<PublicQuestionDto[]> {
  return apiClient.get<PublicQuestionDto[]>("/questions", { area });
}

export type AnswerQuestionResult = { ok: true; answer: CreatedAnswerDto } | { ok: false; error: string };

export async function answerQuestionAction(questionId: string, input: AnswerQuestionInput): Promise<AnswerQuestionResult> {
  try {
    const answer = await apiClient.post<CreatedAnswerDto>(`/questions/${questionId}/answers`, input);
    return { ok: true, answer };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function markAnswerHelpfulAction(answerId: string): Promise<{ helpful_count: number }> {
  return apiClient.post<{ helpful_count: number }>(`/answers/${answerId}/helpful`);
}

// --- Admin: moderation queue + guide authoring (routes/askLearn.js's admin-only endpoints) ---

export async function getModerationQueueAction(): Promise<ModerationQueueDto> {
  return apiClient.get<ModerationQueueDto>("/admin/moderation");
}

export type DecideModerationResult = { ok: true } | { ok: false; error: string };

export async function decideModerationAction(type: "question" | "answer", id: string, input: ModerationDecisionInput): Promise<DecideModerationResult> {
  try {
    await apiClient.post(`/admin/moderation/${type}/${id}`, input);
    revalidatePath("/admin/moderation");
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}

export type CreateGuideResult = { ok: true; guide: GuideDetailDto } | { ok: false; error: string };

export async function createGuideAction(input: CreateGuideInput): Promise<CreateGuideResult> {
  try {
    const guide = await apiClient.post<GuideDetailDto>("/admin/guides", input);
    revalidatePath("/admin/catalogue");
    revalidatePath("/learn");
    return { ok: true, guide };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function deleteGuideAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await apiClient.delete(`/admin/guides/${id}`);
    revalidatePath("/admin/catalogue");
    revalidatePath("/learn");
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}
