/**
 * Business logic for the messages domain. Ported from routes/messages.js -- same behaviour,
 * including the exact validation order, error messages and the 404-not-403 IDOR defence, split
 * out from HTTP concerns.
 */
import { HttpError } from "../../services/access.js";
import type { MessageDto, SendMessageInput, ThreadListItemDto } from "@vidhira/contracts";
import * as repo from "./repository.js";

async function assertParticipant(userId: string, threadId: string): Promise<void> {
  const row = await repo.findParticipantRow(threadId, userId);
  if (!row) throw new HttpError(404, "Conversation not found.");
}

export async function listMyThreads(userId: string): Promise<ThreadListItemDto[]> {
  const threadIds = await repo.listParticipantThreadIds(userId);
  if (threadIds.length === 0) return [];

  const [threads, people, messages] = await Promise.all([
    repo.listThreadsByIds(threadIds),
    repo.listParticipantsForThreads(threadIds),
    repo.listRecentMessagesForThreads(threadIds),
  ]);

  const otherIds = [...new Set(people.map((p) => p.participant_id).filter((id) => id !== userId))];
  const users = await repo.findUsersByIds(otherIds);
  const userById = new Map(users.map((u) => [u.id, u]));

  const result: ThreadListItemDto[] = threads.map((t) => {
    const msgs = messages.filter((m) => m.thread_id === t.id);
    const counterparts = people
      .filter((p) => p.thread_id === t.id && p.participant_id !== userId)
      .map((p) => userById.get(p.participant_id))
      .filter((u): u is NonNullable<typeof u> => Boolean(u));
    const first = msgs[0];
    return {
      id: t.id,
      matter: t.matter,
      counterparts,
      lastMessage: first ? { body: first.body, sentAt: first.sent_at, mine: first.sender_id === userId } : null,
      unread: msgs.filter((m) => m.sender_id !== userId && !m.read_at).length,
    };
  });
  result.sort((a, b) => new Date(b.lastMessage?.sentAt || 0).getTime() - new Date(a.lastMessage?.sentAt || 0).getTime());
  return result;
}

export async function getThreadMessages(userId: string, threadId: string): Promise<MessageDto[]> {
  await assertParticipant(userId, threadId);
  const messages = await repo.listMessagesForThread(threadId);
  // Opening the conversation marks the other side's messages as read.
  await repo.markOthersReadInThread(threadId, userId);
  return messages.map((m) => ({ ...m, mine: m.sender_id === userId }));
}

export async function sendMessage(userId: string, threadId: string, input: SendMessageInput): Promise<MessageDto> {
  await assertParticipant(userId, threadId);
  const message = await repo.insertMessage(threadId, userId, input.body);
  await repo.touchThread(threadId);
  return { ...message, mine: true };
}
