// Step 1 of the legal-assistant RAG pipeline: turn a raw, possibly Hinglish/Hindi/
// informal user question into (a) a clean English keyword query suited to Indian
// Kanoon's full-text search, and (b) an emergency flag. This runs BEFORE any retrieval —
// Indian Kanoon's search is keyword-oriented, so a conversational sentence like
// "Mere landlord ne security deposit return nahi kiya, kya kar sakta hoon?" needs to
// become something like "landlord security deposit not returned tenant remedy" first.
import { chatCompletion, OpenRouterAuthError, OpenRouterApiError } from "./openRouter.js";
import { createCache } from "../utils/cache.js";

const TTL_MS = 60 * 60 * 1000;
const cache = createCache();

export { OpenRouterAuthError, OpenRouterApiError };

// Emergency detection never relies solely on the LLM (rule #9: emergencies must be
// caught reliably). This is a belt-and-suspenders keyword net over English, Hindi
// (Devanagari) and common Hinglish transliterations, OR'd with whatever the LLM flags.
const EMERGENCY_PATTERNS = [
  /\barrest(ed|ing)?\b/i,
  /\bgirftaar\b/i,
  /\bgiraftar\b/i,
  /\bcustody\b/i,
  /\bpolice\s*(station|thana)\b/i,
  /\bthana\b/i,
  /\bfir\b/i,
  /\bremand\b/i,
  /\bbail\b.*\b(urgent|today|tomorrow|now)\b/i,
  /\bkidnap/i,
  /\bdomestic violence\b/i,
  /\bharass(ed|ment)?\b.*\b(now|urgent|threat)\b/i,
  /\bthreat(en(ed|ing)?)?\s+(to\s+)?(kill|life|harm)\b/i,
  /\bsuicide\b/i,
  /\battempt\s+to\s+murder\b/i,
  /\bcourt\s+(tomorrow|today|hearing tomorrow)\b/i,
  /\bnotice period.*(today|tomorrow|expir)/i,
  /\bimmediate(ly)?\s+(danger|threat|risk)\b/i,
  /जान\s*को\s*खतरा/,
  /गिरफ्तार/,
  /पुलिस\s*थाना/,
];

function keywordEmergencyCheck(question) {
  return EMERGENCY_PATTERNS.some((re) => re.test(question));
}

function buildMessages(question) {
  return [
    {
      role: "system",
      content:
        "You are the query-understanding step of an Indian legal research assistant. You do NOT answer the user's legal question. " +
        "Given a user's question — which may be in English, Hindi, Hinglish, or a mix, and may be informal or emotional — output STRICT JSON only, no markdown fences, no commentary, matching exactly this shape:\n" +
        '{"searchQuery": string, "topic": string, "language": string, "isEmergency": boolean, "emergencyReason": string|null}\n\n' +
        "Field rules:\n" +
        "- searchQuery: a concise (3-10 word) English keyword phrase capturing the legal issue, suitable for a full-text case-law search engine. Translate/transliterate Hindi terms to their English legal equivalent (e.g. \"security deposit vapas nahi mila\" -> \"landlord security deposit not returned tenant remedy\"). Do not phrase it as a question.\n" +
        "- topic: a short label for the area of law (e.g. \"tenancy\", \"criminal procedure - arrest\", \"cheque bounce / Section 138 NI Act\", \"employment termination\").\n" +
        "- language: the predominant language of the user's question (e.g. \"english\", \"hindi\", \"hinglish\").\n" +
        "- isEmergency: true only if the question describes something time-sensitive or dangerous right now — an arrest, in-custody situation, an FIR just filed against the user, immediate threat of violence, a court deadline in the next day or two, or similar. Ordinary questions about rights, procedures, or past events are NOT emergencies.\n" +
        "- emergencyReason: a short phrase explaining why, or null if isEmergency is false.",
    },
    { role: "user", content: question },
  ];
}

function stripCodeFence(text) {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match ? match[1].trim() : text.trim();
}

function fallback(question) {
  return {
    searchQuery: question.trim().slice(0, 300),
    topic: "general",
    language: "unknown",
    isEmergency: keywordEmergencyCheck(question),
    emergencyReason: keywordEmergencyCheck(question) ? "Matched an urgent-situation keyword." : null,
    parseFallback: true,
  };
}

/**
 * @param {string} question - the raw user question, any language/register.
 * @returns {Promise<{searchQuery: string, topic: string, language: string, isEmergency: boolean, emergencyReason: string|null}>}
 */
export async function understandQuery(question) {
  const cacheKey = `understand:${question}`;

  return cache.getOrSet(cacheKey, TTL_MS, async () => {
    let raw;
    try {
      raw = await chatCompletion(buildMessages(question));
    } catch (err) {
      // Query understanding failing must never take down the whole assistant — fall
      // back to using the raw question as the search query and the keyword-only
      // emergency check, and let the caller decide whether to surface the LLM error.
      if (err instanceof OpenRouterAuthError || err instanceof OpenRouterApiError) return fallback(question);
      throw err;
    }

    let parsed;
    try {
      parsed = JSON.parse(stripCodeFence(raw));
    } catch {
      return fallback(question);
    }

    const keywordFlag = keywordEmergencyCheck(question);
    return {
      searchQuery: typeof parsed.searchQuery === "string" && parsed.searchQuery.trim() ? parsed.searchQuery.trim() : question.trim(),
      topic: typeof parsed.topic === "string" ? parsed.topic : "general",
      language: typeof parsed.language === "string" ? parsed.language : "unknown",
      isEmergency: Boolean(parsed.isEmergency) || keywordFlag,
      emergencyReason: parsed.isEmergency ? parsed.emergencyReason || "Flagged by query analysis." : keywordFlag ? "Matched an urgent-situation keyword." : null,
    };
  });
}

// Test-only: clears the module-level cache so tests don't leak state into each other.
export function __resetCacheForTests() {
  cache.clear();
}
