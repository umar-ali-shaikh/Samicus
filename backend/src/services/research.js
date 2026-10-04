// Vidhira research library — grounded in the Qdrant knowledge base:
//   1. retrieve(query) -> passages with cosine scores (semantic, OpenRouter embeddings)
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
    super("The research library is not configured on this deployment (needs QDRANT_URL and OPENROUTER_API_KEY).");
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
const MAX_PASSAGES_PER_DOCUMENT = 1;
const RESULT_LIMIT = 12;

function diversifyByDocument(passages, { maxPerDoc = MAX_PASSAGES_PER_DOCUMENT, limit = RESULT_LIMIT } = {}) {
  // Strict cap — no padding back in from documents that already hit their share. Showing
  // fewer, genuinely distinct cases beats padding the list with a repeat of one judgment.
  const perDocCount = new Map();
  const kept = [];
  for (const p of passages) {
    const count = perDocCount.get(p.documentId) || 0;
    if (count >= maxPerDoc) continue;
    perDocCount.set(p.documentId, count + 1);
    kept.push(p);
    if (kept.length >= limit) break;
  }
  return kept;
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

const INSIGHTS_SYSTEM_PROMPT = `You help Vidhira's research library turn raw retrieved passages into something a non-lawyer can skim professionally. You will be given a search question and a numbered list of verbatim passages (one per case/document) retrieved for it.

Rules:
1. Ground every word ONLY in the numbered passages given — never add a law, fact, case name, or holding that isn't in them. If a passage is too fragmentary to say anything concrete about, write a brief honest gloss like "A procedural excerpt; doesn't state a clear holding on its own." rather than inventing substance.
2. "summary": 3-5 sentences answering the question from across ALL the passages together. Every sentence must end with the source number(s) it's based on, e.g. "...void under Section 27 [2]." Plain, simple English — short sentences, no unexplained jargon. If the passages only partially answer the question, say what they cover and stop — do not pad with speculation. Never guarantee an outcome or imply this is legal advice.
3. "glosses": for EVERY numbered passage, ONE short sentence (max ~25 words) in plain English saying what THAT specific passage says or holds — not a summary of the whole case, just that excerpt. No citation marker needed here (it's already tied to its own passage). No legal jargon left unexplained.

Output STRICT JSON only, no markdown fences, no commentary, matching exactly:
{ "summary": string, "glosses": [ { "index": number, "gloss": string } ] }
"glosses" must have exactly one entry per passage number given, in any order.`;

function evidenceFromSegments(segments) {
  return segments.map((s, i) => `[${i + 1}] ${s.documentTitle}\n${s.text.slice(0, 1200)}`).join("\n\n");
}

function stripCodeFence(text) {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match ? match[1].trim() : text.trim();
}

/**
 * One OpenRouter call that produces BOTH a strictly-grounded overall summary and a short
 * plain-English gloss per passage — a thin, clearly-labelled layer over the extractive
 * passages, never a replacement for them (the passages remain the source of truth). Returns
 * { summary: null, glosses: {} } (not an error) if OpenRouter isn't configured or the call/
 * parse fails — the extractive answer underneath works fine on its own, so this is a pure
 * enhancement, and a failure here must never break the research page.
 * @param {string} question
 * @param {Array<{chunkId: string, text: string, documentTitle: string}>} segments
 * @returns {Promise<{summary: string|null, glosses: Record<string,string>}>}
 */
export async function generateResearchInsights(question, segments) {
  const empty = { summary: null, glosses: {} };
  if (!isOpenRouterConfigured() || segments.length === 0) return empty;
  try {
    const raw = await chatCompletion(
      [
        { role: "system", content: INSIGHTS_SYSTEM_PROMPT },
        { role: "user", content: `Question: ${question}\n\nPassages:\n${evidenceFromSegments(segments)}` },
      ],
      { jsonMode: true }
    );
    const parsed = JSON.parse(stripCodeFence(raw));
    const glosses = {};
    for (const g of parsed.glosses || []) {
      const seg = segments[g.index - 1];
      if (seg && typeof g.gloss === "string" && g.gloss.trim()) glosses[seg.chunkId] = g.gloss.trim();
    }
    return { summary: typeof parsed.summary === "string" ? parsed.summary.trim() || null : null, glosses };
  } catch (err) {
    console.error("Research insights generation failed, showing passages without them:", err.message);
    return empty;
  }
}

export async function resolveCitation(chunkId) {
  const { data, error } = await getSupabase().from("corpus_chunks").select("*, document:corpus_documents(*)").eq("id", chunkId).maybeSingle();
  if (error) throw error;
  return data;
}
