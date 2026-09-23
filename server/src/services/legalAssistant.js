// Full RAG pipeline for the conversational "AI Legal Assistant":
//
//   question -> understandQuery (Hinglish/English -> search query + emergency flag)
//            -> Indian Kanoon search (general + doctypes:laws)
//            -> relevance re-rank of the candidates (Gemini embeddings if configured,
//               else local TF-IDF — see services/relevanceRanking.js)
//            -> full document text per top hit (docfragment snippet as a fallback if
//               the full-document fetch fails or comes back empty)
//            -> build a numbered evidence context
//            -> OpenRouter, grounded strictly in that evidence, structured JSON output
//            -> answer + citations + a fixed (non-LLM-generated) disclaimer/emergency banner
//
// The disclaimer and emergency banner are fixed strings, not LLM output — the model is
// good at reasoning over evidence, but the safety-critical "this is not legal advice" /
// "this looks urgent, call a lawyer now" framing must never depend on the model choosing
// to say it.
import { z } from "zod";
import { search, getDocument, getFragment } from "./indianKanoon.js";
import { understandQuery } from "./legalQueryUnderstanding.js";
import { chatCompletion, OpenRouterAuthError, OpenRouterApiError } from "./openRouter.js";
import { createCache } from "../utils/cache.js";
import { rankRelevantDocs } from "./relevanceRanking.js";

export { OpenRouterAuthError, OpenRouterApiError };
export { IndianKanoonAuthError, IndianKanoonApiError } from "./indianKanoon.js";

const ANSWER_TTL_MS = 60 * 60 * 1000; // 1h — matches search's TTL, same staleness tradeoff
const DEFAULT_TOP_N = 5;
// Plain search skews toward judgments (case law), so a purely procedural question
// ("what to do after an FIR") often surfaces tangential cases that merely mention the
// term instead of the actual CrPC/statute provisions that answer it. `doctypes:laws`
// is Indian Kanoon's aggregator for Central Acts and Rules — running it as a second,
// parallel search and giving its hits priority ensures statutory text gets a chance to
// show up even when it wouldn't rank in the general judgment-heavy result set.
const LAWS_TOP_N = 2;

const cache = createCache();

export const DISCLAIMER =
  "This is general legal information for education and research purposes, generated only from the Indian Kanoon sources listed below — it is not legal advice from a lawyer, it does not create a lawyer-client relationship, and it cannot guarantee any outcome. For anything serious, urgent, criminal, financial, family, property, or litigation-related, please consult a qualified Indian lawyer.";

const EMERGENCY_MESSAGE =
  "This looks like it may be a time-sensitive or urgent situation (for example: an arrest, being in custody, an FIR just filed, an immediate threat, or a court deadline in the next day or two). Please contact a qualified lawyer, a legal aid service, or the relevant authority (police / court) immediately — do not rely only on this tool.";

const INSUFFICIENT_EVIDENCE_NOTE =
  "The available Indian Kanoon sources found for this question are insufficient to ground a reliable answer. Try rephrasing with more specific legal terms (e.g. the relevant Act/Section, or more concrete facts), or consult a qualified Indian lawyer for guidance specific to your situation.";

