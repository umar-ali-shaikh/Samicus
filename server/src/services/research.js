// Vidhira's grounding constraint (API & Data Model doc §6), implemented for real:
//   1. retrieve(query) -> chunks with scores
//   2. filter score >= THRESHOLD
//   3. zero hits -> {outcome: "not_found"}, no generation step at all
//   4. "generate" = assemble segments EXCLUSIVELY from retrieved chunk text (extractive,
//      no LLM in this build per the "stub integrations" decision) — this makes citation
//      validation a structural guarantee rather than a check bolted on afterwards.
//   5. paragraph_class gate: petitioner/respondent-argument chunks can be shown but never
//      cited as authority for an assertion.

import { CorpusChunk, CorpusDocument } from "../models/index.js";

export const RELEVANCE_THRESHOLD = 0.62;

const STOPWORDS = new Set(["the", "a", "an", "of", "to", "in", "is", "and", "for", "on", "by", "or", "does", "can", "my", "after"]);

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOPWORDS.has(t));
}

// Dev-mode substitute for a real vector index: keyword overlap against curated chunk
// keywords + chunk text. Scored against a fixed target overlap rather than query length,
// so a longer natural-language question isn't penalised just for having more filler words.
const RELEVANT_OVERLAP_TARGET = 3;

export async function retrieve(queryText, { sourcesEnabled } = {}) {
  const queryTokens = new Set(tokenize(queryText));
  if (queryTokens.size === 0) return [];

  const chunks = await CorpusChunk.find().populate("documentId").lean({ virtuals: false });

  const scored = chunks
    .filter((c) => !sourcesEnabled || sourcesEnabled.length === 0 || sourcesEnabled.includes(c.documentId?.source))
    .filter((c) => !c.documentId?.supersededBy) // superseded provisions excluded at retrieval
    .map((c) => {
      // Keywords are tokenized the same way as the query so hyphenated phrases like
      // "non-compete" line up with a query that says "non compete" / "noncompete".
      const chunkTokens = new Set([...tokenize((c.keywords || []).join(" ")), ...tokenize(c.text)]);
      const overlap = [...queryTokens].filter((t) => chunkTokens.has(t)).length;
      const score = Math.min(1, overlap / RELEVANT_OVERLAP_TARGET);
      return { chunk: c, score: Math.round(score * 100) / 100 };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored;
}

// Only these paragraph classes may support an assertion; arguments are shown but never cited as law.
const CITABLE_CLASSES = new Set(["provision", "reasoning", "holding", "directions"]);

export async function answerFromRetrieval(retrieved) {
  const kept = retrieved.filter((r) => r.score >= RELEVANCE_THRESHOLD);
  const discardedCount = retrieved.length - kept.length;

  if (kept.length === 0) {
    return { outcome: "not_found", segments: [], discardedCount, unsupportedSpanCount: 0 };
  }

  const citable = kept.filter((r) => CITABLE_CLASSES.has(r.chunk.paragraphClass));
  if (citable.length === 0) {
    // Only argument/fact chunks retrieved — nothing citable as authority.
    return { outcome: "not_found", segments: [], discardedCount, unsupportedSpanCount: 0 };
  }

  // Extractive assembly: every segment IS a retrieved chunk's own text, so every
  // citation trivially resolves — validation is structural, not a post-hoc check.
  const segments = citable.map((r) => ({
    text: r.chunk.text,
    chunkId: r.chunk._id,
    score: r.score,
    documentTitle: r.chunk.documentId?.title,
    citation: r.chunk.documentId?.citation,
  }));

  const outcome = citable.length < kept.length || discardedCount > 0 ? "partial" : "answered";

  return { outcome, segments, discardedCount, unsupportedSpanCount: 0 };
}

export async function resolveCitation(chunkId) {
  const chunk = await CorpusChunk.findById(chunkId).populate("documentId");
  return chunk;
}
