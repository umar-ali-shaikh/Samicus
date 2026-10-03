// Ranks candidate documents by relevance to a query, preferring real semantic
// embeddings (Gemini, free tier) and automatically falling back to local TF-IDF
// (utils/tfidf.js) whenever embeddings aren't configured or the call fails for any
// reason. Embeddings are a pure enhancement here — the RAG pipeline in legalAssistant.js
// must keep producing answers even if GEMINI_API_KEY is never set.
import { embedTexts, isGeminiConfigured } from "./gemini.js";
import { cosineSimilarity } from "../utils/cosine.js";
import { rankWithScores as rankByTfidf } from "../utils/tfidf.js";

// TF-IDF cosine over sparse term vectors is 0 only when a candidate shares literally
// no vocabulary with the query — an exact-zero bar. Dense embedding cosine similarity
// is almost never exactly 0 (everything lives in the same "legal text" semantic
// neighborhood to some degree), so it needs an actual threshold instead. This is a
// starting heuristic, not an empirically-tuned constant — tighten it if genuinely
// unrelated results keep clearing it, loosen it if relevant ones keep getting dropped.
const MIN_EMBEDDING_SIMILARITY = 0.5;

/**
 * @template T
 * @param {string} query
 * @param {T[]} items
 * @param {(item: T) => string} getText
 * @returns {Promise<Array<{item: T, score: number}>>} filtered to "actually relevant"
 *   and sorted most-relevant first — never includes a candidate judged unrelated to the
 *   query, whichever scorer produced the judgment.
 */
export async function rankRelevantDocs(query, items, getText) {
  if (items.length === 0) return [];

  if (isGeminiConfigured()) {
    try {
      const [queryVecs, docVecs] = await Promise.all([
        embedTexts([query], "RETRIEVAL_QUERY"),
        embedTexts(items.map(getText), "RETRIEVAL_DOCUMENT"),
      ]);
      const queryVec = queryVecs[0];
      return items
        .map((item, i) => ({ item, score: cosineSimilarity(queryVec, docVecs[i]) }))
        .filter((x) => x.score >= MIN_EMBEDDING_SIMILARITY)
        .sort((a, b) => b.score - a.score);
    } catch (err) {
      console.error("Gemini embedding re-rank failed, falling back to local TF-IDF:", err.message);
    }
  }

  return rankByTfidf(query, items, getText).filter((x) => x.score > 0);
}