function stripHtml(html) {
  return (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function stripCodeFence(text) {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match ? match[1].trim() : text.trim();
}

// Free models don't always honour jsonMode strictly — some wrap the object in a
// sentence ("Here's the answer: {...}") or add trailing commentary after it, which
// breaks a direct JSON.parse even though a valid object is in there. Try the strict
// parse first, then fall back to the outermost {...} span before giving up.
function extractJson(raw) {
  const fenced = stripCodeFence(raw);
  try {
    return JSON.parse(fenced);
  } catch {
    const start = fenced.indexOf("{");
    const end = fenced.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("No JSON object found in model output");
    return JSON.parse(fenced.slice(start, end + 1));
  }
}

const CONTENT_FIELDS = ["statute", "judgments", "interpretation", "generalInformation", "practicalNextSteps", "insufficiencyNote"];

// Last-resort recovery when the object as a whole won't parse at all — e.g. a stray
// character right after the opening brace (observed in production:
// `{":hasSufficientEvidence":false, "statute":null, ...}`, a `:` glitch before the
// first key) breaks JSON.parse on the *entire* object even though every individual
// "field":"value" pair the model wrote is perfectly well-formed. Rather than throw away
// good, structured, cited content because ONE character elsewhere is broken, pull out
// whatever fields match on their own. Returns null (not an empty object) if nothing
// usable was found, so callers can tell "salvage found real content" apart from
// "there was nothing to salvage" — the latter must still fall through to the raw-text
// fallback, not silently produce an all-null answer.
function salvageFields(text) {
  const result = {};
  let matchedAny = false;
  for (const field of CONTENT_FIELDS) {
    const match = text.match(new RegExp(`"${field}"\\s*:\\s*(null|"(?:[^"\\\\]|\\\\.)*")`));
    if (!match) continue;
    matchedAny = true;
    result[field] = match[1] === "null" ? null : JSON.parse(match[1]);
  }
  if (!matchedAny) return null;

  // Tolerant of the exact glitch above: doesn't require a leading quote before the key.
  const hasSufficientEvidenceMatch = text.match(/hasSufficientEvidence"\s*:\s*(true|false)/);
  result.hasSufficientEvidence = hasSufficientEvidenceMatch
    ? hasSufficientEvidenceMatch[1] === "true"
    : Object.values(result).some(Boolean);
  return result;
}

function docUrl(tid) {
  return `https://indiankanoon.org/doc/${tid}/`;
}

// Caps how much of one document's full text goes into the evidence context — full
// judgments can run tens of thousands of words, and this pipeline sends up to
// DEFAULT_TOP_N documents in a single prompt to free-tier models with limited context
// windows. ~3000 chars (~750 tokens) per source keeps a 5-source bundle affordable.
const DOC_TEXT_CHAR_LIMIT = 3000;

// Fetches the full document text per top search hit (grounds the model in the actual
// statute/judgment, not just a search headline) and falls back to a targeted snippet
// (docfragment) — then the raw search headline — if the full-document fetch fails or
// comes back empty, so one bad Indian Kanoon call can't sink the whole request.
async function fetchEvidenceText(d, distilledQuery) {
  try {
    const full = await getDocument(d.tid);
    const text = stripHtml(full.doc);
    if (text) return text.slice(0, DOC_TEXT_CHAR_LIMIT);
  } catch {
    // fall through to the cheaper fragment call below
  }
  try {
    const frag = await getFragment(d.tid, distilledQuery);
    const text = frag.headline || (Array.isArray(frag.headlines) ? frag.headlines.join(" … ") : "");
    return stripHtml(text) || d.headline;
  } catch {
    return d.headline;
  }
}

async function buildEvidence(distilledQuery, docs) {
  const texts = await Promise.all(docs.map((d) => fetchEvidenceText(d, distilledQuery)));

  return docs.map((d, i) => ({
    index: i + 1,
    tid: d.tid,
    title: d.title,
    docsource: d.docsource,
    url: docUrl(d.tid),
    text: texts[i],
  }));
}

const SYSTEM_PROMPT = `You are an AI legal research assistant for Indian law, embedded in a legal-services platform. You are NOT a lawyer, and you must never imply that you are one.

You will be given a user's legal question and a numbered list of evidence excerpts retrieved from Indian Kanoon (real Indian statutes, bare acts, and court judgments). Follow these rules strictly:

1. Ground every substantive claim ONLY in the numbered evidence provided. Never use outside knowledge to state a law, section number, case name, citation, date, or court holding that is not present in the evidence.
2. Never invent or guess at a law, section, judgment, case name, citation, date, or court decision. If the evidence doesn't contain it, do not mention it.
3. Never fabricate or embellish an Indian Kanoon source. Cite evidence inline using its number, like [1] or [2], and only cite numbers that were actually given to you.
4. Never guarantee a legal outcome (e.g. never say "you will win" or "the court will rule in your favor"). Describe what the law/precedent says, not what will happen to the user.
5. Never present an unsupported legal conclusion as settled fact — if the evidence is ambiguous, thin, or only partially on point, say so.
6. Refuse to help with evading police/legal process, destroying evidence, intimidating witnesses, committing fraud, or any other unlawful act — instead, redirect toward lawful remedies and recommend consulting a lawyer.
7. You are not answering with a single blob of prose — you must separate your answer into distinct categories (see output format below), and leave a category null/empty if the evidence doesn't support anything for it. Do not pad a category with speculation just to fill it.
8. Write every field's prose in the user's own language AND SCRIPT (told to you below as "language"), even though the evidence excerpts themselves are in English — translate/paraphrase the substance rather than quoting English evidence text verbatim. Keep case names, section numbers, and citation markers like [1] as-is (don't translate proper nouns or numbers). The language value tells you the exact language and script to use, and compliance is STRICT — never mix languages or scripts within a single field or across fields:
   - "hindi" -> write in Hindi, Devanagari script (हिंदी में) ONLY. Not Romanized, not mixed with Latin letters (except case names, section numbers, [n] citation markers, and untranslatable English legal terms like "FIR").
   - "marathi" -> write in Marathi, Devanagari script (मराठीत) ONLY — Marathi vocabulary/grammar, not Hindi. Not Romanized, not mixed with Latin letters (except case names, section numbers, [n] citation markers, and untranslatable English legal terms like "FIR").
   - "urdu" -> write in Urdu, Perso-Arabic (Nastaliq) script (اردو میں) ONLY. Not Romanized, not Devanagari.
   - "hinglish" -> write the Hindi meaning strictly in Roman/English letters (Latin script) ONLY, e.g. "aapko turant vakil se milna chahiye" — the Devanagari script (देवनागरी) is FORBIDDEN for this value, including for single words or headings. Do not slip into Devanagari even briefly. A Hinglish-speaking user reads Roman letters only.
   - "marathlish" -> write the Marathi meaning strictly in Roman/English letters (Latin script) ONLY, e.g. "tumhi lagech vakilana bhetla pahije" — Marathi vocabulary/grammar in Latin script, not Hindi's. The Devanagari script (देवनागरी) is FORBIDDEN for this value, including for single words or headings.
   - "english" -> write in English.
   - "unknown" -> default to English.
   Before finalizing each field, re-check every character against this rule — a field is non-compliant if it contains even one Devanagari character while language is "hinglish" or "marathlish", any Romanized sentence while language is "hindi"/"marathi"/"urdu", Hindi vocabulary while language is "marathi"/"marathlish", or any Devanagari/Latin character while language is "urdu".

Output STRICT JSON only (no markdown fences, no commentary before or after), matching exactly this shape:
{
  "hasSufficientEvidence": boolean,
  "statute": string|null,
  "judgments": string|null,
  "interpretation": string|null,
  "generalInformation": string|null,
  "practicalNextSteps": string|null,
  "insufficiencyNote": string|null
}

Field meanings:
- statute: what a relevant Act/Section says, per the evidence, if any evidence is a bare act/statute. Quote/paraphrase with [n] citations. Null if no statutory evidence was given.
- judgments: what relevant court judgment(s) in the evidence held or reasoned, with [n] citations. Null if no judgment evidence was given.
- interpretation: your grounded legal interpretation of how the statute/judgments in the evidence apply to the user's situation — clearly framed as interpretation, not a guaranteed outcome. Null if there isn't enough evidence to interpret.
- generalInformation: general procedural/background information relevant to the question (e.g. "an FIR is normally filed at..."), grounded in evidence where possible. Null if not applicable.
- practicalNextSteps: concrete, lawful next steps the user could consider (e.g. send a legal notice, file a complaint, consult a lawyer for X). Always include "consult a qualified Indian lawyer" as a step for anything serious, urgent, criminal, financial, family, property, or litigation-related.
- insufficiencyNote: if hasSufficientEvidence is false, explain plainly what's missing/why the evidence doesn't support a full answer. Null if hasSufficientEvidence is true.

Set hasSufficientEvidence to false rather than guessing whenever the evidence doesn't meaningfully address the question.`;

function buildMessages(question, topic, evidence, language) {
  const context = evidence.map((e) => `[${e.index}] ${e.title} (${e.docsource})\n${e.text}`).join("\n\n");
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `User question (topic: ${topic}, language: ${language || "unknown"}): ${question}\n\nEvidence:\n${context}`,
    },
  ];
}

function emptyAnswerShape() {
  return { hasSufficientEvidence: false, statute: null, judgments: null, interpretation: null, generalInformation: null, practicalNextSteps: null, insufficiencyNote: null };
}

// Enforces the six-field answer contract the SYSTEM_PROMPT asks for — a model can
// return syntactically valid JSON that's still the wrong shape (e.g. hasSufficientEvidence
// as the string "true", or a field as a number). Schema failure routes into the same
// "unparsed" fallback as a JSON.parse failure, so the API never hands out sections that
// don't match the documented type.
const AnswerSchema = z.object({
  hasSufficientEvidence: z.boolean(),
  statute: z.string().nullable().optional(),
  judgments: z.string().nullable().optional(),
  interpretation: z.string().nullable().optional(),
  generalInformation: z.string().nullable().optional(),
  practicalNextSteps: z.string().nullable().optional(),
  insufficiencyNote: z.string().nullable().optional(),
});

/**
 * @param {string} question - raw user question, any language/register.
 * @param {import("./indianKanoonFilters.js").CaseLawFilters} [filters]
 * @param {number} [topN=5]
 * @returns {Promise<{
 *   outcome: "no_evidence"|"answered"|"unparsed",
 *   understanding: {searchQuery: string, topic: string, language: string},
 *   emergency: {flag: boolean, reason: string|null, message: string|null},
 *   sections: {hasSufficientEvidence: boolean, statute: string|null, judgments: string|null, interpretation: string|null, generalInformation: string|null, practicalNextSteps: string|null, insufficiencyNote: string|null},
 *   rawAnswer: string|null,
 *   sources: Array<{tid: number, title: string, docsource: string, url: string}>,
 *   disclaimer: string
 * }>}
 */
export async function answerLegalQuestion(question, filters = {}, topN = DEFAULT_TOP_N) {
  const cacheKey = `legal-assistant:${question}:${JSON.stringify(filters)}:${topN}`;

  return cache.getOrSet(cacheKey, ANSWER_TTL_MS, async () => {
    const understanding = await understandQuery(question);
    const emergency = {
      flag: understanding.isEmergency,
      reason: understanding.emergencyReason,
      message: understanding.isEmergency ? EMERGENCY_MESSAGE : null,
    };

    const [{ docs }, lawsResult] = await Promise.all([
      search(understanding.searchQuery, filters, 0, 1),
      // Best-effort: a real auth/token problem will also surface via the call above
      // (same token, same failure mode), so a failure here is safe to swallow rather
      // than sinking the whole request over an enhancement search.
      search(understanding.searchQuery, { ...filters, court: "laws" }, 0, 1).catch(() => ({ docs: [] })),
    ]);

    // Score each candidate pool by relevance to the query — Gemini embeddings when
    // GEMINI_API_KEY is configured (a real semantic match, which catches a
    // paraphrased/conversational question that shares no exact keywords with the
    // right statute/judgment), local TF-IDF otherwise (see relevanceRanking.js) — and
    // drop anything judged unrelated rather than forcing it in. Indian Kanoon's own
    // search (especially doctypes:laws, a much smaller corpus than case law) can
    // return a hit that shares nothing with the actual question just because it was
    // the closest thing available; blindly taking the top LAWS_TOP_N/topN regardless
    // of relevance forces unrelated Acts/cases into the evidence, which the model then
    // has to cite around and which misleads the user into thinking they're "the"
    // sources. Fewer, genuinely relevant sources (even zero, which falls through to
    // no_evidence below) beats padding with noise.
    const docText = (d) => `${d.title} ${stripHtml(d.headline)}`;
    const [rankedLaw, rankedGeneral] = await Promise.all([
      rankRelevantDocs(understanding.searchQuery, lawsResult.docs || [], docText),
      rankRelevantDocs(understanding.searchQuery, docs || [], docText),
    ]);

    const lawDocs = rankedLaw.map((x) => x.item).slice(0, LAWS_TOP_N);
    const lawTids = new Set(lawDocs.map((d) => d.tid));
    const generalDocs = rankedGeneral.map((x) => x.item).filter((d) => !lawTids.has(d.tid));
    const top = [...lawDocs, ...generalDocs].slice(0, topN);

    if (top.length === 0) {
      return {
        outcome: "no_evidence",
        understanding: { searchQuery: understanding.searchQuery, topic: understanding.topic, language: understanding.language },
        emergency,
        sections: { ...emptyAnswerShape(), insufficiencyNote: INSUFFICIENT_EVIDENCE_NOTE },
        rawAnswer: null,
        sources: [],
        disclaimer: DISCLAIMER,
      };
    }

    const evidence = await buildEvidence(understanding.searchQuery, top);
    const raw = await chatCompletion(buildMessages(question, understanding.topic, evidence, understanding.language), { jsonMode: true });

    let sections;
    let outcome = "answered";
    let rawAnswer = null;

    let candidate = null;
    try {
      candidate = extractJson(raw);
    } catch {
      candidate = null;
    }
    let validated = candidate !== null ? AnswerSchema.safeParse(candidate) : null;

    if (!validated?.success) {
      // The object as a whole didn't parse — try salvaging individual well-formed
      // fields before giving up entirely (see salvageFields' doc comment for why).
      const salvaged = salvageFields(raw);
      validated = salvaged ? AnswerSchema.safeParse(salvaged) : null;
    }

    if (validated?.success) {
      sections = { ...emptyAnswerShape(), ...validated.data };
    } else {
      outcome = "unparsed";
      rawAnswer = raw;
      const cleanRaw = raw.trim();
      // Never show the user raw JSON-looking text (curly braces, "key":"value" noise)
      // that neither parse attempt nor salvage could make sense of — that's confusing,
      // not informative. Genuine unstructured prose (a model that just answered in
      // plain sentences instead of JSON) is still shown as-is; only text that still
      // looks like broken JSON syntax gets suppressed.
      const looksLikeBrokenJson = cleanRaw.startsWith("{") || /"[a-zA-Z]+"\s*:/.test(cleanRaw);
      sections = {
        ...emptyAnswerShape(),
        hasSufficientEvidence: true,
        generalInformation: looksLikeBrokenJson ? null : cleanRaw || null,
      };
    }

    return {
      outcome,
      understanding: { searchQuery: understanding.searchQuery, topic: understanding.topic, language: understanding.language },
      emergency,
      sections,
      rawAnswer,
      sources: evidence.map((e) => ({ tid: e.tid, title: e.title, docsource: e.docsource, url: e.url })),
      disclaimer: DISCLAIMER,
    };
  });
}

// Test-only: clears the module-level cache so tests don't leak state into each other.
export function __resetCacheForTests() {
  cache.clear();
}
