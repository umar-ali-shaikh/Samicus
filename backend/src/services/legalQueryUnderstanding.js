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

// Belt-and-suspenders detection of WHO is asking, for the arrest/custody case specifically:
// a relative asking about someone else in custody needs completely different guidance (their
// own rights to be informed, to meet the person, Habeas Corpus) than the person actually
// arrested would. Matched against English/Hindi/Hinglish third-person-relation + detention
// phrasing — never trusted alone (the LLM's own speakerRole field is the primary signal),
// just a safety net for when parsing fails.
const THIRD_PARTY_CUSTODY_PATTERNS = [
  /\b(mera|meri|mere|my)\s+(beta|bete|beti|husband|wife|pati|patni|bhai|behen|baap|papa|father|mother|maa|son|daughter|ladka|ladki)\b[\s\S]{0,40}\b(utha|giraftar|arrest|pakad|le gaye|le gayi|custody|thane|detain)/i,
  /\b(unko|unhe|usko|use)\b[\s\S]{0,30}\b(giraftar|arrest|utha|le gaye|pakad)/i,
  /मेरे\s*(बेटे|बेटी|पति|पत्नी|भाई|बहन)/,
];

function keywordSpeakerRole(question) {
  if (THIRD_PARTY_CUSTODY_PATTERNS.some((re) => re.test(question))) return "relative_or_witness";
  return null;
}

function buildMessages(question) {
  return [
    {
      role: "system",
      content:
        "You are the query-understanding step of an Indian legal help assistant used by ordinary, often low-literacy people. You do NOT answer the user's legal question. " +
        "Given a user's question — which may be in English, Hindi, Marathi, Urdu, Hinglish, Marathlish, or a mix, and may be informal, colloquial, or emotional — output STRICT JSON only, no markdown fences, no commentary, matching exactly this shape:\n" +
        '{"searchQueries": [string], "topic": string, "language": string, "speakerRole": string, "isEmergency": boolean, "emergencyReason": string|null}\n\n' +
        "Field rules:\n" +
        "- searchQueries: 2 to 4 concise (3-10 word) English keyword phrases for a full-text case-law/statute search engine, each covering a DIFFERENT plausible legal angle — never just one rephrasing of the same angle. First, translate colloquial/informal words into the legal concept they actually mean (this is the most important step — a literal translation misses the law entirely):\n" +
        "    * \"malik\"/\"boss\"/\"company\" not paying -> employer; \"pagar\"/\"salary\" -> wages\n" +
        "    * \"kaam pe mat aana\"/told not to come to work -> termination/dismissal\n" +
        "    * \"utha ke le gaye\"/\"pakad liya\" by police -> arrest, detention, custody\n" +
        "    * \"maarta hai\"/\"peeta hai\" by a spouse/family member -> domestic violence, assault\n" +
        "    * \"deposit nahi lauta raha\" by a landlord -> security deposit refund, tenancy dispute\n" +
        "  Then generate queries naming the SPECIFIC Acts/schemes/authorities most likely to apply, e.g.:\n" +
        "    * unpaid wages -> [\"Code on Wages 2019 unpaid wages\", \"Payment of Wages Act employer non-payment\", \"Industrial Disputes Act termination without notice\", \"Labour Commissioner complaint Shram Suvidha Samadhan\"]\n" +
        "    * landlord won't return deposit -> [\"Model Tenancy Act 2021 security deposit\", \"State Rent Control Act deposit refund\", \"CPC Order XXXVII summary suit recovery\", \"consumer forum landlord deposit\"]\n" +
        "    * spouse hits/threatens -> [\"Protection of Women from Domestic Violence Act 2005\", \"Section 85 BNS cruelty by husband relatives\", \"Protection Officer domestic incident report\"]\n" +
        "    * arrested/FIR -> [\"BNSS arrest procedure rights\", \"anticipatory bail BNSS Section 482\", \"FIR registration BNSS Section 173\"]\n" +
        "  Never ask the user to supply an Act or Section — figuring that out from the facts IS this step's job. Do not phrase any query as a question.\n" +
        "- topic: a short label for the area of law (e.g. \"tenancy\", \"criminal procedure - arrest\", \"wages / labour\", \"domestic violence\", \"cheque bounce / Section 138 NI Act\").\n" +
        "- speakerRole: who is typing this message, judged from the pronouns/grammar used —\n" +
        "    * \"accused\" — the user is describing something happening TO THEMSELVES (\"mujhe giraftar kiya\", \"I was arrested\", \"mera FIR hua\").\n" +
        "    * \"relative_or_witness\" — the user is describing something happening to SOMEONE ELSE they know (\"mere bete ko utha ke le gaye\", \"my husband was arrested\", \"police took my brother\").\n" +
        "    * \"unclear\" — can't tell, or not applicable (the question isn't about a person in custody/trouble at all).\n" +
        "- language: identify BOTH the script and the underlying language the user actually typed in — this drives what script/language the final answer is written in, so get it right:\n" +
        "  * \"hindi\" — Hindi, written in Devanagari script (हिंदी में लिखा गया), e.g. \"मुझे गिरफ़्तार कर लिया गया, अब क्या करूं?\"\n" +
        "  * \"marathi\" — Marathi, written in Devanagari script (मराठीत लिहिलेले), e.g. \"मला अटक झाली, आता काय करू?\". Marathi and Hindi share Devanagari script, so distinguish by vocabulary/grammar (e.g. Marathi's \"आहे/काय/मला\" and verb forms vs Hindi's \"है/क्या/मुझे\"), not by script alone.\n" +
        "  * \"urdu\" — Urdu, written in Perso-Arabic (Nastaliq) script, e.g. \"مجھے گرفتار کر لیا گیا، اب کیا کروں؟\".\n" +
        "  * \"hinglish\" — Hindi words/grammar (or a Hindi-English code-mix) written STRICTLY in Roman/Latin letters, e.g. \"mujhe arrest kar liya, ab kya karu?\" or \"mera FIR ho gaya hai\". Do NOT label it \"hindi\" just because the words are Hindi; Roman letters means \"hinglish\".\n" +
        "  * \"marathlish\" — Marathi words/grammar (or a Marathi-English code-mix) written STRICTLY in Roman/Latin letters, e.g. \"mala arrest zaale, ata kay karu?\" or \"maza FIR zhala aahe\". Do NOT label it \"hinglish\" or \"hindi\" just because it's Romanized — judge by the underlying Marathi vocabulary/grammar (e.g. \"zaale/aahe/mala/kay\" vs Hindi's \"hua/hai/mujhe/kya\").\n" +
        "  * \"english\" — predominantly English.\n" +
        "  Judge script by the actual characters typed (Devanagari vs Perso-Arabic vs Roman), and for Roman-script input judge the underlying language by vocabulary/grammar — never guess Devanagari or Perso-Arabic from Romanized text.\n" +
        "- isEmergency: true only if the question describes something time-sensitive or dangerous right now — an arrest, in-custody situation (of the user OR someone they know), an FIR just filed, immediate threat of violence, a court deadline in the next day or two, or similar. Ordinary questions about rights, procedures, or past events are NOT emergencies.\n" +
        "- emergencyReason: a short phrase explaining why, or null if isEmergency is false.",
    },
    { role: "user", content: question },
  ];
}

