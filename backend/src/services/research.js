// Vidhira research library — grounded in the Qdrant knowledge base:
//   1. retrieve(query) -> passages with cosine scores (semantic, OpenRouter embeddings)
//   2. keep score >= threshold
//   3. zero hits -> {outcome: "not_found"}, no answer is assembled at all
//   4. the "answer" is EXTRACTIVE: every segment is a retrieved passage's own text, so every
//      citation resolves by construction (no model can invent one)
//   5. paragraph-class gate: a party's *arguments* can be shown but never cited as authority.
import { getSupabase } from "../config/db.js";
import { retrievePassages, lexicalSearch, minScore } from "./rag/retrieve.js";
import { ragEnabled, ingestIndianKanoonDoc } from "./rag/ingest.js";
import { chatCompletion, isOpenRouterConfigured } from "./openRouter.js";
import { understandQuery } from "./legalQueryUnderstanding.js";
import { search as searchIndianKanoon, getDocumentRaw, isIndianKanoonConfigured } from "./indianKanoon.js";
import { rankRelevantDocs } from "./relevanceRanking.js";
import { expandLegalQuery, extractLexicalTerms, detectCourtIntent } from "../utils/legalAbbrev.js";

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

// Only these paragraph classes may support an assertion; arguments are shown but never
// cited as law. A quoted precedent IS the court citing another case as authority, so it
// belongs here too — it must never be confused with a party's own submission.
const CITABLE_CLASSES = new Set(["provision", "reasoning", "holding", "directions", "quoted_precedent"]);

// A single long judgment can otherwise fill most/all of the result list with its own
// passages (it has many internally-similar paragraphs), crowding out every other case on
// the same topic. Capping how many passages one document contributes keeps results
// diverse across cases, not just highly-ranked within one.
const MAX_PASSAGES_PER_DOCUMENT = 1;
const RESULT_LIMIT = 12;

// Diversification used to just keep each document's single highest-scoring passage,
// whatever its paragraph class. A judgment's petitioner/respondent argument paragraphs
// often score HIGHEST (they restate the legal question in the asker's own terms more
// directly than the court's own reasoning does) — so the one slot per document was
// routinely spent on an argument, silently crowding out that same document's reasoning/
// holding/provision passage one line below it. answerFromRetrieval then drops arguments
// as uncitable, and a document that actually had a perfectly good citable passage reads as
// having contributed nothing at all. Preferring a citable passage per document (when one
// exists in the candidate pool) fixes this at the source instead of just lowering the bar.
function diversifyByDocument(passages, { maxPerDoc = MAX_PASSAGES_PER_DOCUMENT, limit = RESULT_LIMIT } = {}) {
  const byDoc = new Map();
  for (const p of passages) {
    const list = byDoc.get(p.documentId) || [];
    list.push(p);
    byDoc.set(p.documentId, list);
  }
  const kept = [];
  for (const list of byDoc.values()) {
    const citable = list.filter((p) => CITABLE_CLASSES.has(p.paraClass));
    kept.push(...(citable.length > 0 ? citable : list).slice(0, maxPerDoc));
  }
  return kept.sort((a, b) => b.score - a.score).slice(0, limit);
}

// A question naming a specific court wants passages FROM that court, not whichever
// document's passage happened to score highest overall — boost (not hard-filter, so an
// off-court passage can still surface if nothing from the named court cleared the bar).
const COURT_BOOST = 0.1;
const COURT_INTENT_SOURCE = { supreme_court: "supreme_court", high_court: "high_court" };

function applyCourtBoost(passages, queryText) {
  const intent = detectCourtIntent(queryText);
  if (!intent) return passages;
  const wantedSource = COURT_INTENT_SOURCE[intent];
  return passages.map((p) => (p.source === wantedSource ? { ...p, score: Math.min(1, p.score + COURT_BOOST) } : p));
}

