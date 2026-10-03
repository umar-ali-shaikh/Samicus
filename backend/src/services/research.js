// Vidhira research library — grounded in the Qdrant knowledge base:
//   1. retrieve(query) -> passages with cosine scores (semantic, Gemini embeddings)
//   2. keep score >= threshold
//   3. zero hits -> {outcome: "not_found"}, no answer is assembled at all
//   4. the "answer" is EXTRACTIVE: every segment is a retrieved passage's own text, so every
//      citation resolves by construction (no model can invent one)
//   5. paragraph-class gate: a party's *arguments* can be shown but never cited as authority.
import { getSupabase } from "../config/db.js";
import { retrievePassages, minScore } from "./rag/retrieve.js";
import { ragEnabled } from "./rag/ingest.js";

export class KnowledgeBaseUnavailableError extends Error {
  constructor() {
    super("The research library is not configured on this deployment (needs QDRANT_URL and GEMINI_API_KEY).");
    this.status = 503;
    this.expose = true;
    this.code = "RAG_DISABLED";
  }
}

export function relevanceThreshold() {
  return minScore();
}

/**
 * @returns {Promise<{ chunk: object, score: number }[]>} best first; includes below-threshold
 *   passages so the UI can show what was kept and what was dropped.
 */
export async function retrieve(queryText, { sourcesEnabled } = {}) {
  if (!ragEnabled()) throw new KnowledgeBaseUnavailableError();
  const passages = await retrievePassages(queryText, { limit: 12, threshold: null });
  return passages
    .filter((p) => !sourcesEnabled || sourcesEnabled.length === 0 || sourcesEnabled.includes(p.source))
    .map((p) => ({
      score: Math.round(p.score * 100) / 100,
      chunk: {
        id: p.id,
        text: p.text,
        paragraph_class: p.paraClass,
        section_label: p.paraNumber ? `¶ ${p.paraNumber}` : null,
        document: { id: p.documentId, title: p.title, citation: p.citation, source: p.source, canonical_url: p.url },
      },
    }));
}

// Only these paragraph classes may support an assertion; arguments are shown but never cited as law.
const CITABLE_CLASSES = new Set(["provision", "reasoning", "holding", "directions"]);

export async function answerFromRetrieval(retrieved) {
  const threshold = relevanceThreshold();
  const kept = retrieved.filter((r) => r.score >= threshold);
  const discardedCount = retrieved.length - kept.length;

  if (kept.length === 0) {
    return { outcome: "not_found", segments: [], discardedCount, unsupportedSpanCount: 0 };
  }

  const citable = kept.filter((r) => CITABLE_CLASSES.has(r.chunk.paragraph_class));
  if (citable.length === 0) {
    // Only argument/fact chunks retrieved — nothing citable as authority.
    return { outcome: "not_found", segments: [], discardedCount, unsupportedSpanCount: 0 };
  }

  const segments = citable.map((r) => ({
    text: r.chunk.text,
    chunkId: r.chunk.id,
    score: r.score,
    documentTitle: r.chunk.document?.title,
    citation: r.chunk.document?.citation,
    url: r.chunk.document?.canonical_url,
  }));

  const outcome = citable.length < kept.length || discardedCount > 0 ? "partial" : "answered";
  return { outcome, segments, discardedCount, unsupportedSpanCount: 0 };
}

export async function resolveCitation(chunkId) {
  const { data, error } = await getSupabase().from("corpus_chunks").select("*, document:corpus_documents(*)").eq("id", chunkId).maybeSingle();
  if (error) throw error;
  return data;
}
