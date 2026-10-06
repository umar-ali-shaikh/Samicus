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

// P3-1: a question trying to manipulate the assistant's own instructions (not a real legal
// question at all) must never even reach a model call — "the system prompt must never
// leak" is a guarantee this server-side net gives, not something left to a system-prompt
// instruction the model might or might not honour. Checked BEFORE Stage 1 runs, so the
// suspicious text is never sent to the LLM in the first place (see answerLegalQuestion's
// use of this in legalAssistant.js).
const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(the\s+)?(above|previous|prior)\s+instructions?/i,
  /disregard\s+(all\s+)?(the\s+)?(above|previous|prior|earlier)\s+instructions?/i,
  /forget\s+(all\s+)?(your\s+|the\s+)?(previous\s+|prior\s+)?instructions?/i,
  /reveal\s+(to\s+me\s+)?(your\s+)?(system\s+)?(prompt|instructions)/i,
  /(show|print|output|repeat|what\s+(is|are))\s+(me\s+)?your\s+(system\s+)?(prompt|instructions)/i,
  /you\s+are\s+now\s+(in\s+)?(a\s+)?(developer|dan|jailbreak|unrestricted)\s*mode/i,
  /act\s+as\s+(if\s+you\s+(are|were)\s+)?(an?\s+)?(unrestricted|uncensored|different)\s+ai/i,
  /pretend\s+(you\s+are|to\s+be)\s+(an?\s+)?(ai\s+)?(with\s+no\s+rules|without\s+restrictions)/i,
];

export function looksLikePromptInjection(text) {
  return PROMPT_INJECTION_PATTERNS.some((re) => re.test(text));
}

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

// Which KIND of emergency this is — the generation stage needs this to show the right
// fixed helplines/message (1930 for fraud, 181 for domestic violence, the arrest-flavoured
// card only for an actual arrest), never one flat arrest-shaped message for everything
// isEmergency flags. Same belt-and-suspenders posture as EMERGENCY_PATTERNS: the LLM's own
// emergencyType is the primary signal, this keyword net is the fallback/safety net.
const EMERGENCY_TYPE_PATTERNS = {
  arrest_custody: [
    /\barrest(ed|ing)?\b/i,
    /\bgirftaar\b/i,
    /\bgiraftar\b/i,
    /\bcustody\b/i,
    /\bpolice\s*(station|thana)\b/i,
    /\bthana\b/i,
    /\bfir\b/i,
    /\bremand\b/i,
    /गिरफ्तार/,
    /पुलिस\s*थाना/,
  ],
  cyber_fraud: [
    /\bcyber\s*(crime|fraud)\b/i,
    /\bonline\s*fraud\b/i,
    /\bupi\b[\s\S]{0,30}\bfraud\b/i,
    /\bfraud\b[\s\S]{0,30}\bupi\b/i,
    /\botp\b/i,
    /\bphish(ing)?\b/i,
    /\bhack(ed|ing)?\b[\s\S]{0,20}\b(account|bank|phone|upi)\b/i,
    /\bscam(med)?\b/i,
    /\bonline\b[\s\S]{0,20}\bfraud\b/i,
    /paisa\s*(kat|cut|chala|gaya|katt)/i,
    /ऑनलाइन\s*धोखाधड़ी/,
    /खाता\s*हैक/,
  ],
  domestic_violence: [
    /\bdomestic violence\b/i,
    /\b(husband|pati|wife|patni)\b[\s\S]{0,30}\b(hit|beat|maar|peet|marta|threat)/i,
    /\bmarta\s*hai\b/i,
    /\bpeeta\s*hai\b/i,
    /\bdahej\b/i,
    /दहेज/,
    /घरेलू\s*हिंसा/,
    /पति[\s\S]{0,10}मारता/,
  ],
};

function keywordEmergencyType(question) {
  for (const [type, patterns] of Object.entries(EMERGENCY_TYPE_PATTERNS)) {
    if (patterns.some((re) => re.test(question))) return type;
  }
  return null;
}

const EMERGENCY_TYPES = new Set(["arrest_custody", "cyber_fraud", "domestic_violence", "other"]);

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

