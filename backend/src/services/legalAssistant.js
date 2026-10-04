// Full RAG pipeline for "Vidhira", the conversational AI Legal Assistant.
//
// Flow (strict order — each stage only runs if the one before it wasn't enough):
//
//   question
//     │
//     ▼
//   [1] understand          Hinglish/English -> search query, topic, language, emergency flag
//     │
//     ▼
//   [2] searchRag           Qdrant + corpus_documents/corpus_chunks — confident? skip to [5]
//     │  (not confident)
//     ▼
//   [3] searchIndianKanoon  live search (bare acts + case law), relevance re-ranked
//     │  (still thin: rag + IK evidence < MIN_EVIDENCE_TO_SKIP_WEB)
//     ▼
//   [4] searchTavily        trusted-domain web search — procedure/helplines/forms/time limits
//     │
//     ▼
//   [5] buildEvidence -> generateAnswer   one numbered, origin-labelled evidence list -> OpenRouter,
//     │                                   grounded strictly in that evidence, structured JSON output
//     ▼
//   response to the user (sections + sources + fixed disclaimer/emergency banner)
//     │
//     ▼ (fire-and-forget, never blocks the response above)
//   [6] learnIntoRag        ingest IK/web docs actually used into corpus_documents/corpus_chunks + Qdrant
//
// The disclaimer and emergency banner are fixed strings, not LLM output — the model is
// good at reasoning over evidence, but the safety-critical "this is not legal advice" /
// "this looks urgent, call a lawyer now" framing must never depend on the model choosing
// to say it.
import { z } from "zod";
import { search, getDocument, getDocumentRaw, getFragment } from "./indianKanoon.js";
import { understandQuery } from "./legalQueryUnderstanding.js";
import { chatCompletion, OpenRouterAuthError, OpenRouterApiError } from "./openRouter.js";
import { createCache } from "../utils/cache.js";
import { rankRelevantDocs } from "./relevanceRanking.js";
import { ragEnabled, ingestIndianKanoonDoc, ingestWebDoc } from "./rag/ingest.js";
import { retrievePassages } from "./rag/retrieve.js";
import { searchTavily as callTavily, isTavilyConfigured } from "./tavily.js";

export { OpenRouterAuthError, OpenRouterApiError };
export { IndianKanoonAuthError, IndianKanoonApiError } from "./indianKanoon.js";

const APP_NAME = "Vidhira";

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
  "This is general legal information to help you understand your situation, generated only from the Indian Kanoon sources listed below — it is not legal advice from a lawyer, it does not create a lawyer-client relationship, and it cannot guarantee any outcome. For anything serious, urgent, criminal, financial, family, property, or litigation-related, please consult a qualified Indian lawyer.";

const EMERGENCY_MESSAGE =
  "This looks like it may be a time-sensitive or urgent situation (for example: an arrest, being in custody, an FIR just filed, an immediate threat, or a court deadline in the next day or two). Please contact a qualified lawyer, a legal aid service, or the relevant authority (police / court) immediately — do not rely only on this tool.";

const INSUFFICIENT_EVIDENCE_NOTE =
  "The available sources found for this question are insufficient to ground a reliable answer. Try rephrasing with more specific legal terms (e.g. the relevant Act/Section, or more concrete facts), or consult a qualified Indian lawyer for guidance specific to your situation.";

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

// Only the top-level scalar fields are worth regex-salvaging — unlike the old flat
// string-only schema, most of this schema's fields are arrays/objects, and reliably
// repairing a broken nested array via regex isn't practical. Scalars (summary,
// confidence) are the highest-value thing to recover; if salvage can't do better,
// the rest of the shape degrades gracefully to empty arrays via emptyAnswerShape().
const CONTENT_FIELDS = ["summary", "confidence"];

// Last-resort recovery when the object as a whole won't parse at all — e.g. a stray
// character right after the opening brace (observed in production:
// `{":hasSufficientEvidence":false, "statute":null, ...}`, a `:` glitch before the
// first key) breaks JSON.parse on the *entire* object even though every individual
// "field":"value" pair the model wrote is perfectly well-formed. Returns null (not an
// empty object) if nothing usable was found, so callers can tell "salvage found real
// content" apart from "there was nothing to salvage" — the latter must still fall
// through to the raw-text fallback, not silently produce an all-null answer.
function salvageFields(text) {
  const result = {};
  let matchedAny = false;
  for (const field of CONTENT_FIELDS) {
    const match = text.match(new RegExp(`"${field}"\\s*:\\s*(null|"(?:[^"\\\\]|\\\\.)*")`));
    if (!match) continue;
    matchedAny = true;
    result[field] = match[1] === "null" ? null : JSON.parse(match[1]);
  }
  return matchedAny ? result : null;
}