// Hybrid retrieval: dense vector search run over the query AND a few alternate phrasings
// (section-number/act-name expansion — "125 CrPC" also tried as "Section 125 of the Code
// of Criminal Procedure", its BNSS renumbering, etc.), merged with a lexical (keyword)
// fallback that catches an exact section number a dense embedding can blur past. A lexical
// hit not already found by the vector search is added at the floor (relevance threshold)
// score rather than a high one — it's included because it's worth considering, not because
// it's been scored as strongly relevant. A lexical hit confirming an existing vector match
// gets a small score bump instead (genuine hybrid agreement).
async function hybridRetrieve(queryText, { limit = RESULT_LIMIT * 4 } = {}) {
  const variants = expandLegalQuery(queryText);
  const vectorLists = await Promise.all(variants.map((v) => retrievePassages(v, { limit, threshold: null })));
  const byId = new Map();
  for (const list of vectorLists) {
    for (const p of list) {
      const existing = byId.get(p.id);
      if (!existing || p.score > existing.score) byId.set(p.id, p);
    }
  }

  const lexicalTerms = extractLexicalTerms(queryText);
  if (lexicalTerms.length > 0) {
    try {
      const lexHits = await lexicalSearch(lexicalTerms, { limit: RESULT_LIMIT * 2 });
      const floor = minScore();
      for (const hit of lexHits) {
        const existing = byId.get(hit.id);
        if (existing) existing.score = Math.min(1, existing.score + 0.06);
        else byId.set(hit.id, { ...hit, score: floor });
      }
    } catch (err) {
      console.error("Lexical search failed, continuing with vector results only:", err.message);
    }
  }

  return applyCourtBoost([...byId.values()], queryText).sort((a, b) => b.score - a.score);
}

// Reached only when hybrid retrieval above found nothing citable above the relevance
// threshold at all — the library actually doesn't have this yet, not just a scoring
// near-miss. Mirrors legalAssistant.js's Stage 3/6 (live Indian Kanoon search -> rank ->
// ingest), but AWAITED here (not fire-and-forget) because the research page explicitly
// promises "the library grows as questions are asked" — the newly-fetched sources must be
// searchable before this same request answers, not only on some later question.
const MAX_LIVE_FETCH_DOCS = 3;

async function fetchAndIndexLiveSources(queryText) {
  if (!isIndianKanoonConfigured() || !ragEnabled()) return { fetched: 0 };
  try {
    const intent = detectCourtIntent(queryText);
    const filters = intent === "supreme_court" ? { court: "supremecourt" } : {};
    const { docs } = await searchIndianKanoon(queryText, filters, 0, 1);
    if (!docs?.length) return { fetched: 0 };
    const ranked = await rankRelevantDocs(queryText, docs, (d) => `${d.title} ${d.headline || ""}`);
    const top = ranked.map((r) => r.item).slice(0, MAX_LIVE_FETCH_DOCS);
    const results = await Promise.allSettled(
      top.map(async (d) => {
        const full = await getDocumentRaw(d.tid);
        return ingestIndianKanoonDoc({ tid: d.tid, title: d.title, docsource: d.docsource, html: full.doc });
      })
    );
    const fetched = results.filter((r) => r.status === "fulfilled" && !r.value.skipped).length;
    return { fetched };
  } catch (err) {
    console.error("Live source fetch for an empty research result failed:", err.message);
    return { fetched: 0 };
  }
}

/**
 * @returns {Promise<{ fetchedNewSources: boolean, results: { chunk: object, score: number }[] }>}
 *   `results` is best first and includes below-threshold passages so the UI can show what
 *   was kept and what was dropped.
 */
export async function retrieve(queryText, { sourcesEnabled } = {}) {
  if (!ragEnabled()) throw new KnowledgeBaseUnavailableError();
  const threshold = minScore();

  let candidates = await hybridRetrieve(queryText);
  let fetchedNewSources = false;
  const hasCitableHit = candidates.some((p) => p.score >= threshold && CITABLE_CLASSES.has(p.paraClass));
  if (!hasCitableHit) {
    const { fetched } = await fetchAndIndexLiveSources(queryText);
    if (fetched > 0) {
      fetchedNewSources = true;
      candidates = await hybridRetrieve(queryText);
    }
  }

  const passages = diversifyByDocument(candidates);
  const results = passages
    .filter((p) => !sourcesEnabled || sourcesEnabled.length === 0 || sourcesEnabled.includes(p.source))
    .map((p) => ({
      score: Math.round(p.score * 100) / 100,
      chunk: {
        id: p.id,
        text: p.text,
        paragraph_class: p.paraClass,
        section_label: p.paraNumber ? `¶ ${p.paraNumber}` : null,
        document: { id: p.documentId, title: p.title, citation: p.citation, court: p.court, source: p.source, canonical_url: p.url },
      },
    }));
  return { fetchedNewSources, results };
}

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
    documentId: r.chunk.document?.id,
    documentTitle: r.chunk.document?.title,
    citation: r.chunk.document?.citation,
    court: r.chunk.document?.court,
    source: r.chunk.document?.source,
    url: r.chunk.document?.canonical_url,
  }));

  const outcome = citable.length < kept.length || discardedCount > 0 ? "partial" : "answered";
  return { outcome, segments, discardedCount, unsupportedSpanCount: 0 };
}

