"use server";

import { revalidatePath } from "next/cache";
import { apiClient, ApiError } from "./apiClient";
import type { MessageDto, ThreadListItemDto } from "@vidhira/contracts";

export async function getThreadMessagesAction(threadId: string): Promise<MessageDto[]> {
  return apiClient.get<MessageDto[]>(`/threads/${threadId}/messages`);
}

export async function getThreadsAction(): Promise<ThreadListItemDto[]> {
  return apiClient.get<ThreadListItemDto[]>("/threads");
}

export type SendMessageResult = { ok: true; message: MessageDto } | { ok: false; error: string };

export async function sendMessageAction(threadId: string, body: string): Promise<SendMessageResult> {
  try {
    const message = await apiClient.post<MessageDto>(`/threads/${threadId}/messages`, { body });
    revalidatePath(`/messages/${threadId}`);
    return { ok: true, message };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}