function docUrl(tid) {
  return `https://indiankanoon.org/doc/${tid}/`;
}

// Caps how much of one document's full text goes into the evidence context — full
// judgments can run tens of thousands of words, and this pipeline sends up to
// DEFAULT_TOP_N documents in a single prompt to free-tier models with limited context
// windows. ~3000 chars (~750 tokens) per source keeps a 5-source bundle affordable.
const DOC_TEXT_CHAR_LIMIT = 3000;
const WEB_TEXT_CHAR_LIMIT = 2000;

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

// IK search hits -> evidence items (no `index` yet — buildEvidence assigns that once
// every origin — rag/indian_kanoon/web — has been merged into one list).
async function indianKanoonDocsToEvidence(distilledQuery, docs) {
  if (docs.length === 0) return [];
  const texts = await Promise.all(docs.map((d) => fetchEvidenceText(d, distilledQuery)));
  return docs.map((d, i) => ({ tid: d.tid, title: d.title, docsource: d.docsource, url: docUrl(d.tid), text: texts[i], sourceType: "indian_kanoon" }));
}

// ---- Stage 2 constants: Qdrant knowledge-base (RAG) -------------------------------------
// Passages the knowledge base returns with at least this score are trusted enough to answer
// from without paying for a live Indian Kanoon search. As the KB grows with usage, more
// questions are served from it (cheaper and faster).
const CONFIDENT_SCORE = Number(process.env.RAG_SKIP_LIVE_SEARCH_SCORE) || 0.72;
const CONFIDENT_MIN_PASSAGES = Number(process.env.RAG_SKIP_LIVE_MIN_PASSAGES) || 3;
const MAX_PASSAGES = 8;
const MAX_NEW_DOCS_PER_QUESTION = 4;
const PASSAGE_CHAR_LIMIT = 1600;
const PARA_LABEL = {
  provision: "statutory provision",
  facts: "facts of the case",
  issues: "issue before the court",
  petitioner_arguments: "petitioner's argument (not the court's view)",
  respondent_arguments: "respondent's argument (not the court's view)",
  reasoning: "court's reasoning",
  holding: "court's holding/conclusion",
  directions: "court's directions",
};

function tidFromExternalId(externalId) {
  const m = /^ik:(\d+)$/.exec(externalId || "");
  return m ? Number(m[1]) : null;
}

// Qdrant passages -> evidence items (no `index` yet — see indianKanoonDocsToEvidence above).
function passagesToEvidence(passages) {
  return passages.slice(0, MAX_PASSAGES).map((p) => ({
    tid: tidFromExternalId(p.externalId),
    title: p.title,
    docsource: p.court || p.source,
    url: p.url,
    text: `[${PARA_LABEL[p.paraClass] || p.paraClass}] ${p.text.slice(0, PASSAGE_CHAR_LIMIT)}`,
    sourceType: "rag",
  }));
}

function webResultsToEvidence(results) {
  return results.map((r) => {
    let host = "web";
    try {
      host = new URL(r.url).hostname.replace(/^www\./, "");
    } catch {
      // malformed URL from the web API — keep the generic "web" label rather than throwing
    }
    return { tid: null, title: r.title || host, docsource: host, url: r.url, text: r.content.slice(0, WEB_TEXT_CHAR_LIMIT), sourceType: "web" };
  });
}

