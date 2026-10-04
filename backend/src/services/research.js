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
import { chatCompletion, isOpenRouterConfigured } from "./openRouter.js";

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

// A single long judgment can otherwise fill most/all of the result list with its own
// passages (it has many internally-similar paragraphs), crowding out every other case on
// the same topic. Capping how many passages one document contributes keeps results
// diverse across cases, not just highly-ranked within one.
const MAX_PASSAGES_PER_DOCUMENT = 2;
const RESULT_LIMIT = 12;

function diversifyByDocument(passages, { maxPerDoc = MAX_PASSAGES_PER_DOCUMENT, limit = RESULT_LIMIT } = {}) {
  const perDocCount = new Map();
  const kept = [];
  const overflow = [];
  for (const p of passages) {
    const count = perDocCount.get(p.documentId) || 0;
    if (count < maxPerDoc) {
      perDocCount.set(p.documentId, count + 1);
      kept.push(p);
    } else {
      overflow.push(p); // still shown if there's room left after every document had its fair share
    }
    if (kept.length >= limit) break;
  }
  return kept.length >= limit ? kept : [...kept, ...overflow].slice(0, limit);
}

/**
 * @returns {Promise<{ chunk: object, score: number }[]>} best first; includes below-threshold
 *   passages so the UI can show what was kept and what was dropped.
 */
export async function retrieve(queryText, { sourcesEnabled } = {}) {
  if (!ragEnabled()) throw new KnowledgeBaseUnavailableError();
  // Fetch a wider candidate pool than we'll show, so capping passages-per-document still
  // leaves enough genuinely-relevant results from OTHER cases to fill the result list.
  const candidates = await retrievePassages(queryText, { limit: RESULT_LIMIT * 4, threshold: null });
  const passages = diversifyByDocument(candidates);
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

const SUMMARY_SYSTEM_PROMPT = `You summarize Indian statutes/judgments for Vidhira's research library. You will be given a search question and a numbered list of verbatim passages retrieved for it.

Rules:
1. Ground every sentence ONLY in the numbered passages given — never add a law, fact, or holding that isn't in them.
2. Every sentence must end with the source number(s) it's based on, e.g. "...void under Section 27 [2]." Never cite a number you weren't given.
3. Plain, simple English — short sentences, no legal jargon left unexplained, written for someone without a law degree.
4. 3-5 sentences. If the passages only partially answer the question, say what they do cover and stop there — do not pad with speculation.
5. Never guarantee an outcome and never imply this is legal advice — it's a summary of what the indexed sources say.

Output plain text only — no JSON, no markdown, no preamble like "Summary:".`;

function evidenceFromSegments(segments) {
  return segments.map((s, i) => `[${i + 1}] ${s.documentTitle}\n${s.text.slice(0, 1200)}`).join("\n\n");
}

/**
 * Short, strictly-grounded prose summary of the already-retrieved, already-citable segments —
 * a thin layer over the extractive passages below it, never a replacement for them (the
 * passages remain the source of truth; this is just easier to read at a glance). Returns
 * null (not an error) if OpenRouter isn't configured or the call fails — the extractive
 * answer underneath it works fine on its own, so this is a pure enhancement.
 * @param {string} question
 * @param {Array<{text: string, documentTitle: string}>} segments
 * @returns {Promise<string|null>}
 */
export async function summarizeAnswer(question, segments) {
  if (!isOpenRouterConfigured() || segments.length === 0) return null;
  try {
    const raw = await chatCompletion([
      { role: "system", content: SUMMARY_SYSTEM_PROMPT },
      { role: "user", content: `Question: ${question}\n\nPassages:\n${evidenceFromSegments(segments)}` },
    ]);
    const text = raw.trim();
    return text || null;
  } catch (err) {
    console.error("Research summary generation failed, showing passages without it:", err.message);
    return null;
  }
}

export async function resolveCitation(chunkId) {
  const { data, error } = await getSupabase().from("corpus_chunks").select("*, document:corpus_documents(*)").eq("id", chunkId).maybeSingle();
  if (error) throw error;
  return data;
}
