// Section/act abbreviation expansion for the research library's retrieval step.
//
// A question like "Can a wife claim maintenance under Section 125 CrPC after divorce?"
// shares almost no vocabulary with how that provision is actually stored/discussed in the
// corpus — "Section 125 of the Code of Criminal Procedure", or (post-2024) its BNSS
// successor "Section 144". Dense embeddings close some of that gap but not reliably for a
// bare "125 CrPC" token; this module expands a query into the alternate phrasings a legal
// corpus is likely to actually use, so retrieval can try all of them.

// Common short forms <-> canonical act names. Checked case-insensitively, longest-first so
// e.g. "IPC" doesn't also fire on a question that already spelled out the full name.
const ACT_ALIASES = [
  ["crpc", "code of criminal procedure"],
  ["cr.p.c", "code of criminal procedure"],
  ["cr p c", "code of criminal procedure"],
  ["bnss", "bharatiya nagarik suraksha sanhita"],
  ["ipc", "indian penal code"],
  ["bns", "bharatiya nyaya sanhita"],
  ["cpc", "code of civil procedure"],
  ["iea", "indian evidence act"],
  ["bsa", "bharatiya sakshya adhiniyam"],
  ["nia", "negotiable instruments act"],
  // "NI Act" (two separate words) doesn't match the "nia" alias above at all (that regex
  // requires the literal one-word token "nia") — confirmed this let "Section 138 NI Act
  // cheque bounce" skip the "negotiable instruments act" expansion entirely.
  ["ni act", "negotiable instruments act"],
].sort((a, b) => b[0].length - a[0].length);

// The 2023-24 criminal-law replacements (BNS/BNSS/BSA for IPC/CrPC/Evidence Act, effective
// 1 July 2024) renumbered almost every section. Only the ones that come up constantly in
// everyday questions are hardcoded here — a targeted aid for retrieval recall and for
// prompting the AI Legal Assistant to always name the current section alongside the old
// one, not a substitute for a full section-mapping table.
export const SECTION_CROSSWALK = {
  "crpc:41": [["bnss", "35"]], // arrest without warrant
  "crpc:50": [["bnss", "47"]], // right to know grounds of arrest
  "crpc:57": [["bnss", "58"]], // produced before magistrate within 24 hours
  "crpc:125": [["bnss", "144"]], // maintenance of wives, children and parents
  "crpc:154": [["bnss", "173"]], // FIR / information in cognizable cases
  "crpc:161": [["bnss", "180"]], // police examination of witnesses
  "crpc:173": [["bnss", "193"]], // police report on completion of investigation
  "crpc:200": [["bnss", "223"]], // complaint to a magistrate
  "crpc:437": [["bnss", "480"]], // bail in non-bailable offences
  "crpc:438": [["bnss", "482"]], // anticipatory bail
  "crpc:439": [["bnss", "483"]], // special powers of HC/Sessions Court re bail
  "crpc:482": [["bnss", "528"]], // High Court's inherent powers
  "ipc:109": [["bns", "111"]], // abetment
  "ipc:302": [["bns", "103"]], // murder
  "ipc:304b": [["bns", "80"]], // dowry death
  "ipc:306": [["bns", "108"]], // abetment of suicide
  "ipc:307": [["bns", "109"]], // attempt to murder
  "ipc:323": [["bns", "115"]], // voluntarily causing hurt
  "ipc:324": [["bns", "118"]], // voluntarily causing hurt by dangerous weapons
  "ipc:341": [["bns", "126"]], // wrongful restraint
  "ipc:342": [["bns", "127"]], // wrongful confinement
  "ipc:354": [["bns", "74"]], // assault/criminal force to woman
  "ipc:354a": [["bns", "75"]], // sexual harassment
  "ipc:376": [["bns", "64"]], // rape
  "ipc:379": [["bns", "303"]], // theft
  "ipc:406": [["bns", "316"]], // criminal breach of trust
  "ipc:420": [["bns", "318"]], // cheating
  "ipc:498a": [["bns", "85"]], // cruelty by husband/relatives
  "ipc:499": [["bns", "356"]], // defamation
  "ipc:506": [["bns", "351"]], // criminal intimidation
  "ipc:509": [["bns", "79"]], // word/gesture insulting the modesty of a woman
  "iea:24": [["bsa", "22"]], // confession caused by inducement/threat/promise
  "iea:65b": [["bsa", "63"]], // electronic evidence admissibility
};

// Formatted for embedding directly in an LLM prompt, so the model always has the mapping
// in front of it rather than relying on training-data recall for section numbers.
export const CODE_CROSSWALK_REFERENCE = Object.entries(SECTION_CROSSWALK)
  .map(([key, mapped]) => {
    const [oldAct, oldNum] = key.split(":");
    return mapped.map(([newAct, newNum]) => `${newAct.toUpperCase()} s.${newNum} (old ${oldAct.toUpperCase()} s.${oldNum})`).join(", ");
  })
  .join("; ");

