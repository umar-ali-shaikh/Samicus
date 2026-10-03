import { Router } from "express";
import {
  search,
  getDocument,
  getOriginalDocument,
  getFragment,
  getMetainfo,
  IndianKanoonAuthError,
  IndianKanoonApiError,
} from "../services/indianKanoon.js";
import { answerCaseLawQuestion, OpenRouterAuthError, OpenRouterApiError } from "../services/aiCaseLawAnswer.js";

const router = Router();

// Every Indian Kanoon call costs real money, so failures are surfaced as clear, specific
// errors rather than a generic 500 — callers need to know "bad token" vs "try again".
function handleIkError(err, res) {
  if (err instanceof IndianKanoonAuthError) {
    console.error("Indian Kanoon auth error:", err.message);
    return res.status(502).json({ error: "Case law search is unavailable: invalid or missing API token." });
  }
  if (err instanceof IndianKanoonApiError) {
    console.error("Indian Kanoon API error:", err.status, err.message);
    const status = err.status >= 400 && err.status < 600 ? err.status : 502;
    return res.status(status).json({ error: err.message });
  }
  console.error("Unexpected case law error:", err);
  return res.status(500).json({ error: "Case law search failed unexpectedly." });
}

// NOTE: not behind requireAuth — this client has no login flow wired up yet (see the
// integration notes). If this app ever gets a real auth boundary, gate these too,
// since every hit here spends real money.

router.get("/case-law/search", async (req, res) => {
  const { q, pagenum, maxpages, court, fromDate, toDate, title, cite, author, bench } = req.query;
  if (!q || !q.trim()) return res.status(400).json({ error: "Query parameter 'q' is required." });

  try {
    const result = await search(
      q,
      { court, fromDate, toDate, title, cite, author, bench },
      pagenum ? Number(pagenum) : 0,
      maxpages ? Number(maxpages) : undefined
    );
    res.json(result);
  } catch (err) {
    handleIkError(err, res);
  }
});

router.get("/case-law/:docid", async (req, res) => {
  const { maxcites, maxcitedby } = req.query;
  try {
    const result = await getDocument(
      req.params.docid,
      maxcites ? Number(maxcites) : undefined,
      maxcitedby ? Number(maxcitedby) : undefined
    );
    res.json(result);
  } catch (err) {
    handleIkError(err, res);
  }
});

router.get("/case-law/:docid/original", async (req, res) => {
  try {
    res.json(await getOriginalDocument(req.params.docid));
  } catch (err) {
    handleIkError(err, res);
  }
});

router.get("/case-law/:docid/fragment", async (req, res) => {
  const { q } = req.query;
  if (!q || !q.trim()) return res.status(400).json({ error: "Query parameter 'q' is required." });
  try {
    res.json(await getFragment(req.params.docid, q));
  } catch (err) {
    handleIkError(err, res);
  }
});

router.get("/case-law/:docid/meta", async (req, res) => {
  try {
    res.json(await getMetainfo(req.params.docid));
  } catch (err) {
    handleIkError(err, res);
  }
});

// Distinct from Indian Kanoon's own errors: the search half of this call can fail for
// "bad token"/"try again" reasons, the AI half for a separate "bad/missing OpenRouter
// key" reason — each needs to be surfaced as what actually broke.
function handleAiError(err, res) {
  if (err instanceof IndianKanoonAuthError || err instanceof IndianKanoonApiError) return handleIkError(err, res);
  if (err instanceof OpenRouterAuthError) {
    console.error("OpenRouter auth error:", err.message);
    return res.status(502).json({ error: "AI answer generation is unavailable: invalid or missing OpenRouter API key." });
  }
  if (err instanceof OpenRouterApiError) {
    console.error("OpenRouter API error:", err.status, err.message);
    const status = err.status >= 400 && err.status < 600 ? err.status : 502;
    return res.status(status).json({ error: err.message });
  }
  console.error("Unexpected AI answer error:", err);
  return res.status(500).json({ error: "AI answer generation failed unexpectedly." });
}

router.get("/case-law/ai-answer", async (req, res) => {
  const { q, court, fromDate, toDate, title, cite, author, bench, topN } = req.query;
  if (!q || !q.trim()) return res.status(400).json({ error: "Query parameter 'q' is required." });

  try {
    const result = await answerCaseLawQuestion(q, { court, fromDate, toDate, title, cite, author, bench }, topN ? Number(topN) : undefined);
    res.json(result);
  } catch (err) {
    handleAiError(err, res);
  }
});

export default router;
