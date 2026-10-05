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
 * section numbers and act names, the kind of token a dense embedding can blur past but a
 * keyword match catches exactly.
 * @returns {string[]}
 */
export function extractLexicalTerms(query) {
  const terms = new Set();
  let m;
  const secRe = /\bsection\s*\d+[a-z]?\b/gi;
  while ((m = secRe.exec(query))) terms.add(m[0].replace(/\s+/g, " "));
  const bareNumRe = /\b\d+[a-z]?\s*(?:crpc|cr\.p\.c|ipc|bnss|bns|cpc)\b/gi;
  while ((m = bareNumRe.exec(query))) terms.add(m[0]);
  for (const [short, canonical] of ACT_ALIASES) {
    if (new RegExp(`\\b${short.replace(/\./g, "\\.")}\\b`, "i").test(query)) terms.add(canonical);
  }

  const actKey = findActKey(query);
  const sectionRe = new RegExp(SECTION_RE);
  while ((m = sectionRe.exec(query))) {
    const num = (m[1] || m[2] || m[3] || "").toLowerCase();
    const act = (m[4] || actKey || "").toLowerCase().replace(/[.\s]/g, "");
    const crossed = SECTION_CROSSWALK[`${act}:${num}`];
    if (crossed) for (const [, newSection] of crossed) terms.add(`Section ${newSection}`);
  }
  return [...terms];
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
