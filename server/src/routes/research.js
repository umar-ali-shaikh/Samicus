import { Router } from "express";
import { ResearchQuery, ResearchAnswer, CorpusDocument, CorpusChunk } from "../models/index.js";
import { requireAuth } from "../middleware/auth.js";
import { retrieve, answerFromRetrieval, RELEVANCE_THRESHOLD } from "../services/research.js";

const router = Router();

// Step 1: retrieve — a separate callable step, so the client sees retrieval before any answer exists.
router.post("/research/retrieve", requireAuth, async (req, res) => {
  const { text, sourcesEnabled } = req.body;
  const scored = await retrieve(text, { sourcesEnabled });

  const query = await ResearchQuery.create({
    accountId: req.body.accountId || null,
    text,
    sourcesEnabled: sourcesEnabled || [],
    retrievedChunkIds: scored.map((s) => s.chunk._id),
    scores: scored.map((s) => s.score),
    threshold: RELEVANCE_THRESHOLD,
    outcome: scored.some((s) => s.score >= RELEVANCE_THRESHOLD) ? "answered" : "not_found",
  });

  res.json({
    retrievalId: query._id,
    threshold: RELEVANCE_THRESHOLD,
    chunks: scored.map((s) => ({
      chunkId: s.chunk._id,
      score: s.score,
      kept: s.score >= RELEVANCE_THRESHOLD,
      text: s.chunk.text,
      paragraphClass: s.chunk.paragraphClass,
      sectionLabel: s.chunk.sectionLabel,
      documentTitle: s.chunk.documentId?.title,
      source: s.chunk.documentId?.source,
    })),
  });
});

// Step 2: answer — takes a retrieval id, NEVER a bare question.
router.post("/research/answer", requireAuth, async (req, res) => {
  const { retrievalId } = req.body;
  const query = await ResearchQuery.findById(retrievalId);
  if (!query) return res.status(404).json({ error: "Unknown retrieval id" });

  const scored = await Promise.all(
    query.retrievedChunkIds.map(async (id, i) => ({ chunk: await CorpusChunk.findById(id).populate("documentId"), score: query.scores[i] }))
  );

  const result = await answerFromRetrieval(scored);

  if (result.outcome === "not_found") {
    query.outcome = "not_found";
    await query.save();
    return res.json({ outcome: "not_found", segments: [], discardedCount: result.discardedCount });
  }

  const answer = await ResearchAnswer.create({
    queryId: query._id,
    segments: result.segments.map((s) => ({ text: s.text, chunkId: s.chunkId })),
    unsupportedSpanCount: result.unsupportedSpanCount,
  });

  res.json({ outcome: result.outcome, answer, segments: result.segments, discardedCount: result.discardedCount });
});

router.get("/corpus/:id", async (req, res) => {
  const doc = await CorpusDocument.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: "Not found" });
  res.json(doc);
});

router.get("/corpus/chunks/:id", async (req, res) => {
  const chunk = await CorpusChunk.findById(req.params.id).populate("documentId");
  if (!chunk) return res.status(404).json({ error: "Not found" });
  res.json(chunk);
});

router.get("/corpus/status", async (req, res) => {
  const bySource = await CorpusDocument.aggregate([{ $group: { _id: "$source", count: { $sum: 1 } } }]);
  const chunkCount = await CorpusChunk.countDocuments();
  res.json({ bySource, chunkCount, asOf: new Date().toISOString().slice(0, 10) });
});

export default router;
