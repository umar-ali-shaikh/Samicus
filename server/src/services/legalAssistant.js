// Full RAG pipeline for the conversational "AI Legal Assistant":
//
//   question -> understandQuery (Hinglish/English -> search query + emergency flag)
//            -> Indian Kanoon search
//            -> docfragment per top hit (targeted snippets, not just the search headline)
//            -> build a numbered evidence context
//            -> OpenRouter, grounded strictly in that evidence, structured JSON output
//            -> answer + citations + a fixed (non-LLM-generated) disclaimer/emergency banner
//
// The disclaimer and emergency banner are fixed strings, not LLM output — the model is
// good at reasoning over evidence, but the safety-critical "this is not legal advice" /
// "this looks urgent, call a lawyer now" framing must never depend on the model choosing
// to say it.
import { search, getFragment } from "./indianKanoon.js";
import { understandQuery } from "./legalQueryUnderstanding.js";
import { chatCompletion, OpenRouterAuthError, OpenRouterApiError } from "./openRouter.js";
import { createCache } from "../utils/cache.js";

export { OpenRouterAuthError, OpenRouterApiError };
export { IndianKanoonAuthError, IndianKanoonApiError } from "./indianKanoon.js";

const ANSWER_TTL_MS = 60 * 60 * 1000; // 1h — matches search's TTL, same staleness tradeoff
const DEFAULT_TOP_N = 5;

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

function docUrl(tid) {
  return `https://indiankanoon.org/doc/${tid}/`;
}

// Fetches a targeted snippet (docfragment) per top search hit so the model gets text
// actually relevant to the distilled query, not just whatever the search API's own
// headline happened to highlight. Falls back to the search headline per-doc on failure
// so one bad fragment call can't sink the whole request.
async function buildEvidence(distilledQuery, docs) {
  const fragments = await Promise.all(
    docs.map(async (d) => {
      try {
        const frag = await getFragment(d.tid, distilledQuery);
        const text = frag.headline || (Array.isArray(frag.headlines) ? frag.headlines.join(" … ") : "");
        return text || d.headline;
      } catch {
        return d.headline;
      }
    })
  );

  return docs.map((d, i) => ({
    index: i + 1,
    tid: d.tid,
    title: d.title,
    docsource: d.docsource,
    url: docUrl(d.tid),
    text: stripHtml(fragments[i]),
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
8. Write every field's prose in the user's own language AND SCRIPT (told to you below as "language"), even though the evidence excerpts themselves are in English — translate/paraphrase the substance rather than quoting English evidence text verbatim. Keep case names, section numbers, and citation markers like [1] as-is (don't translate proper nouns or numbers). The language value tells you the exact script to use:
   - "hindi" -> write in Devanagari script (हिंदी में), not Romanized.
   - "hinglish" -> write in Romanized Hindi/Hindi-English code-mix (Latin letters, e.g. "aapko turant vakil se milna chahiye"), NOT Devanagari — a Hinglish-speaking user reads Roman letters, not Devanagari.
   - "english" -> write in English.
   - "unknown" -> default to English.

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

    const { docs } = await search(understanding.searchQuery, filters, 0, 1);
    const top = (docs || []).slice(0, topN);

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
    try {
      const parsed = JSON.parse(stripCodeFence(raw));
      sections = { ...emptyAnswerShape(), ...parsed };
    } catch {
      outcome = "unparsed";
      rawAnswer = raw;
      sections = { ...emptyAnswerShape(), hasSufficientEvidence: true, generalInformation: raw };
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
