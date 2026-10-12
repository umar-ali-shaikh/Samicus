"use server";

import { apiClient, ApiError } from "./apiClient";
import type { AssistantAnswerDto, AssistantSessionDto } from "@vidhira/contracts";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function askAssistantAction(question: string, sessionId: string): Promise<ActionResult<AssistantAnswerDto>> {
  try {
    const data = await apiClient.post<AssistantAnswerDto>("/legal-assistant/ask", { question, sessionId });
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function getAssistantSessionAction(sessionId: string): Promise<AssistantSessionDto> {
  return apiClient.get<AssistantSessionDto>(`/legal-assistant/session/${sessionId}`);
}