const OUTCOME_VALUES = ["allowed", "dismissed", "partial", "not_stated"];

const INSIGHTS_SYSTEM_PROMPT = `You help Vidhira's research library turn raw retrieved passages into something a non-lawyer can skim professionally. You will be given a search question and a numbered list of verbatim passages (one per case/document) retrieved for it.

Rules:
1. Ground every word ONLY in the numbered passages given — never add a law, fact, case name, or holding that isn't in them. If a passage is too fragmentary to say anything concrete about, write a brief honest gloss like "A procedural excerpt; doesn't state a clear holding on its own." rather than inventing substance.
2. "summary": 3-5 sentences answering the question from across ALL the passages together. Every sentence must end with the source number(s) it's based on, e.g. "...void under Section 27 [2]." Plain, simple English — short sentences, no unexplained jargon. If the passages only partially answer the question, say what they cover and stop — do not pad with speculation. Never guarantee an outcome or imply this is legal advice.
3. "glosses": for EVERY numbered passage, ONE short sentence (max ~25 words) in plain English saying what THAT specific passage says or holds — not a summary of the whole case, just that excerpt. No citation marker needed here (it's already tied to its own passage). No legal jargon left unexplained.
4. "caseCards": for EVERY numbered passage, a structured breakdown of what THAT excerpt itself shows (not the whole case if the excerpt doesn't cover it — leave a field null rather than guessing):
   - "facts": 1-2 plain sentences of what happened, if the excerpt states them, else null.
   - "issues": the legal question(s) this excerpt addresses, if stated, else null.
   - "held": what the court decided/said, if stated, else null.
   - "ratio": the reasoning/principle behind the holding, if stated, else null.
   - "outcome": one of "allowed", "dismissed", "partial", "not_stated" — ONLY "allowed"/"dismissed"/"partial" if the excerpt itself states the result; otherwise "not_stated". Never infer this from the case name or general knowledge.
   - "keyParagraph": the single most relevant sentence or two, copied VERBATIM from that passage's own text (never paraphrased, never invented) — or null if nothing stands out.
5. "relatedSearches": 3-6 short follow-up search queries (not questions to the user — queries a lawyer would type next) that a reader of this research would plausibly want to run next, grounded in what the passages actually raise (a statute mentioned but not explored, a related procedural question, etc.) — never generic/unrelated topics.

Output STRICT JSON only, no markdown fences, no commentary, matching exactly:
{ "summary": string, "glosses": [ { "index": number, "gloss": string } ], "caseCards": [ { "index": number, "facts": string|null, "issues": string|null, "held": string|null, "ratio": string|null, "outcome": "allowed"|"dismissed"|"partial"|"not_stated", "keyParagraph": string|null } ], "relatedSearches": [string] }
"glosses" and "caseCards" must each have exactly one entry per passage number given, in any order.`;

function evidenceFromSegments(segments) {
  return segments.map((s, i) => `[${i + 1}] ${s.documentTitle}\n${s.text.slice(0, 1200)}`).join("\n\n");
}

function stripCodeFence(text) {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match ? match[1].trim() : text.trim();
}

const CITE_MARKER_RE = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

// The page's promise is "every sentence is a verbatim passage with its source" — the
// per-passage glosses/caseCards already satisfy that by construction (tied 1:1 to a real
// chunkId), but the free-form "summary" is model-written prose, and a model can drop the
// citation marker rule 2 asks for, or cite a passage number that doesn't exist. This is the
// automated check: split the summary into sentences and keep only ones whose [n] marker(s)
// resolve to an actual passage in `segments` — any sentence that doesn't cite a real,
// in-range passage id is dropped rather than shown as if it were grounded.
function verifySummaryGrounding(summary, segmentCount) {
  if (!summary) return summary;
  const sentences = summary.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [summary];
  const kept = sentences.filter((sentence) => {
    const markers = [...sentence.matchAll(CITE_MARKER_RE)];
    if (markers.length === 0) return false;
    return markers.every((m) =>
      m[1]
        .split(",")
        .map((n) => Number(n.trim()))
        .every((n) => Number.isInteger(n) && n >= 1 && n <= segmentCount)
    );
  });
  return kept.length > 0 ? kept.join(" ").trim() : null;
}