const REPEALED_CODE_RE = /\b(IPC|CrPC|Cr\.P\.C|Evidence Act)\b/i;
const NEW_CODE_RE = /\b(BNS|BNSS|BSA)\b/i;

/**
 * True when `text` names a repealed code (IPC/CrPC/Evidence Act) but never names its BNS/
 * BNSS/BSA successor anywhere — a sign the answer is citing stale law without flagging that
 * it changed on 1 July 2024.
 */
export function citesOnlyRepealedCode(text) {
  const s = String(text || "");
  return REPEALED_CODE_RE.test(s) && !NEW_CODE_RE.test(s);
}

// P3-2: the Act names a layperson's problem actually turns on, each with its correct
// enactment year — the same "give the model a trusted lookup table, then verify
// independently rather than trusting recall" pattern as SECTION_CROSSWALK/
// CODE_CROSSWALK_REFERENCE above. A model naming "the Payment of Wages Act" with no year,
// or the wrong year, is a common small-model failure mode that's cheap to catch
// deterministically instead of hoping the model remembers correctly.
export const ACT_YEARS = {
  "payment of wages act": 1936,
  "code on wages": 2019,
  "industrial disputes act": 1947,
  "minimum wages act": 1948,
  "protection of women from domestic violence act": 2005,
  "negotiable instruments act": 1881,
  "indian penal code": 1860,
  "code of criminal procedure": 1973,
  "indian evidence act": 1872,
  "bharatiya nyaya sanhita": 2023,
  "bharatiya nagarik suraksha sanhita": 2023,
  "bharatiya sakshya adhiniyam": 2023,
  "indian contract act": 1872,
  "consumer protection act": 2019,
  "model tenancy act": 2021,
  "motor vehicles act": 1988,
  "hindu marriage act": 1955,
  "companies act": 2013,
  "information technology act": 2000,
  "right to information act": 2005,
  "code of civil procedure": 1908,
};

// Formatted for embedding directly in an LLM prompt, same purpose as
// CODE_CROSSWALK_REFERENCE — the model always has the correct year in front of it rather
// than relying on training-data recall, which is exactly where a small/free model drifts.
export const ACT_YEAR_REFERENCE = Object.entries(ACT_YEARS)
  .map(([name, year]) => `${name.replace(/\b\w/g, (c) => c.toUpperCase())} ${year}`)
  .join("; ");