const SYSTEM_PROMPT = `You are "${APP_NAME}", an AI legal-information assistant for India, embedded in a legal-services platform. You are NOT a lawyer, and you must never imply that you are one.

You will be given a user's legal question and a numbered list of evidence excerpts — retrieved from Indian Kanoon (real Indian statutes, bare acts, and court judgments) and, where noted, trusted government/legal-aid web pages. Follow these rules strictly:

1. Ground every substantive claim ONLY in the numbered evidence provided. Never use outside knowledge to state a law, section number, case name, citation, date, or court holding that is not present in the evidence.
2. Never invent or guess at a law, section, judgment, case name, citation, date, or court decision. If the evidence doesn't contain it, do not mention it.
3. Every item in applicableLaws, caseLaw, yourRights, immediateActions and stepByStep that states a law, section, right, citation, or legal consequence must carry a sourceId (or sourceIds) that is one of the evidence numbers given to you below (e.g. "1" or "2") — never cite a number that wasn't actually given to you, and never leave a legal claim without one. The one exception is generic practical safety cautions (see rule 7d) — those don't state a law, so no sourceId is needed for them.
4. Never guarantee a legal outcome (e.g. never say "you will win" or "the court will rule in your favor"). Describe what the law/precedent says, not what will happen to the user.
5. Never present an unsupported legal conclusion as settled fact — if the evidence is ambiguous, thin, or only partially on point, say so plainly in "gaps" rather than inventing specificity to fill a gap.
6. Refuse to help with evading police/legal process, destroying evidence, intimidating witnesses, committing fraud, or any other unlawful act — instead, redirect toward lawful remedies and recommend consulting a lawyer.
7. Leave an array empty if the evidence doesn't support anything for it. Do not pad an array with speculation just to fill it.
7a. For anything serious, criminal, or time-bound, never say or imply the user does not need a lawyer. Frame it as "you need a lawyer, and here is how to deal with one safely" rather than downplaying it.
7b. Never promise or guarantee an outcome, and never frighten the user. Use measured language ("the law generally says", "courts have generally held") — never "you will win" or "this will definitely happen to you".
7c. Never suggest confronting, threatening, arguing with, or resisting police or other officials. When the situation involves an official, the lawful posture is: stay polite, state the right calmly, ask for the reason/order in writing, and call a lawyer — phrase stepByStep/yourRights this way.
7d. Where the situation makes it relevant, include well-known, generic safety cautions as stepByStep items even without a citable source — e.g. don't sign a blank or unread document, don't hand over original documents, don't pay unreceipted "settlement" or "fees" in cash, don't delete messages/evidence related to the matter, don't ignore a notice or summons. These are practical cautions, not legal claims, so they do not need a sourceId — but never state a law, section, or legal consequence without one (rule 3 still applies to every legal claim).
7e. Say "consult/get a lawyer" ONCE in the entire response — as the one stepByStep item rule 7a/the stepByStep field meaning requires — and nowhere else. Do not also put a lawyer-consultation item in immediateActions, yourRights, or whereToGetHelp just to repeat it; a user who has already been told once does not need to read it four more times. Use the space in those other fields for the SPECIFIC, SUBSTANTIVE content they're meant to hold instead (see their field meanings below) — what this person can actually do, what rights they specifically have, where else (beyond a private lawyer) they can go. The one exception: whereToGetHelp MAY list a free/low-cost legal aid body (e.g. a District/State Legal Services Authority, NALSA) if the evidence names one — that is substantive help-finding information, not a repeat of "get a lawyer".
8. Write every field's prose in the user's own language AND SCRIPT (told to you below as "language"), even though the evidence excerpts themselves are in English — translate/paraphrase the substance rather than quoting English evidence text verbatim. Keep case names, section numbers, and citation markers as-is (don't translate proper nouns or numbers). The language value tells you the exact language and script to use, and compliance is STRICT — never mix languages or scripts within a single field or across fields:
   - "hindi" -> write in Hindi, Devanagari script (हिंदी में) ONLY. Not Romanized, not mixed with Latin letters (except case names, section numbers, and untranslatable English legal terms like "FIR").
   - "marathi" -> write in Marathi, Devanagari script (मराठीत) ONLY — Marathi vocabulary/grammar, not Hindi. Not Romanized, not mixed with Latin letters (except case names, section numbers, and untranslatable English legal terms like "FIR").
   - "urdu" -> write in Urdu, Perso-Arabic (Nastaliq) script (اردو میں) ONLY. Not Romanized, not Devanagari.
   - "hinglish" -> write the Hindi meaning strictly in Roman/English letters (Latin script) ONLY, e.g. "aapko turant vakil se milna chahiye" — the Devanagari script (देवनागरी) is FORBIDDEN for this value, including for single words or headings. Do not slip into Devanagari even briefly. A Hinglish-speaking user reads Roman letters only.
   - "marathlish" -> write the Marathi meaning strictly in Roman/English letters (Latin script) ONLY, e.g. "tumhi lagech vakilana bhetla pahije" — Marathi vocabulary/grammar in Latin script, not Hindi's. The Devanagari script (देवनागरी) is FORBIDDEN for this value, including for single words or headings.
   - "english" -> write in English.
   - "unknown" -> default to English.
   Before finalizing each field, re-check every character against this rule — a field is non-compliant if it contains even one Devanagari character while language is "hinglish" or "marathlish", any Romanized sentence while language is "hindi"/"marathi"/"urdu", Hindi vocabulary while language is "marathi"/"marathlish", or any Devanagari/Latin character while language is "urdu".
8a. Write for someone with little or no formal education and no legal background — e.g. a daily-wage worker, a small shopkeeper, a student, a first-time reader of a legal document. In EVERY field (not just immediateActions/stepByStep): use the simplest everyday words a non-lawyer uses in daily conversation, one idea per sentence, no sentence longer than about 15-20 words, no legal jargon, no complex or formal sentence structure, no passive voice where active voice is simpler. If an unavoidable term appears (FIR, vakil, thana, chalan, section, affidavit, etc.), explain what it means in 3-5 plain words right in the same sentence the first time it appears. Prefer concrete, specific action ("police station jaakar likhit shikayat do") over vague/formal phrasing ("appropriate authorities must be approached"). This applies to applicableLaws.plainMeaning and caseLaw.whatItMeansForYou too — explain what the law/judgment means for THIS person's situation in plain words, not a legal summary.

Output STRICT JSON only (no markdown fences, no commentary before or after), matching exactly this shape:
{
  "summary": string,
  "immediateActions": [ { "step": string, "why": string, "sourceIds": [string] } ],
  "stepByStep": [ { "order": number, "action": string, "where": string|null, "documentsNeeded": [string], "timeLimit": string|null, "sourceIds": [string] } ],
  "yourRights": [ { "right": string, "sourceIds": [string] } ],
  "applicableLaws": [ { "act": string, "section": string|null, "plainMeaning": string, "sourceId": string } ],
  "caseLaw": [ { "caseName": string, "court": string|null, "year": string|null, "whatItMeansForYou": string, "sourceId": string } ],
  "whereToGetHelp": [ { "name": string, "contact": string|null, "whenToUse": string, "sourceIds": [string] } ],
  "gaps": [string],
  "followUpQuestions": [string],
  "confidence": "high" | "medium" | "low"
}

Field meanings:
- summary: 2-3 sentences — what the situation is legally and the bottom line. Null only if the evidence supports nothing at all.
- immediateActions: the most urgent action(s) first, each with why it matters and its sourceIds — SPECIFIC to this person's situation (e.g. "ask for a written copy of the FIR/notice", "note down the FIR number, police station, and officer's name"), not a restatement of "get a lawyer" (that belongs in stepByStep only, per rule 7e). Empty if nothing is urgent.
- stepByStep: concrete, lawful next steps in order (1, 2, 3...), each with where to go, documents needed, and any time limit, grounded in evidence where possible, plus generic safety cautions per rule 7d where relevant. Exactly ONE step (anywhere in the order, wherever it naturally fits — not necessarily first) consults a qualified Indian lawyer for anything serious, urgent, criminal, financial, family, property, or litigation-related — phrase it as needing a lawyer and getting one safely (ask for the fee in writing, take a receipt for every payment, a genuine lawyer never guarantees an outcome or asks for money to pay off police/a judge, ask for a copy of every document filed and the case number/next date), never as optional. Every OTHER step must be a distinct, substantive action grounded in the evidence (e.g. the actual procedure for anticipatory bail, what an FIR-quashing petition needs, what to do at the police station) — not a second way of saying "talk to a lawyer".
- yourRights: the SPECIFIC legal rights this person has in this situation, per the evidence (e.g. right to know the grounds of arrest, right against self-incrimination, right to be produced before a magistrate within 24 hours, right to apply for bail/anticipatory bail, right to free legal aid if they cannot afford a lawyer) — not a generic "right to consult a lawyer" entry (that belongs in stepByStep only, per rule 7e).
- applicableLaws: the relevant Act/Section(s) and what they mean in plain words, per the evidence.
- caseLaw: AT MOST the 2-3 judgments in the evidence most directly on point for the user's exact situation — never list every case that merely appears in the evidence. Pick the ones that best match the facts asked about; drop the rest, even if they're relevant to the general topic.
- whereToGetHelp: contacts/services relevant to this situation found in the evidence (e.g. a forum/authority named in a statute, or a web result's helpline/portal) — do not invent phone numbers or organisations not present in the evidence.
- gaps: ONLY facts about the user's own situation that are missing and would change the advice (e.g. "whether a charge sheet has been filed", "whether you are named in the FIR") — these belong here, not in followUpQuestions AND gaps both. Do NOT use gaps to hedge on well-established law that IS in the evidence (a section number, what it covers, a settled principle) — if the evidence states it, say it plainly and confidently in applicableLaws/stepByStep/yourRights instead of disclaiming it here. Do NOT pad gaps with "the evidence doesn't give the full judgment text" or similar meta-commentary about the evidence itself — only missing facts about the user's situation belong here. Keep this to at most 2-3 items. Empty is normal and fine, not a failure.
- followUpQuestions: max 3 questions whose answers would materially change the advice.
- confidence: "high" only if every applicableLaws item is backed by evidence actually given above; "low" if gaps contains anything central to the question; "medium" otherwise.

Empty arrays are allowed; invented content is not.`;

