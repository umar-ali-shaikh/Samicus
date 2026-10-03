import { Router } from "express";
import rateLimit from "express-rate-limit";
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
  if (!question || !String(question).trim()) return res.status(400).json({ error: "'question' is required." });
  if (sessionId !== undefined && !isValidSessionId(sessionId)) {
    return res.status(400).json({ error: "'sessionId' must be a short alphanumeric/hyphen string." });
  }

  try {
    const result = await answerLegalQuestion(
      String(question),
      { court, fromDate, toDate, title, cite, author, bench },
      topN ? Number(topN) : undefined
    );

    if (sessionId) {
      persistTurn(req.user.id, sessionId, String(question), result).catch((err) => console.error("Failed to persist legal-assistant turn:", err.message));
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
