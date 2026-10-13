"use server";

import { apiClient, ApiError } from "./apiClient";
import type { AnswerQuestionInput, AskQuestionInput, CreatedAnswerDto, CreatedQuestionDto, PublicQuestionDto } from "@vidhira/contracts";

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