function buildMessages(question, topic, evidence, language, isEmergency) {
  const context = evidence.map((e) => `[${e.index}] ${e.title} (${e.docsource})\n${e.text}`).join("\n\n");
  const urgency = isEmergency ? "emergency" : "normal";
  const lang = language || "unknown";
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content:
        `User question (topic: ${topic}, language: ${lang}, urgency: ${urgency}): ${question}\n\nEvidence:\n${context}` +
        // Restated after the (English-heavy) evidence block, not just once before it —
        // models otherwise drift toward English in the output after reading a long block
        // of English case-law text, even when told the target language up front.
        `\n\n---\nReminder: the evidence above is in English, but per rule 8 every field of your JSON ` +
        `output (summary, immediateActions, stepByStep, yourRights, applicableLaws, caseLaw, ` +
        `whereToGetHelp, gaps, followUpQuestions) MUST be written in "${lang}" — never default to ` +
        `English just because the evidence is in English. Case names, section numbers, and citation ` +
        `markers stay as-is; everything else is translated/paraphrased into "${lang}".`,
    },
  ];
}

// Emergency framing must never depend on the model choosing to say it — this is a
// server-constructed, non-LLM-generated entry, prepended ahead of whatever immediateActions
// the model itself produced (or an empty/no-evidence shape). Applied uniformly across every
// outcome branch (no_evidence, answered, unparsed), not just the post-generation path.
function withEmergencyImmediateAction(sections, emergency) {
  if (!emergency.flag) return sections;
  return {
    ...sections,
    immediateActions: [
      { step: EMERGENCY_MESSAGE, why: emergency.reason || "This looks like a time-sensitive or urgent situation.", sourceIds: [] },
      ...(sections.immediateActions || []),
    ],
  };
}

