import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  answerLegalQuestion,
  OpenRouterAuthError,
  OpenRouterApiError,
  IndianKanoonAuthError,
  IndianKanoonApiError,
} from "../services/legalAssistant.js";
import { getSupabase } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Client generates this with crypto.randomUUID() — validate the shape before it ever
// reaches a query (req.body values are attacker-controlled JSON, so without this a
// non-string sessionId, e.g. an object, could otherwise be used to build one).
const SESSION_ID_RE = /^[a-zA-Z0-9-]{1,64}$/;
function isValidSessionId(id) {
  return typeof id === "string" && SESSION_ID_RE.test(id);
}

// Same cap as /messages and the same z.string().trim().max() convention used by
// askLearn.js/complaints.js/intake.js — this route was the one place a free-text field
// reached the LLM pipeline with no length limit at all.
const QuestionSchema = z.string().trim().min(1, "'question' is required.").max(5000, "'question' is too long (5,000 characters max).");

// This route is unauthenticated (see note below) and every hit spends real IK +
// OpenRouter money — a per-IP cap is the stopgap until a real auth boundary exists.
// 20/15min mirrors OpenRouter's own free-tier per-minute cap order of magnitude while
// staying usable for a real back-and-forth conversation.
const askLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  // Per signed-in user (the route is behind requireAuth), not per shared IP.
  keyGenerator: (req) => req.user?.id || req.ip,
  validate: { keyGeneratorIpFallback: false },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many questions from this address — please wait a few minutes and try again." },
});

// Mirrors routes/indianKanoon.js's error taxonomy: retrieval failures ("bad token" /
// "try again") vs generation failures ("bad/missing OpenRouter key") are surfaced
// distinctly rather than as a generic 500, since callers need to know which half broke.
function handleError(err, res) {
  if (err instanceof IndianKanoonAuthError) {
    console.error("Indian Kanoon auth error:", err.message);
    return res.status(502).json({ error: "Legal research is unavailable: invalid or missing Indian Kanoon API token." });
  }
  if (err instanceof IndianKanoonApiError) {
    console.error("Indian Kanoon API error:", err.status, err.message);
    const status = err.status >= 400 && err.status < 600 ? err.status : 502;
    return res.status(status).json({ error: err.message });
  }
  if (err instanceof OpenRouterAuthError) {
    console.error("OpenRouter auth error:", err.message);
    return res.status(502).json({ error: "AI answer generation is unavailable: invalid or missing OpenRouter API key." });
  }
  if (err instanceof OpenRouterApiError) {
    console.error("OpenRouter API error:", err.status, err.message);
    const status = err.status >= 400 && err.status < 600 ? err.status : 502;
    return res.status(status).json({ error: err.message });
  }
  console.error("Unexpected legal assistant error:", err);
  return res.status(500).json({ error: "The legal assistant failed unexpectedly." });
}

// Last 1-3 turns, condensed to {question, summary} rather than the full prior answer, and
// capped at ~1500 tokens total (a rough 4-chars-per-token heuristic — exact tokenization
// isn't worth pulling in a tokenizer dependency for a soft budget like this). Walks newest
// -> oldest so a tight budget drops the OLDEST turns first, keeping as much of the most
// recent context as fits; the result is reversed back to chronological order for the prompt.
const MAX_HISTORY_TURNS = 3;
const MAX_HISTORY_CHARS = 6000; // ~1500 tokens
const MAX_HISTORY_QUESTION_CHARS = 400;
const MAX_HISTORY_SUMMARY_CHARS = 600;

async function loadHistory(userId, sessionId) {
  if (!sessionId) return [];
  const supabase = getSupabase();
  const { data: session, error } = await supabase.from("legal_assistant_sessions").select("id, user_id").eq("session_id", sessionId).maybeSingle();
  if (error || !session) return [];
  // Never load another user's conversation — a sessionId is client-generated and
  // unguessable in practice, but this is the same ownership check persistTurn/the GET
  // route already apply, so a mismatch here just means "no history", not an error.
  if (session.user_id && session.user_id !== userId) {
    console.warn(`legal-assistant: sessionId ${sessionId} belongs to another user — loading no history.`);
    return [];
  }

  const { data: turns, error: turnsError } = await supabase
    .from("legal_assistant_turns")
    .select("question, result, created_at")
    .eq("session_id", session.id)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY_TURNS);
  if (turnsError || !turns) return [];

  const kept = [];
  let totalChars = 0;
  for (const t of turns) {
    // turns is newest-first (see .order above)
    const entry = {
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

// Best-effort: a persistence hiccup shouldn't cost the user the answer they already
// paid (in IK/OpenRouter calls) to get, so this is fire-and-forget from the caller.
async function persistTurn(userId, sessionId, question, result) {
  const supabase = getSupabase();
  let { data: session, error } = await supabase.from("legal_assistant_sessions").select("id, user_id").eq("session_id", sessionId).maybeSingle();
  if (error) throw error;
  if (session && session.user_id && session.user_id !== userId) throw new Error("Session belongs to another user");
  if (!session) {
    ({ data: session, error } = await supabase.from("legal_assistant_sessions").insert({ session_id: sessionId, user_id: userId }).select("id").single());
    if (error) throw error;
  }
  const { error: turnError } = await supabase.from("legal_assistant_turns").insert({ session_id: session.id, question, result });
  if (turnError) throw turnError;
}

router.post("/legal-assistant/ask", requireAuth, askLimiter, async (req, res) => {
  const { question, court, fromDate, toDate, title, cite, author, bench, topN, sessionId } = req.body || {};
  const questionResult = QuestionSchema.safeParse(question);
  if (!questionResult.success) {
    return res.status(400).json({ error: questionResult.error.issues[0]?.message || "'question' is required." });
  }
  if (sessionId !== undefined && !isValidSessionId(sessionId)) {
    return res.status(400).json({ error: "'sessionId' must be a short alphanumeric/hyphen string." });
  }

  try {
    const history = sessionId ? await loadHistory(req.user.id, sessionId) : [];
    const result = await answerLegalQuestion(
      questionResult.data,
      { court, fromDate, toDate, title, cite, author, bench },
      topN ? Number(topN) : undefined,
      history
    );

    if (sessionId) {
      persistTurn(req.user.id, sessionId, questionResult.data, result).catch((err) => console.error("Failed to persist legal-assistant turn:", err.message));
    }

    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
});

// Rehydrates a conversation after a page refresh — client keeps sessionId in
// localStorage, and this returns whatever turns were persisted for it (empty for a
// brand-new session, not a 404, since "no history yet" is the normal first-visit case).
router.get("/legal-assistant/session/:sessionId", requireAuth, async (req, res) => {
  const { sessionId } = req.params;
  if (!isValidSessionId(sessionId)) return res.status(400).json({ error: "Invalid sessionId." });

  const supabase = getSupabase();
  const { data: session, error } = await supabase.from("legal_assistant_sessions").select("id").eq("session_id", sessionId).eq("user_id", req.user.id).maybeSingle();
  if (error) throw error;
  if (!session) return res.json({ turns: [] });

  const { data: turns, error: turnsError } = await supabase
    .from("legal_assistant_turns")
    .select("question, result, created_at")
    .eq("session_id", session.id)
    .order("created_at", { ascending: true });
  if (turnsError) throw turnsError;

  res.json({ turns });
});

export default router;
