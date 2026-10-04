// Semantic retrieval over the Qdrant knowledge base.
import { embedTexts } from "../openRouterEmbeddings.js";
import { legalCollection, matchFilter, queryPoints, collectionStats } from "./qdrant.js";
import { ragEnabled } from "./ingest.js";

// 0.6-0.8 was observed with Gemini embeddings; different embedding models calibrate
// cosine scores differently, so after switching models/providers (see
// services/openRouterEmbeddings.js) this range — and RAG_MIN_SCORE's default — should be
// re-validated against real traffic, not assumed to still hold.
export function minScore() {
  const v = Number(process.env.RAG_MIN_SCORE);
  return Number.isFinite(v) && v > 0 && v < 1 ? v : 0.55;
}

/**
 * @typedef {{ id: string, score: number, text: string, title: string, citation: string, source: string, court: string|null,
 *   url: string|null, paraClass: string, paraNumber: string|null, documentId: string, externalId: string|null }} Passage
 */

function toPassage(point) {
  const p = point.payload || {};
  return {
    id: String(point.id),
    score: point.score,
    text: p.text || "",
    title: p.title || "",
    citation: p.citation || p.title || "",
    source: p.source || "other",
    court: p.court || null,
    url: p.url || null,
    paraClass: p.para_class || "reasoning",
    paraNumber: p.para_number || null,
    documentId: p.document_id,
    externalId: p.external_id || null,
  };
}

/**
 * @param {string} query
 * @param {{ limit?: number, source?: string, threshold?: number|null }} [opts] pass threshold: null to get everything
 *   (the research screen shows kept vs dropped passages)
 * @returns {Promise<Passage[]>} best first
 */
export async function retrievePassages(query, { limit = 8, source, threshold } = {}) {
  if (!ragEnabled() || !query?.trim()) return [];
  const [vector] = await embedTexts([query], "RETRIEVAL_QUERY");
  const points = await queryPoints(legalCollection(), vector, {
    limit,
    ...(source ? { filter: matchFilter("source", source) } : {}),
    ...(threshold === null ? {} : { scoreThreshold: threshold ?? minScore() }),
  });
  return points.map(toPassage);
}

export async function knowledgeBaseStats() {
  if (!ragEnabled()) return { enabled: false };
  const stats = await collectionStats(legalCollection());
  return { enabled: true, collection: legalCollection(), ...stats };
}
