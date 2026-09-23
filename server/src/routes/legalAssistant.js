import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  answerLegalQuestion,
  OpenRouterAuthError,
  OpenRouterApiError,
  IndianKanoonAuthError,
  IndianKanoonApiError,
} from "../services/legalAssistant.js";
import { LegalAssistantSession } from "../models/index.js";

const router = Router();

// Client generates this with crypto.randomUUID() — validate the shape before it ever
// reaches a Mongo query (req.body values are attacker-controlled JSON, so without this
// a non-string sessionId, e.g. an object, could otherwise be used to build one).
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

// NOTE: not behind requireAuth, matching routes/indianKanoon.js — this client has no
// login flow wired up yet. Every hit here spends real money (Indian Kanoon + OpenRouter),
// so if this app ever gets a real auth boundary, gate this route too.
router.post("/legal-assistant/ask", askLimiter, async (req, res) => {
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
      // Best-effort: a persistence hiccup shouldn't cost the user the answer they
      // already paid (in IK/OpenRouter calls) to get — log and still return it.
      LegalAssistantSession.findOneAndUpdate(
        { sessionId },
        { $push: { turns: { question: String(question), result } } },
        { upsert: true }
      ).catch((err) => console.error("Failed to persist legal-assistant turn:", err.message));
    }

    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
});

// Rehydrates a conversation after a page refresh — client keeps sessionId in
// localStorage, and this returns whatever turns were persisted for it (empty for a
// brand-new session, not a 404, since "no history yet" is the normal first-visit case).
router.get("/legal-assistant/session/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  if (!isValidSessionId(sessionId)) return res.status(400).json({ error: "Invalid sessionId." });

  const session = await LegalAssistantSession.findOne({ sessionId }).lean();
  res.json({ turns: session?.turns || [] });
});

export default router;