// One regex per known Act, matched case-insensitively against the Act's name with an
// OPTIONAL trailing year — captures whether a year immediately follows (allowing a comma,
// "of", or nothing in between, e.g. "Payment of Wages Act, 1936" / "Payment of Wages Act of
// 1936" / "Payment of Wages Act 1936"). Built lazily (not at module scope) so a change to
// ACT_YEARS doesn't need a second hand-maintained list in sync with it.
function actMentionRegexes() {
  return Object.entries(ACT_YEARS).map(([name, year]) => ({
    name,
    year,
    re: new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b(?!\\s*(?:,?\\s*(?:of\\s+)?${year}\\b))`, "i"),
  }));
}

/**
 * True when `text` names a well-known Act (from ACT_YEARS) without its correct year
 * appearing right after it — e.g. "the Payment of Wages Act" with no "1936" anywhere nearby,
 * or a wrong year attached. Mirrors citesOnlyRepealedCode's "verify independently, never
 * trust the model's own recall" posture.
 */
export function citesActWithoutYear(text) {
  const s = String(text || "");
  return actMentionRegexes().some(({ re }) => re.test(s));
}

const SECTION_RE = /\bsection\s*(\d+[a-z]?)\b|\bsec\.?\s*(\d+[a-z]?)\b|\b(\d+[a-z]?)\s*(crpc|cr\.p\.c|ipc|bnss|bns|cpc)\b/gi;

function findActKey(text) {
  const lower = text.toLowerCase();
  for (const [short] of ACT_ALIASES) {
    if (new RegExp(`\\b${short.replace(/\./g, "\\.")}\\b`, "i").test(lower)) return short.replace(/[.\s]/g, "");
  }
  return null;
}

/**
 * @param {string} query - raw user question.
 * @returns {string[]} the original query plus alternate phrasings worth also retrieving
 *   with — never more than a handful, so this stays cheap to run every one through.
 */
export function expandLegalQuery(query) {
  const variants = new Set([query]);
  const lower = query.toLowerCase();

  for (const [short, canonical] of ACT_ALIASES) {
    const re = new RegExp(`\\b${short.replace(/\./g, "\\.")}\\b`, "i");
    if (re.test(lower)) variants.add(query.replace(re, canonical));
  }

  const actKey = findActKey(query);
  let sectionMatch;
  const sectionRe = new RegExp(SECTION_RE);
  while ((sectionMatch = sectionRe.exec(query))) {
    const num = (sectionMatch[1] || sectionMatch[2] || sectionMatch[3] || "").toLowerCase();
    const actFromToken = (sectionMatch[4] || actKey || "").toLowerCase().replace(/[.\s]/g, "");
    if (!num || !actFromToken) continue;
    const crossed = SECTION_CROSSWALK[`${actFromToken}:${num}`];
    if (crossed) {
      for (const [newAct, newSection] of crossed) variants.add(`Section ${newSection} ${newAct.toUpperCase()}`);
    }
  }

  return [...variants].slice(0, 5);
}

/**
 * Short keyword phrases worth an exact (ILIKE) lexical search alongside the vector search —
 * section numbers, the kind of token a dense embedding can blur past but a keyword match
 * catches exactly. Deliberately does NOT include the bare act name on its own (unlike
 * expandLegalQuery's vector-search variants) — a lexical hit from research.js's
 * hybridRetrieve gets floor-scored in at the relevance threshold with no further relevance
 * check, so a term here must be specific enough that matching it is itself meaningful
 * evidence of relevance. "Section 125" is specific; "Code of Criminal Procedure" alone is
 * not — confirmed live, it alone pulled 45 unrelated CrPC chunks (bail/CBI/insurance
 * cases, nothing to do with maintenance) into "Can a wife claim maintenance under Section
 * 125 CrPC after divorce?"'s result set, drowning out the one genuinely relevant case
 * ("Section 125" alone matched that same case and only it). The BNS/BNSS/BSA crosswalk
 * number is qualified with its act for the same reason — a bare "Section 144" collides
 * with Section 144 of half a dozen unrelated Acts.
 * @returns {string[]}
 */
export function extractLexicalTerms(query) {
  const terms = new Set();
  let m;
  const secRe = /\bsection\s*\d+[a-z]?\b/gi;
  while ((m = secRe.exec(query))) terms.add(m[0].replace(/\s+/g, " "));
  const bareNumRe = /\b\d+[a-z]?\s*(?:crpc|cr\.p\.c|ipc|bnss|bns|cpc)\b/gi;
  while ((m = bareNumRe.exec(query))) terms.add(m[0]);

  const actKey = findActKey(query);
  const sectionRe = new RegExp(SECTION_RE);
  while ((m = sectionRe.exec(query))) {
    const num = (m[1] || m[2] || m[3] || "").toLowerCase();
    const act = (m[4] || actKey || "").toLowerCase().replace(/[.\s]/g, "");
    const crossed = SECTION_CROSSWALK[`${act}:${num}`];
    if (crossed) for (const [newAct, newSection] of crossed) terms.add(`Section ${newSection} ${newAct.toUpperCase()}`);
  }
  return [...terms];
}

// Two-or-more consecutive Capitalized words (each >=3 letters, so "I"/"Mr"/"Ok" never match)
// read as a proper-noun phrase — a party or case name ("Kesavananda Bharati", "Maneka
// Gandhi") a dense embedding can blur past entirely (especially an unusual name the model
// has never seen tied to the doctrine it's actually about: confirmed live, "Kesavananda
// Bharati basic structure" scored its own namesake passage only 0.45, below the 0.55
// threshold, even though the passage literally opens "the concept of 'the basic structure'
// was first propounded in ... Kesavananda Bharati") but an exact keyword match catches
// directly regardless of how borderline the cosine similarity is. Kept separate from
// extractLexicalTerms' section-number terms because callers treat an exact case-name hit as
// a stronger, unconditional "accept this" signal (see hybridRetrieve in research.js) rather
// than the gentler score bump a generic lexical hit gets.
const PROPER_NOUN_RUN_RE = /\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){1,4}\b/g;

/** @returns {string[]} candidate case/party-name phrases found in `query`, longest matches only. */
export function extractCaseNameTerms(query) {
  return [...new Set((String(query || "").match(PROPER_NOUN_RUN_RE) || []))];
}

// A user who explicitly names a court is asking to see passages from THAT court, not
// whichever court's passage happened to score highest — used to boost/filter candidates.
const COURT_INTENT = [
  [/\bsupreme\s+court\b/i, "supreme_court"],
  [/\bhigh\s+courts?\b/i, "high_court"],
];

/** @returns {string|null} 'supreme_court' | 'high_court' | null */
export function detectCourtIntent(query) {
  const hit = COURT_INTENT.find(([re]) => re.test(query));
  return hit ? hit[1] : null;
}