// History entries are {question, summary} — the short-form prior turns loaded by
// routes/legalAssistant.js (see loadHistory there), never the full prior answer. Threading
// this into Stage 1 is what lets a context-free follow-up like "what documents do I need?"
// resolve to the RIGHT legal angle (the topic of the earlier turn) instead of a generic,
// unrelated search.
function historyBlock(history) {
  if (!history?.length) return "";
  const lines = history.map((h, i) => `Turn ${i + 1} — user asked: ${h.question}\nTurn ${i + 1} — answer summary: ${h.summary || "(no summary)"}`);
  return (
    "Conversation so far (oldest first) — use this ONLY to understand what the new message below refers to " +
    "(e.g. a pronoun, \"what about...\", or a short follow-up with no legal content on its own); the question you " +
    "are classifying is the NEW message after this block, not anything in this history:\n" +
    lines.join("\n\n") +
    "\n\n---\nNew message to classify:\n"
  );
}

function buildMessages(question, history = []) {
  return [
    {
      role: "system",
      content:
        "You are the query-understanding step of an Indian legal help assistant used by ordinary, often low-literacy people. You do NOT answer the user's legal question. " +
        "Given a user's question — which may be in English, Hindi, Marathi, Urdu, Hinglish, Marathlish, or a mix, and may be informal, colloquial, or emotional — output STRICT JSON only, no markdown fences, no commentary, matching exactly this shape:\n" +
        '{"searchQueries": [string], "topic": string, "stateDependent": boolean, "mentionedState": string|null, "language": string, "languageConfidence": "high"|"low", "speakerRole": string, "isEmergency": boolean, "emergencyType": string|null, "emergencyReason": string|null}\n\n' +
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
        "- stateDependent: true if the correct answer materially differs by Indian state (e.g. rent control / tenancy, shops & establishments, land/property, excise/liquor, state excise duty, local municipal law, state-specific labour welfare boards) — false for topics governed uniformly by central law (e.g. the BNS/BNSS/BSA, the Constitution, central labour codes like the Payment of Wages Act, the NI Act's Section 138 cheque bounce, central consumer protection law).\n" +
        "- mentionedState: the Indian state/UT the user already named (e.g. \"Maharashtra\", \"Delhi\"), exactly as a state/UT name — or null if none was named. Never guess one from a city alone unless the city unambiguously is that state's (e.g. \"Mumbai\" -> \"Maharashtra\" is fine; a generic question with no place named at all -> null).\n" +
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
        "  IMPORTANT — do not force-fit a language this list doesn't cover into the closest-looking one. Assamese, Bengali, Tamil, Telugu, Kannada, Malayalam, Punjabi, Gujarati, Odia, Nepali, Sinhala, and every other language are NOT hindi/marathi/urdu/hinglish/marathlish/english, even when the script looks similar (Nepali and Assamese are NOT Hindi or Marathi just because they can share Devanagari-like characters; judge actual vocabulary/grammar). If the text is in one of these other languages, output your best-effort name for it in English (e.g. \"assamese\", \"nepali\", \"bengali\") and set languageConfidence to \"low\" — never silently relabel it as one of the six supported categories.\n" +
        "- languageConfidence: \"high\" only if you are genuinely confident the text is one of hindi/marathi/urdu/hinglish/marathlish/english, based on actual vocabulary and grammar you recognise. \"low\" if the language/script is one you don't confidently recognise as one of those six (including any of the languages named above), if the text is too short/ambiguous to tell, or if you are guessing from script alone rather than vocabulary.\n" +
        "- isEmergency: true only if the question describes something time-sensitive or dangerous right now — an arrest, in-custody situation (of the user OR someone they know), an FIR just filed, a fraud/scam that just happened, violence from a family member, immediate threat of violence, a court deadline in the next day or two, or similar. Ordinary questions about rights, procedures, or past events are NOT emergencies.\n" +
        "- emergencyType: when isEmergency is true, classify which KIND of emergency this is, since each needs completely different help:\n" +
        "    * \"arrest_custody\" — an arrest, FIR, detention, remand, or custody situation (of the user or someone they know).\n" +
        "    * \"cyber_fraud\" — online/UPI/banking fraud, a scam, a hacked account, phishing, money just stolen online.\n" +
        "    * \"domestic_violence\" — violence, abuse, or threats from a spouse or family member.\n" +
        "    * \"other\" — any other genuinely urgent situation not covered above (e.g. an imminent court deadline, kidnapping, suicide risk, immediate threat to life).\n" +
        "  null if isEmergency is false.\n" +
        "- emergencyReason: a short phrase explaining why, or null if isEmergency is false.",
    },
    { role: "user", content: historyBlock(history) + question },
  ];
}