/**
 * One OpenRouter call that produces a strictly-grounded overall summary, a short plain-English
 * gloss per passage, a structured per-case breakdown, and related-search suggestions — a thin,
 * clearly-labelled layer over the extractive passages, never a replacement for them (the
 * passages remain the source of truth). Returns an all-empty shape (not an error) if
 * OpenRouter isn't configured or the call/parse fails — the extractive answer underneath works
 * fine on its own, so this is a pure enhancement, and a failure here must never break the
 * research page.
 * @param {string} question
 * @param {Array<{chunkId: string, text: string, documentTitle: string}>} segments
 * @param {{language?: string}} [opts] - from detectLanguage(); "english"/"unknown" write in English.
 * @returns {Promise<{summary: string|null, glosses: Record<string,string>, caseCards: Record<string,object>, relatedSearches: string[]}>}
 */
export async function generateResearchInsights(question, segments, { language } = {}) {
  const empty = { summary: null, glosses: {}, caseCards: {}, relatedSearches: [] };
  if (!isOpenRouterConfigured() || segments.length === 0) return empty;
  try {
    const lang = language || "unknown";
    const userContent =
      `Question: ${question}\n\nPassages:\n${evidenceFromSegments(segments)}` +
      // Restated after the (English) evidence block, not just once before it — models
      // otherwise drift toward English after reading a long block of English case-law text,
      // even when told the target language up front (see legalAssistant.js's buildMessages
      // for the same fix applied to the main assistant's answer-generation prompt).
      `\n\n---\nReminder: write "summary", every "gloss", and every caseCards field (facts/issues/held/ratio/keyParagraph stays verbatim where it's a direct quote, but write the OTHER prose fields) in "${lang}" ` +
      `if that is a specific language ("english"/"unknown" means plain English) — never default to English just because the passages are in English. Case names, section numbers, and citation markers stay as-is.`;
    const raw = await chatCompletion(
      [
        { role: "system", content: INSIGHTS_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      { jsonMode: true }
    );
    const parsed = JSON.parse(stripCodeFence(raw));
    const glosses = {};
    for (const g of parsed.glosses || []) {
      const seg = segments[g.index - 1];
      if (seg && typeof g.gloss === "string" && g.gloss.trim()) glosses[seg.chunkId] = g.gloss.trim();
    }
    const caseCards = {};
    for (const c of parsed.caseCards || []) {
      const seg = segments[c.index - 1];
      if (!seg) continue;
      caseCards[seg.chunkId] = {
        facts: typeof c.facts === "string" && c.facts.trim() ? c.facts.trim() : null,
        issues: typeof c.issues === "string" && c.issues.trim() ? c.issues.trim() : null,
        held: typeof c.held === "string" && c.held.trim() ? c.held.trim() : null,
        ratio: typeof c.ratio === "string" && c.ratio.trim() ? c.ratio.trim() : null,
        outcome: OUTCOME_VALUES.includes(c.outcome) ? c.outcome : "not_stated",
        keyParagraph: typeof c.keyParagraph === "string" && c.keyParagraph.trim() ? c.keyParagraph.trim() : null,
      };
    }
    const relatedSearches = (Array.isArray(parsed.relatedSearches) ? parsed.relatedSearches : [])
      .filter((s) => typeof s === "string" && s.trim())
      .map((s) => s.trim())
      .slice(0, 6);
    const rawSummary = typeof parsed.summary === "string" ? parsed.summary.trim() || null : null;
    const summary = verifySummaryGrounding(rawSummary, segments.length);
    if (rawSummary && !summary) console.error("Research insights: generated summary had no sentence citing a real passage — dropping it.");
    return { summary, glosses, caseCards, relatedSearches };
  } catch (err) {
    console.error("Research insights generation failed, showing passages without them:", err.message);
    return empty;
  }
}

// Best-effort: one more vector search anchored on the top result's own text, excluding
// documents already represented in this report. Pure enhancement — empty on any failure,
// never blocks the report (same posture as generateResearchInsights above).
const RELATED_CASES_LIMIT = 3;

export async function findRelatedCases(topSegment, excludeDocumentIds = []) {
  if (!topSegment?.text || !ragEnabled()) return [];
  try {
    const candidates = await retrievePassages(topSegment.text.slice(0, 500), { limit: 8, threshold: null });
    const excluded = new Set(excludeDocumentIds);
    const out = [];
    for (const c of candidates) {
      if (excluded.has(c.documentId)) continue;
      excluded.add(c.documentId);
      out.push(c.documentId);
      if (out.length >= RELATED_CASES_LIMIT) break;
    }
    return out;
  } catch (err) {
    console.error("findRelatedCases failed, showing none:", err.message);
    return [];
  }
}

// Reuses the Legal Assistant's existing 6-way language/script detection (hindi/marathi/urdu/
// hinglish/marathlish/english) rather than inventing a second classifier — same cache and
// keyword-fallback behavior. Defaults to "english" on any failure; never blocks the report.
export async function detectLanguage(question) {
  try {
    const { language } = await understandQuery(question);
    return language || "english";
  } catch (err) {
    console.error("Research language detection failed, defaulting to English:", err.message);
    return "english";
  }
}

export async function resolveCitation(chunkId) {
  const { data, error } = await getSupabase().from("corpus_chunks").select("*, document:corpus_documents(*)").eq("id", chunkId).maybeSingle();
  if (error) throw error;
  return data;
}

const FOLLOWUP_SYSTEM_PROMPT = `You answer a follow-up question about a Vidhira research report. You will be given the SAME numbered passages the report was built from (never a new search — this is a closed-book question over evidence already gathered) and, if any, earlier Q&A in this same follow-up conversation.

Rules:
1. Ground every claim ONLY in the numbered passages. Never add a law, fact, case name, or holding that isn't in them.
2. If the passages don't cover what's asked, say so plainly rather than guessing — do not invent an answer to seem helpful.
3. Plain language, short sentences, no unexplained jargon. Never guarantee an outcome or imply this is legal advice.
4. "citedIndexes": every passage number actually used to support the answer, in any order.

Output STRICT JSON only, no markdown fences, no commentary, matching exactly:
{ "text": string, "citedIndexes": number[] }`;

/**
 * Follow-up chat scoped to ONE report's own evidence — no new retrieval, ever. Returns
 * { text: null, citedIndexes: [] } (not an error) if OpenRouter isn't configured or the
 * call/parse fails, so the chat box can show a plain "couldn't answer that" rather than break.
 * @param {string} question
 * @param {Array<{chunkId: string, text: string, documentTitle: string}>} segments
 * @param {{language?: string, priorTurns?: Array<{question: string, answer: {text: string|null}}>}} [opts]
 * @returns {Promise<{text: string|null, citedIndexes: number[]}>}
 */
export async function answerFollowUp(question, segments, { language, priorTurns = [] } = {}) {
  const empty = { text: null, citedIndexes: [] };
  if (!isOpenRouterConfigured() || segments.length === 0) return empty;
  try {
    const history = priorTurns.map((t, i) => `Q${i + 1}: ${t.question}\nA${i + 1}: ${t.answer?.text || ""}`).join("\n\n");
    const lang = language || "unknown";
    const userContent =
      `${history ? `Earlier in this conversation:\n${history}\n\n` : ""}Passages:\n${evidenceFromSegments(segments)}\n\nFollow-up question: ${question}` +
      `\n\n---\nReminder: write "text" in "${lang}" (if that is a specific language; "english"/"unknown" means plain English) — never default to English just because the passages are in English.`;
    const raw = await chatCompletion(
      [
        { role: "system", content: FOLLOWUP_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      { jsonMode: true }
    );
    const parsed = JSON.parse(stripCodeFence(raw));
    return {
      text: typeof parsed.text === "string" ? parsed.text.trim() || null : null,
      citedIndexes: Array.isArray(parsed.citedIndexes) ? parsed.citedIndexes.filter((n) => Number.isInteger(n)) : [],
    };
  } catch (err) {
    console.error("Research follow-up answer failed:", err.message);
    return empty;
  }
}
