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

// The 2023-24 criminal-law replacements renumbered many sections. Only the handful that
// come up constantly in everyday questions are hardcoded here — this is a targeted aid for
// retrieval recall, not a substitute for a full section-mapping table.
const SECTION_CROSSWALK = {
  "crpc:125": [["bnss", "144"]], // maintenance of wives, children and parents
  "crpc:154": [["bnss", "173"]], // FIR / information in cognizable cases
  "crpc:482": [["bnss", "528"]], // High Court's inherent powers
  "crpc:438": [["bnss", "482"]], // anticipatory bail
  "ipc:302": [["bns", "103"]], // murder
  "ipc:420": [["bns", "318"]], // cheating
  "ipc:498a": [["bns", "85"]], // cruelty by husband/relatives
  "ipc:376": [["bns", "64"]], // rape
  "ipc:354": [["bns", "74"]], // assault/criminal force to woman
};

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
