// Lightweight, dependency-free relevance re-ranking for a small candidate set. No
// embedding API, no external model, no network call — just local TF-IDF term
// statistics computed over the candidate pool itself (classic "retrieve wide with a
// cheap search, re-rank smart with a cheap local score" pattern).
//
// Why this exists: Indian Kanoon's full-text search ranks by exact keyword overlap,
// which regularly misses the best match for a paraphrased/conversational question
// (e.g. "FIR ho gayi, ab kya karu" vs a statute titled "Code Of Criminal Procedure ...
// Section 154" that never uses the word "FIR" in its headline). Re-ranking the
// already-fetched candidates by TF-IDF cosine similarity picks a better subset without
// any additional Indian Kanoon or LLM API cost.

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being", "of", "in", "on",
  "at", "to", "for", "and", "or", "but", "with", "by", "from", "as", "that", "this",
  "it", "its", "not", "no", "do", "does", "did", "can", "will", "shall", "may",
  "vs", "v", "on", "said", "under", "section", "act",
]);

function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function termFrequency(tokens) {
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  return tf;
}

/**
 * Builds a TF-IDF space from `documents` (raw text per candidate) and returns a scorer
 * that ranks a query against them — cosine similarity, smoothed IDF so an unseen query
 * term never zeroes out the whole score.
 * @param {string[]} documents
 * @returns {(query: string) => number[]} scores aligned to `documents` order
 */
export function buildTfidfRanker(documents) {
  const docTokens = documents.map(tokenize);
  const df = new Map();
  for (const tokens of docTokens) {
    for (const term of new Set(tokens)) df.set(term, (df.get(term) || 0) + 1);
  }
  const N = documents.length;
  const idf = (term) => Math.log((N + 1) / ((df.get(term) || 0) + 1)) + 1;

  function vectorize(tokens) {
    const vec = new Map();
    for (const [term, count] of termFrequency(tokens)) vec.set(term, count * idf(term));
    return vec;
  }

  function cosine(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (const [term, weight] of a) {
      normA += weight * weight;
      if (b.has(term)) dot += weight * b.get(term);
    }
    for (const weight of b.values()) normB += weight * weight;
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  const docVectors = docTokens.map(vectorize);

  return function scoreQuery(query) {
    const queryVec = vectorize(tokenize(query));
    return docVectors.map((docVec) => cosine(queryVec, docVec));
  };
}

/**
 * Scores `items` by relevance of `getText(item)` to `query`, most-relevant first
 * (ties keep original relative order). Score is cosine similarity in [0, 1] — exactly
 * 0 means `getText(item)` shares zero vocabulary with `query` at all, which callers can
 * use to drop candidates that only made the pool by accident (e.g. Indian Kanoon's own
 * search returning something tangential) rather than force-including them.
 * @template T
 * @param {string} query
 * @param {T[]} items
 * @param {(item: T) => string} getText
 * @returns {Array<{item: T, score: number}>}
 */
export function rankWithScores(query, items, getText) {
  if (items.length === 0) return [];
  const scoreQuery = buildTfidfRanker(items.map(getText));
  const scores = scoreQuery(query);
  return items
    .map((item, index) => ({ item, score: scores[index], index }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item, score }) => ({ item, score }));
}

/**
 * Re-ranks `items` by relevance of `getText(item)` to `query`. Stable no-op for 0/1
 * items (nothing to re-rank). Convenience wrapper over {@link rankWithScores} for
 * callers that just want a better order, not the scores themselves.
 * @template T
 * @param {string} query
 * @param {T[]} items
 * @param {(item: T) => string} getText
 * @returns {T[]}
 */
export function rerankByRelevance(query, items, getText) {
  if (items.length <= 1) return items;
  return rankWithScores(query, items, getText).map((x) => x.item);
}
