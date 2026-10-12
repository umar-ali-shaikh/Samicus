/**
 * DB access for the AI Legal Assistant's conversation memory. Ported from
 * routes/legalAssistant.js's inline Supabase calls (loadHistory/persistTurn/the session GET
 * route) -- same queries, same behaviour.
 */
import { getSupabase } from "../../config/db.js";
import type { AssistantAnswerDto } from "@vidhira/contracts";

export interface SessionRow {
  id: string;
  user_id: string | null;
}

export async function findSessionBySessionId(sessionId: string): Promise<SessionRow | null> {
  const { data, error } = await getSupabase().from("legal_assistant_sessions").select("id, user_id").eq("session_id", sessionId).maybeSingle();
  if (error) throw error;
  return data as SessionRow | null;
}

/** Scoped to the caller -- used by the session-rehydrate GET route, which must 404-silently (empty turns) rather than leak another user's session. */
export async function findOwnSessionBySessionId(sessionId: string, userId: string): Promise<{ id: string } | null> {
  const { data, error } = await getSupabase().from("legal_assistant_sessions").select("id").eq("session_id", sessionId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data as { id: string } | null;
}

export async function insertSession(sessionId: string, userId: string): Promise<SessionRow> {
  const { data, error } = await getSupabase().from("legal_assistant_sessions").insert({ session_id: sessionId, user_id: userId }).select("id, user_id").single();
  if (error) throw error;
  return data as SessionRow;
}

export interface HistoryTurnRow {
  question: string;
  result: AssistantAnswerDto;
  created_at: string;
}

/** Newest-first, capped at `limit` -- loadHistory() in the service reverses and budgets these. */
export async function listRecentTurns(sessionRowId: string, limit: number): Promise<HistoryTurnRow[]> {
  const { data, error } = await getSupabase()
    .from("legal_assistant_turns")
    .select("question, result, created_at")
    .eq("session_id", sessionRowId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as HistoryTurnRow[];
}

/** Chronological order -- used by the session-rehydrate GET route. */
export async function listTurnsChronological(sessionRowId: string): Promise<HistoryTurnRow[]> {
  const { data, error } = await getSupabase()
    .from("legal_assistant_turns")
    .select("question, result, created_at")
    .eq("session_id", sessionRowId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as HistoryTurnRow[];
}

export async function insertTurn(sessionRowId: string, question: string, result: AssistantAnswerDto): Promise<void> {
  const { error } = await getSupabase().from("legal_assistant_turns").insert({ session_id: sessionRowId, question, result });
  if (error) throw error;
}
