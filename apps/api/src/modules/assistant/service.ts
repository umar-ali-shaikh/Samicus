/**
 * Business logic for the AI Legal Assistant's conversation memory and request orchestration.
 * Ported from routes/legalAssistant.js -- same behaviour, including the exact history budget
 * (last 3 turns, ~1500 tokens) and the same-user ownership check on a client-generated
 * sessionId. The actual RAG pipeline (6-stage retrieve-then-generate) stays in
 * services/legalAssistant.js and its own test suite; this layer only threads history through
 * it and persists turns, same precedent as modules/caselaw/service.ts wrapping
 * services/indianKanoon.js.
 */
import { HttpError } from "../../services/access.js";
import {
  answerLegalQuestion,
  IndianKanoonAuthError,
  IndianKanoonApiError,
  OpenRouterAuthError,
  OpenRouterApiError,
} from "../../services/legalAssistant.js";
import type { AskAssistantInput, AssistantAnswerDto } from "@vidhira/contracts";
import * as repo from "./repository.js";

// Last 1-3 turns, condensed to {question, summary} rather than the full prior answer, and
// capped at ~1500 tokens total (a rough 4-chars-per-token heuristic). Walks newest -> oldest so
// a tight budget drops the OLDEST turns first, keeping as much of the most recent context as
// fits; the result is reversed back to chronological order for the prompt.
const MAX_HISTORY_TURNS = 3;
const MAX_HISTORY_CHARS = 6000; // ~1500 tokens
const MAX_HISTORY_QUESTION_CHARS = 400;
const MAX_HISTORY_SUMMARY_CHARS = 600;

interface HistoryEntry {
  question: string;
  summary: string;
}

async function loadHistory(userId: string, sessionId: string | undefined): Promise<HistoryEntry[]> {
  if (!sessionId) return [];
  let session;
  try {
    session = await repo.findSessionBySessionId(sessionId);
  } catch {
    return [];
  }
  if (!session) return [];
  // Never load another user's conversation -- a sessionId is client-generated and
  // unguessable in practice, but this is the same ownership check persistTurn/the GET route
  // already apply; a mismatch here just means "no history", not an error.
  if (session.user_id && session.user_id !== userId) {
    console.warn(`legal-assistant: sessionId ${sessionId} belongs to another user — loading no history.`);
    return [];
  }

  let turns;
  try {
    turns = await repo.listRecentTurns(session.id, MAX_HISTORY_TURNS);
  } catch {
    return [];
  }

  const kept: HistoryEntry[] = [];
  let totalChars = 0;
  for (const t of turns) {
    // turns is newest-first.
    const entry: HistoryEntry = {
      question: String(t.question || "").slice(0, MAX_HISTORY_QUESTION_CHARS),
      summary: String(t.result?.sections?.summary || "").slice(0, MAX_HISTORY_SUMMARY_CHARS),
    };
    const entryChars = entry.question.length + entry.summary.length;
    if (totalChars + entryChars > MAX_HISTORY_CHARS) break;
    kept.push(entry);
    totalChars += entryChars;
  }
  return kept.reverse(); // oldest first, for natural reading order in the prompt
}

/** Best-effort: a persistence hiccup shouldn't cost the user the answer they already paid (in IK/OpenRouter calls) to get -- callers fire this without awaiting. */
async function persistTurn(userId: string, sessionId: string, question: string, result: AssistantAnswerDto): Promise<void> {
  let session = await repo.findSessionBySessionId(sessionId);
  if (session && session.user_id && session.user_id !== userId) throw new Error("Session belongs to another user");
  if (!session) session = await repo.insertSession(sessionId, userId);
  await repo.insertTurn(session.id, question, result);
}

function mapPipelineError(err: unknown): never {
  if (err instanceof IndianKanoonAuthError) {
    throw new HttpError(502, "Legal research is unavailable: invalid or missing Indian Kanoon API token.");
  }
  if (err instanceof IndianKanoonApiError) {
    const status = err.status >= 400 && err.status < 600 ? err.status : 502;
    throw new HttpError(status, err.message);
  }
  if (err instanceof OpenRouterAuthError) {
    throw new HttpError(502, "AI answer generation is unavailable: invalid or missing OpenRouter API key.");
  }
  if (err instanceof OpenRouterApiError) {
    const status = err.status >= 400 && err.status < 600 ? err.status : 502;
    throw new HttpError(status, err.message);
  }
  throw err;
}

export async function ask(user: { id: string }, input: AskAssistantInput): Promise<AssistantAnswerDto> {
  const history = input.sessionId ? await loadHistory(user.id, input.sessionId) : [];
  let result: AssistantAnswerDto;
  try {
    result = (await answerLegalQuestion(
      input.question,
      { court: input.court, fromDate: input.fromDate, toDate: input.toDate, title: input.title, cite: input.cite, author: input.author, bench: input.bench },
      input.topN ? Number(input.topN) : undefined,
      history
    )) as AssistantAnswerDto;
  } catch (err) {
    return mapPipelineError(err);
  }

  if (input.sessionId) {
    persistTurn(user.id, input.sessionId, input.question, result).catch((err: unknown) =>
      console.error("Failed to persist legal-assistant turn:", err instanceof Error ? err.message : err)
    );
  }
  return result;
}

/** Rehydrates a conversation after a page refresh -- empty turns for a brand-new session, not a 404. */
export async function getSessionTurns(userId: string, sessionId: string): Promise<repo.HistoryTurnRow[]> {
  const session = await repo.findOwnSessionBySessionId(sessionId, userId);
  if (!session) return [];
  return repo.listTurnsChronological(session.id);
}
