import { Router } from "express";
import {
  answerLegalQuestion,
  OpenRouterAuthError,
  OpenRouterApiError,
  IndianKanoonAuthError,
  IndianKanoonApiError,
} from "../services/legalAssistant.js";

const router = Router();

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
router.post("/legal-assistant/ask", async (req, res) => {
  const { question, court, fromDate, toDate, title, cite, author, bench, topN } = req.body || {};
  if (!question || !String(question).trim()) return res.status(400).json({ error: "'question' is required." });

  try {
    const result = await answerLegalQuestion(
      String(question),
      { court, fromDate, toDate, title, cite, author, bench },
      topN ? Number(topN) : undefined
    );
    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
});

export default router;
