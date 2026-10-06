// Ranks candidate documents by relevance to a query, preferring real semantic
// embeddings (OpenRouter) and automatically falling back to local TF-IDF
// (utils/tfidf.js) whenever embeddings aren't configured or the call fails for any
// reason. Embeddings are a pure enhancement here — the RAG pipeline in legalAssistant.js
// must keep producing answers even if OPENROUTER_API_KEY is never set.
import { embedTexts, isOpenRouterEmbeddingsConfigured } from "./openRouterEmbeddings.js";
import { cosineSimilarity } from "../utils/cosine.js";
import { rankWithScores as rankByTfidf } from "../utils/tfidf.js";

// TF-IDF cosine over sparse term vectors is 0 only when a candidate shares literally
// no vocabulary with the query — an exact-zero bar. Dense embedding cosine similarity
// is almost never exactly 0 (everything lives in the same "legal text" semantic
// neighborhood to some degree), so it needs an actual threshold instead. Lowered from an
// initial 0.5 after live-traffic measurement against the current model (all-mpnet-base-v2
// via OpenRouter) and corpus showed genuinely relevant passages routinely scoring well
// under that — e.g. a Parsi Marriage and Divorce Act divorce-procedure passage against
// "Can a wife claim maintenance under Section 125 CrPC after divorce?" scored 0.418, and
// Indian Kanoon search candidates for "Kesavananda Bharati basic structure" topped out at
// 0.465 — both silently dropped by the old 0.5 floor on every single re-run. Not an
// empirically-tuned constant even now — tighten it if genuinely unrelated results keep
// clearing it, loosen it if relevant ones keep getting dropped.
const MIN_EMBEDDING_SIMILARITY = 0.3;

/**
 * @template T
 * @param {string} query
 * @param {T[]} items
 * @param {(item: T) => string} getText
 * @param {{minScore?: number}} [opts] - override the embedding-similarity floor. Pass a
 *   negative number to effectively disable filtering (keep every candidate, just order
 *   them) — appropriate when `items` was already relevance-filtered upstream by a real
 *   search engine and `getText` is a short snippet (e.g. a title+headline) rather than
 *   full passage text, where genuine matches routinely score well under the default
 *   0.5 floor tuned for longer text (see fetchAndIndexLiveSources in research.js).
 * @returns {Promise<Array<{item: T, score: number}>>} filtered to "actually relevant"
 *   and sorted most-relevant first — never includes a candidate judged unrelated to the
 *   query, whichever scorer produced the judgment.
 */
export async function rankRelevantDocs(query, items, getText, { minScore = MIN_EMBEDDING_SIMILARITY } = {}) {
  if (items.length === 0) return [];

  if (isOpenRouterEmbeddingsConfigured()) {
    try {
      const [queryVecs, docVecs] = await Promise.all([
        embedTexts([query], "RETRIEVAL_QUERY"),
        embedTexts(items.map(getText), "RETRIEVAL_DOCUMENT"),
      ]);
      const queryVec = queryVecs[0];
      return items
        .map((item, i) => ({ item, score: cosineSimilarity(queryVec, docVecs[i]) }))
        .filter((x) => x.score >= minScore)
        .sort((a, b) => b.score - a.score);
    } catch (err) {
      console.error("OpenRouter embedding re-rank failed, falling back to local TF-IDF:", err.message);
    }
  }

  return rankByTfidf(query, items, getText).filter((x) => x.score > 0);
}