function emptyAnswerShape() {
  return {
    summary: null,
    immediateActions: [],
    stepByStep: [],
    yourRights: [],
    applicableLaws: [],
    caseLaw: [],
    whereToGetHelp: [],
    gaps: [],
    followUpQuestions: [],
    confidence: "low",
  };
}

// Enforces the output contract the SYSTEM_PROMPT asks for — a model can return
// syntactically valid JSON that's still the wrong shape. Schema failure routes into the
// same "unparsed" fallback as a JSON.parse failure, so the API never hands out a shape
// that doesn't match what's documented.
const AnswerSchema = z.object({
  summary: z.string().nullable().optional(),
  immediateActions: z
    .array(z.object({ step: z.string(), why: z.string().nullable().optional(), sourceIds: z.array(z.string()).optional() }))
    .optional(),
  stepByStep: z
    .array(
      z.object({
        order: z.number(),
        action: z.string(),
        where: z.string().nullable().optional(),
        documentsNeeded: z.array(z.string()).optional(),
        timeLimit: z.string().nullable().optional(),
        sourceIds: z.array(z.string()).optional(),
      })
    )
    .optional(),
  yourRights: z.array(z.object({ right: z.string(), sourceIds: z.array(z.string()).optional() })).optional(),
  applicableLaws: z
    .array(z.object({ act: z.string(), section: z.string().nullable().optional(), plainMeaning: z.string(), sourceId: z.string().optional() }))
    .optional(),
  caseLaw: z
    .array(
      z.object({
        caseName: z.string(),
        court: z.string().nullable().optional(),
        year: z.string().nullable().optional(),
        whatItMeansForYou: z.string(),
        sourceId: z.string().optional(),
      })
    )
    .optional(),
  whereToGetHelp: z
    .array(z.object({ name: z.string(), contact: z.string().nullable().optional(), whenToUse: z.string(), sourceIds: z.array(z.string()).optional() }))
    .optional(),
  gaps: z.array(z.string()).optional(),
  followUpQuestions: z.array(z.string()).optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
});