function stripCodeFence(text) {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match ? match[1].trim() : text.trim();
}

const MAX_SEARCH_QUERIES = 4;

// The only languages the generation stage actually knows how to write in (see
// legalAssistant.js's SYSTEM_PROMPT rule 8). Anything else — a language the model names
// but isn't one of these six, or one it named with low confidence — is downgraded to
// "unknown" so the generation stage falls back to English rather than silently writing
// in, say, Marathi for a Nepali question just because the model's best guess landed there.
const SUPPORTED_LANGUAGES = new Set(["hindi", "marathi", "urdu", "hinglish", "marathlish", "english"]);

function fallback(question) {
  const keywordFlag = keywordEmergencyCheck(question);
  return {
    searchQuery: question.trim().slice(0, 300),
    searchQueries: [question.trim().slice(0, 300)],
    topic: "general",
    stateDependent: false,
    mentionedState: null,
    language: "unknown",
    languageSupported: true, // infra/parse failure, not an unrecognized-language case — no "unsupported language" notice
    speakerRole: keywordSpeakerRole(question) || "unclear",
    isEmergency: keywordFlag,
    emergencyType: keywordFlag ? keywordEmergencyType(question) || "other" : null,
    emergencyReason: keywordFlag ? "Matched an urgent-situation keyword." : null,
    parseFallback: true,
  };
}

const SPEAKER_ROLES = new Set(["accused", "relative_or_witness", "unclear"]);

/**
 * @param {string} question - the raw user question, any language/register.
 * @param {Array<{question: string, summary: string}>} [history] - last 1-3 turns of this
 *   conversation (short form), oldest first — see loadHistory() in routes/legalAssistant.js.
 * @returns {Promise<{searchQuery: string, searchQueries: string[], topic: string, language: string,
 *   languageSupported: boolean, speakerRole: string, isEmergency: boolean, emergencyReason: string|null}>}
 */
export async function understandQuery(question, history = []) {
  const cacheKey = `understand:${question}:${JSON.stringify(history)}`;

  return cache.getOrSet(cacheKey, TTL_MS, async () => {
    let raw;
    try {
      raw = await chatCompletion(buildMessages(question, history));
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

    // Default confidence to "high" when the model doesn't emit the field at all, so
    // existing, already-working hindi/marathi/urdu/etc. detection isn't downgraded just
    // because a particular call omitted this new field — only an EXPLICIT "low" (or a
    // language string outside the supported set) forces the "unknown" fallback.
    const detectedLanguage = typeof parsed.language === "string" ? parsed.language.trim().toLowerCase() : "";
    const languageConfidence = parsed.languageConfidence === "low" ? "low" : "high";
    const languageSupported = SUPPORTED_LANGUAGES.has(detectedLanguage) && languageConfidence === "high";

    const isEmergency = Boolean(parsed.isEmergency) || keywordFlag;
    const llmEmergencyType = EMERGENCY_TYPES.has(parsed.emergencyType) ? parsed.emergencyType : null;
    // speakerRole "relative_or_witness" only exists in this app for the someone-else-is-
    // in-custody case (see its field description above) — a strong signal for
    // arrest_custody even when neither the LLM's emergencyType nor the arrest keyword net
    // caught it (e.g. "mere bete ko utha ke le gaye" uses no literal "arrest"/"thana").
    const keywordType = keywordEmergencyType(question) || (speakerRole === "relative_or_witness" ? "arrest_custody" : null);
    const emergencyType = isEmergency ? llmEmergencyType || keywordType || "other" : null;

    return {
      searchQuery,
      searchQueries: searchQueries.length > 0 ? searchQueries : [searchQuery],
      topic: typeof parsed.topic === "string" ? parsed.topic : "general",
      stateDependent: Boolean(parsed.stateDependent),
      mentionedState: typeof parsed.mentionedState === "string" && parsed.mentionedState.trim() ? parsed.mentionedState.trim() : null,
      language: languageSupported ? detectedLanguage : "unknown",
      languageSupported,
      speakerRole,
      isEmergency,
      emergencyType,
      emergencyReason: parsed.isEmergency ? parsed.emergencyReason || "Flagged by query analysis." : keywordFlag ? "Matched an urgent-situation keyword." : null,
    };
  });
}

// Test-only: clears the module-level cache so tests don't leak state into each other.
export function __resetCacheForTests() {
  cache.clear();
}