function stripCodeFence(text) {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match ? match[1].trim() : text.trim();
}

const MAX_SEARCH_QUERIES = 4;

function fallback(question) {
  const keywordFlag = keywordEmergencyCheck(question);
  return {
    searchQuery: question.trim().slice(0, 300),
    searchQueries: [question.trim().slice(0, 300)],
    topic: "general",
    language: "unknown",
    speakerRole: keywordSpeakerRole(question) || "unclear",
    isEmergency: keywordFlag,
    emergencyReason: keywordFlag ? "Matched an urgent-situation keyword." : null,
    parseFallback: true,
  };
}

const SPEAKER_ROLES = new Set(["accused", "relative_or_witness", "unclear"]);

/**
 * @param {string} question - the raw user question, any language/register.
 * @returns {Promise<{searchQuery: string, searchQueries: string[], topic: string, language: string,
 *   speakerRole: string, isEmergency: boolean, emergencyReason: string|null}>}
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
    const searchQueries = (Array.isArray(parsed.searchQueries) ? parsed.searchQueries : [])
      .filter((s) => typeof s === "string" && s.trim())
      .map((s) => s.trim())
      .slice(0, MAX_SEARCH_QUERIES);
    const searchQuery =
      typeof parsed.searchQuery === "string" && parsed.searchQuery.trim() ? parsed.searchQuery.trim() : searchQueries[0] || question.trim();
    const speakerRole = SPEAKER_ROLES.has(parsed.speakerRole) ? parsed.speakerRole : keywordSpeakerRole(question) || "unclear";
    return {
      searchQuery,
      searchQueries: searchQueries.length > 0 ? searchQueries : [searchQuery],
      topic: typeof parsed.topic === "string" ? parsed.topic : "general",
      language: typeof parsed.language === "string" ? parsed.language : "unknown",
      speakerRole,
      isEmergency: Boolean(parsed.isEmergency) || keywordFlag,
      emergencyReason: parsed.isEmergency ? parsed.emergencyReason || "Flagged by query analysis." : keywordFlag ? "Matched an urgent-situation keyword." : null,
    };
  });
}

// Test-only: clears the module-level cache so tests don't leak state into each other.
export function __resetCacheForTests() {
  cache.clear();
}
