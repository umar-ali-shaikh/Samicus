// Semantic retrieval over the Qdrant knowledge base.
import { embedTexts } from "./embeddings.js";
import { legalCollection, matchFilter, queryPoints, collectionStats } from "./qdrant.js";
import { ragEnabled } from "./ingest.js";
import { getSupabaseClient } from "./supabaseClient.js";

// 0.55 was tuned against an earlier embedding model and, in production traffic, was turning
// up empty ("not in the indexed library") for ordinary, well-covered questions (e.g. Section
// 125 CrPC maintenance) whose best genuine match still scored below it — too strict a gate
// for this model's score distribution. Lowered until re-validated against real traffic;
// recall from an occasional marginal match matters more here than precision, since
// answerFromRetrieval's paragraph-class + citability checks are the real relevance gate.
export function minScore(): number {
  const v = Number(process.env.RAG_MIN_SCORE);
  return Number.isFinite(v) && v > 0 && v < 1 ? v : 0.42;
}

export interface Passage {
  id: string;
  score: number | null;
  text: string;
  title: string;
  citation: string;
  source: string;
  court: string | null;
  url: string | null;
  paraClass: string;
  paraNumber: string | null;
  documentId: string;
  externalId: string | null;
}

function toPassage(point: { id: string; score: number; payload?: Record<string, any> }): Passage {
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

/** @param threshold pass null to get everything (the research screen shows kept vs dropped passages) */
export async function retrievePassages(query: string, { limit = 8, source, threshold }: { limit?: number; source?: string; threshold?: number | null } = {}): Promise<Passage[]> {
  if (!ragEnabled() || !query?.trim()) return [];
  const [vector] = await embedTexts([query], "RETRIEVAL_QUERY");
  const points = await queryPoints(legalCollection(), vector!, {
    limit,
    ...(source ? { filter: matchFilter("source", source) } : {}),
    ...(threshold === null ? {} : { scoreThreshold: threshold ?? minScore() }),
  });
  return points.map(toPassage);
}

/**
 * Keyword fallback over Postgres (not Qdrant) — catches an exact section number or act
 * abbreviation that a dense embedding can blur past entirely. Used by research.js to fill
 * in / confirm the vector search's results (hybrid retrieval), never as a standalone path:
 * scores are null (a lexical hit has no cosine score) and left for the caller to merge in.
 */
export async function lexicalSearch(terms: string[], { limit = 20 }: { limit?: number } = {}): Promise<Passage[]> {
  const cleaned = [...new Set(terms.map((t) => String(t || "").trim()).filter((t) => t.length >= 2))];
  if (cleaned.length === 0) return [];
  const supabase = getSupabaseClient();
  const orFilter = cleaned.map((t) => `text.ilike.%${t.replace(/[%,]/g, "")}%`).join(",");
  const { data, error } = await supabase
    .from("corpus_chunks")
    .select("id, text, paragraph_class, para_number, document:corpus_documents(id, title, citation, source, court, canonical_url, external_id)")
    .or(orFilter)
    .limit(limit);
  if (error) throw error;
  return (data || []).map((row: any) => ({
    id: String(row.id),
    score: null,
    text: row.text || "",
    title: row.document?.title || "",
    citation: row.document?.citation || row.document?.title || "",
    source: row.document?.source || "other",
    court: row.document?.court || null,
    url: row.document?.canonical_url || null,
    paraClass: row.paragraph_class || "reasoning",
    paraNumber: row.para_number || null,
    documentId: row.document?.id,
    externalId: row.document?.external_id || null,
  }));
}

export async function knowledgeBaseStats(): Promise<{ enabled: boolean; collection?: string; exists?: boolean; points?: number; status?: string }> {
  if (!ragEnabled()) return { enabled: false };
  const stats = await collectionStats(legalCollection());
  return { enabled: true, collection: legalCollection(), ...stats };
}