// Resolves sourceId/sourceIds (the evidence's 1-based [n] index, as a string) into the
// evidence's own url/title — server-filled rather than trusted from the model, since an
// LLM reproducing a URL verbatim is exactly the kind of thing worth not trusting.
function attachSourceUrls(sections, evidence) {
  const byIndex = new Map(evidence.map((e) => [String(e.index), e]));
  const withUrl = (sourceId) => (sourceId && byIndex.has(sourceId) ? byIndex.get(sourceId).url : null);

  return {
    ...sections,
    applicableLaws: (sections.applicableLaws || []).map((item) => ({ ...item, sourceUrl: withUrl(item.sourceId) })),
    caseLaw: (sections.caseLaw || []).map((item) => ({ ...item, sourceUrl: withUrl(item.sourceId) })),
  };
}

function dedupeSources(evidence) {
  const seen = new Set();
  const out = [];
  for (const e of evidence) {
    const key = e.url || `${e.tid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ tid: e.tid, title: e.title, docsource: e.docsource, url: e.url, sourceType: e.sourceType });
  }
  return out;
}

// ========================= STAGE 1: Understand =========================================
async function understand(question) {
  const understanding = await understandQuery(question);
  return {
    searchQuery: understanding.searchQuery,
    topic: understanding.topic,
    language: understanding.language,
    emergency: {
      flag: understanding.isEmergency,
      reason: understanding.emergencyReason,
      message: understanding.isEmergency ? EMERGENCY_MESSAGE : null,
    },
  };
}

// ========================= STAGE 2: Internal RAG first (Qdrant + corpus) ================
/** @returns {Promise<{passages: object[], confident: boolean}>} confident -> skip stages 3 & 4 */
async function searchRag(searchQuery) {
  if (!ragEnabled()) return { passages: [], confident: false };
  let passages = [];
  try {
    passages = await retrievePassages(searchQuery, { limit: MAX_PASSAGES + 2 });
  } catch (err) {
    console.error("Qdrant retrieval failed, moving to the next stage:", err.message);
    return { passages: [], confident: false };
  }
  const confident = passages.filter((p) => p.score >= CONFIDENT_SCORE).length >= CONFIDENT_MIN_PASSAGES;
  return { passages, confident };
}

// ========================= STAGE 3: Indian Kanoon fallback ==============================
/** @returns {Promise<{docs: object[]}>} ranked, zero-relevance hits already dropped */
async function searchIndianKanoon(searchQuery, filters, topN) {
  let generalDocs = [];
  let lawsDocs = [];
  try {
    const [{ docs }, lawsResult] = await Promise.all([
      search(searchQuery, filters, 0, 1),
      // Best-effort: a real auth/token problem will also surface via the call above
      // (same token, same failure mode), so a failure here is safe to swallow rather
      // than sinking the whole stage over an enhancement search.
      search(searchQuery, { ...filters, court: "laws" }, 0, 1).catch(() => ({ docs: [] })),
    ]);
    generalDocs = docs || [];
    lawsDocs = lawsResult.docs || [];
  } catch (err) {
    console.error("Indian Kanoon search failed, moving to the next stage:", err.message);
    return { docs: [] };
  }

  // Score each candidate pool by relevance to the query — OpenRouter embeddings when
  // OPENROUTER_API_KEY is configured (a real semantic match, which catches a
  // paraphrased/conversational question that shares no exact keywords with the
  // right statute/judgment), local TF-IDF otherwise (see relevanceRanking.js) — and
  // drop anything judged unrelated rather than forcing it in. Fewer, genuinely relevant
  // sources beats padding with noise.
  const docText = (d) => `${d.title} ${stripHtml(d.headline)}`;
  const [rankedLaw, rankedGeneral] = await Promise.all([
    rankRelevantDocs(searchQuery, lawsDocs, docText),
    rankRelevantDocs(searchQuery, generalDocs, docText),
  ]);

  const lawTop = rankedLaw.map((x) => x.item).slice(0, LAWS_TOP_N);
  const lawTids = new Set(lawTop.map((d) => d.tid));
  const generalTop = rankedGeneral.map((x) => x.item).filter((d) => !lawTids.has(d.tid));
  return { docs: [...lawTop, ...generalTop].slice(0, topN) };
}

// ========================= STAGE 4: Tavily fallback ======================================
// Only reached when stages 2+3 combined are still thin — Tavily's job is the practical
// detail Indian Kanoon's case-law/bare-act corpus doesn't carry (procedure, helplines,
// free legal aid, forms, time limits), not a substitute for it.
const MIN_EVIDENCE_TO_SKIP_WEB = 2;
const MAX_WEB_RESULTS = 3;

/** @returns {Promise<{results: object[]}>} */
async function searchTavily(searchQuery) {
  if (!isTavilyConfigured()) return { results: [] };
  try {
    const results = await callTavily(searchQuery, { maxResults: MAX_WEB_RESULTS });
    return { results };
  } catch (err) {
    console.error("Tavily search failed, continuing without web evidence:", err.message);
    return { results: [] };
  }
}

// ========================= STAGE 5: Build evidence + generate ===========================
// Merges every origin into ONE numbered, order-stable list (rag -> indian_kanoon -> web)
// so sourceIds in the model's output resolve unambiguously regardless of which stages ran.
async function buildEvidence({ passages, ikDocs, webResults }, distilledQuery) {
  const items = [
    ...passagesToEvidence(passages),
    ...(await indianKanoonDocsToEvidence(distilledQuery, ikDocs)),
    ...webResultsToEvidence(webResults),
  ];
  return items.map((item, i) => ({ ...item, index: i + 1 }));
}

async function generateAnswer(question, topic, evidence, language, isEmergency) {
  const raw = await chatCompletion(buildMessages(question, topic, evidence, language, isEmergency), { jsonMode: true });

  let candidate = null;
  try {
    candidate = extractJson(raw);
  } catch {
    candidate = null;
  }
  let validated = candidate !== null ? AnswerSchema.safeParse(candidate) : null;

  if (!validated?.success) {
    // The object as a whole didn't parse — try salvaging individual well-formed
    // scalar fields before giving up entirely (see salvageFields' doc comment).
    const salvaged = salvageFields(raw);
    validated = salvaged ? AnswerSchema.safeParse(salvaged) : null;
  }

  if (validated?.success) {
    return { outcome: "answered", sections: attachSourceUrls({ ...emptyAnswerShape(), ...validated.data }, evidence), rawAnswer: null };
  }

  // Never show the user raw JSON-looking text (curly braces, "key":"value" noise) that
  // neither parse attempt nor salvage could make sense of — that's confusing, not
  // informative. Genuine unstructured prose (a model that just answered in plain
  // sentences instead of JSON) is still shown as-is; only text that still looks like
  // broken JSON syntax gets suppressed.
  const cleanRaw = raw.trim();
  const looksLikeBrokenJson = cleanRaw.startsWith("{") || /"[a-zA-Z]+"\s*:/.test(cleanRaw);
  return {
    outcome: "unparsed",
    sections: { ...emptyAnswerShape(), summary: looksLikeBrokenJson ? null : cleanRaw || null },
    rawAnswer: raw,
  };
}

// ========================= STAGE 6: Learn (write back into RAG) =========================
// Fire-and-forget — called AFTER the response is built, never awaited by the caller, and a
// failure here must never surface to the user (it already answered them). Only indexes
// content that was actually retrieved for this answer's evidence (stages 3/4), never the
// user's own question text or any other personal data.
async function indexIndianKanoonDocs(docs) {
  const fresh = docs.slice(0, MAX_NEW_DOCS_PER_QUESTION);
  const results = await Promise.allSettled(
    fresh.map(async (d) => {
      const full = await getDocumentRaw(d.tid);
      return ingestIndianKanoonDoc({ tid: d.tid, title: d.title, docsource: d.docsource, html: full.doc });
    })
  );
  for (const r of results) if (r.status === "rejected") console.error("RAG ingest (Indian Kanoon) failed:", r.reason?.message || r.reason);
}

async function indexWebResults(results) {
  const settled = await Promise.allSettled(results.map((r) => ingestWebDoc({ url: r.url, title: r.title, text: r.content })));
  for (const r of settled) if (r.status === "rejected") console.error("RAG ingest (web) failed:", r.reason?.message || r.reason);
}

/** Never await this from the request path — see the Stage 6 note above. */
function learnIntoRag({ ikDocs, webResults }) {
  if (!ragEnabled()) return;
  const jobs = [];
  if (ikDocs.length > 0) jobs.push(indexIndianKanoonDocs(ikDocs));
  if (webResults.length > 0) jobs.push(indexWebResults(webResults));
  if (jobs.length === 0) return;
  Promise.allSettled(jobs).catch((err) => console.error("learnIntoRag failed unexpectedly:", err.message));
}

/**
 * @param {string} question - raw user question, any language/register.
 * @param {import("./indianKanoonFilters.js").CaseLawFilters} [filters]
 * @param {number} [topN=5]
 * @returns {Promise<{
 *   outcome: "no_evidence"|"answered"|"unparsed",
 *   understanding: {searchQuery: string, topic: string, language: string},
 *   emergency: {flag: boolean, reason: string|null, message: string|null},
 *   sections: object,
 *   rawAnswer: string|null,
 *   sources: Array<{tid: number|null, title: string, docsource: string, url: string, sourceType: string}>,
 *   evidenceOrigin: {rag: number, indianKanoon: number, web: number},
 *   disclaimer: string
 * }>}
 */
export async function answerLegalQuestion(question, filters = {}, topN = DEFAULT_TOP_N) {
  const cacheKey = `legal-assistant:${question}:${JSON.stringify(filters)}:${topN}`;

  return cache.getOrSet(cacheKey, ANSWER_TTL_MS, async () => {
    // Stage 1
    const { searchQuery, topic, language, emergency } = await understand(question);

    // Stage 2
    const { passages, confident } = await searchRag(searchQuery);

    // Stage 3 (skipped once stage 2 is confident)
    const ikDocs = confident ? [] : (await searchIndianKanoon(searchQuery, filters, topN)).docs;

    // Stage 4 (skipped once stage 2 is confident, or stage 2+3 combined are already enough)
    const combinedCount = passages.length + ikDocs.length;
    const webResults = confident || combinedCount >= MIN_EVIDENCE_TO_SKIP_WEB ? [] : (await searchTavily(searchQuery)).results;

    if (passages.length === 0 && ikDocs.length === 0 && webResults.length === 0) {
      return {
        outcome: "no_evidence",
        understanding: { searchQuery, topic, language },
        emergency,
        sections: withEmergencyImmediateAction({ ...emptyAnswerShape(), gaps: [INSUFFICIENT_EVIDENCE_NOTE] }, emergency),
        rawAnswer: null,
        sources: [],
        evidenceOrigin: { rag: 0, indianKanoon: 0, web: 0 },
        disclaimer: DISCLAIMER,
      };
    }

    // Stage 5
    const evidence = await buildEvidence({ passages, ikDocs, webResults }, searchQuery);
    const { outcome, sections: generatedSections, rawAnswer } = await generateAnswer(question, topic, evidence, language, emergency.flag);
    const sections = withEmergencyImmediateAction(generatedSections, emergency);

    const response = {
      outcome,
      understanding: { searchQuery, topic, language },
      emergency,
      sections,
      rawAnswer,
      sources: dedupeSources(evidence),
      evidenceOrigin: { rag: passages.length, indianKanoon: ikDocs.length, web: webResults.length },
      retrieval: { mode: passages.length > 0 ? "knowledge_base" : "live_search", passages: passages.length, servedFromKnowledgeBase: confident },
      disclaimer: DISCLAIMER,
    };

    // Stage 6 — never awaited; must not delay or risk the response above.
    learnIntoRag({ ikDocs, webResults });

    return response;
  });
}

// Test-only: clears the module-level cache so tests don't leak state into each other.
export function __resetCacheForTests() {
  cache.clear();
}
