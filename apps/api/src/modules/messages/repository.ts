/**
 * DB access for the messages domain. Ported from routes/messages.js's inline Supabase calls --
 * same queries, same behaviour. No generated DB types yet; rows are cast to local interfaces
 * matching what each query actually selects.
 */
import { getSupabase } from "../../config/db.js";

export async function listParticipantThreadIds(userId: string): Promise<string[]> {
  const { data, error } = await getSupabase().from("thread_participants").select("thread_id").eq("participant_id", userId);
  if (error) throw error;
  return (data as Array<{ thread_id: string }>).map((r) => r.thread_id);
}

export interface ThreadRow {
  id: string;
  matter_id: string;
  updated_at: string;
  matter: { title: string; reference: string } | null;
}

export async function listThreadsByIds(threadIds: string[]): Promise<ThreadRow[]> {
  const { data, error } = await getSupabase().from("message_threads").select("id, matter_id, updated_at, matter:matters(title, reference)").in("id", threadIds);
  if (error) throw error;
  return data as unknown as ThreadRow[];
}

export async function listParticipantsForThreads(threadIds: string[]): Promise<Array<{ thread_id: string; participant_id: string }>> {
  const { data, error } = await getSupabase().from("thread_participants").select("thread_id, participant_id").in("thread_id", threadIds);
  if (error) throw error;
  return data as Array<{ thread_id: string; participant_id: string }>;
}

export interface ThreadMessageSummary {
  thread_id: string;
  sender_id: string;
  body: string;
  sent_at: string;
  read_at: string | null;
}

export async function listRecentMessagesForThreads(threadIds: string[]): Promise<ThreadMessageSummary[]> {
  const { data, error } = await getSupabase().from("messages").select("thread_id, sender_id, body, sent_at, read_at").in("thread_id", threadIds).order("sent_at", { ascending: false }).limit(1000);
  if (error) throw error;
  return data as ThreadMessageSummary[];
}

export async function findUsersByIds(ids: string[]): Promise<Array<{ id: string; full_name: string; avatar_url: string | null }>> {
  if (ids.length === 0) return [];
  const { data, error } = await getSupabase().from("users").select("id, full_name, avatar_url").in("id", ids);
  if (error) throw error;
  return data as Array<{ id: string; full_name: string; avatar_url: string | null }>;
}

export async function findParticipantRow(threadId: string, userId: string): Promise<{ thread_id: string } | null> {
  const { data, error } = await getSupabase().from("thread_participants").select("thread_id").eq("thread_id", threadId).eq("participant_id", userId).maybeSingle();
  if (error) throw error;
  return data as { thread_id: string } | null;
}

export interface MessageRow {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  attachments: string[];
  sent_at: string;
  read_at: string | null;
}

// Explicit field-picking (not a raw cast) -- messages has no updated_at column, but an
// UPDATE statement touching a row (e.g. markOthersReadInThread) can surface one from a
// careless `select("*")` depending on the driver; never let an unexpected column reach a
// `.strict()` response DTO.
function toMessageRow(row: Record<string, unknown>): MessageRow {
  return {
    id: row.id as string,
    thread_id: row.thread_id as string,
    sender_id: row.sender_id as string,
    body: row.body as string,
    attachments: (row.attachments as string[] | null) ?? [],
    sent_at: row.sent_at as string,
    read_at: (row.read_at as string | null) ?? null,
  };
}

export async function listMessagesForThread(threadId: string): Promise<MessageRow[]> {
  const { data, error } = await getSupabase().from("messages").select("*").eq("thread_id", threadId).order("sent_at", { ascending: true }).limit(500);
  if (error) throw error;
  return (data as Array<Record<string, unknown>>).map(toMessageRow);
}

export async function markOthersReadInThread(threadId: string, readerId: string): Promise<void> {
  const { error } = await getSupabase().from("messages").update({ read_at: new Date().toISOString() }).eq("thread_id", threadId).neq("sender_id", readerId).is("read_at", null);
  if (error) throw error;
}

export async function insertMessage(threadId: string, senderId: string, body: string): Promise<MessageRow> {
  const { data, error } = await getSupabase().from("messages").insert({ thread_id: threadId, sender_id: senderId, body }).select().single();
  if (error) throw error;
  return toMessageRow(data as Record<string, unknown>);
}

export async function touchThread(threadId: string): Promise<void> {
  const { error } = await getSupabase().from("message_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
  if (error) throw error;
}
