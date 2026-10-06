// Runs a fixed set of previously-"No match" research queries straight through
// retrieve() + answerFromRetrieval() against the REAL corpus/Qdrant/Indian Kanoon (no
// mocks) and prints outcome, top score, chunk count and not_found reason for each —
// a quick guard against regressing the fixes in research.js around auto-fetch-and-index,
// cross-lingual retrieval, and hybrid retrieval. Needs the same env as the server
// (QDRANT_URL, OPENROUTER_API_KEY, IK_API_TOKEN, SUPABASE_*) — run with:
//   node src/scripts/researchRetrievalCheck.js
import "../config/env.js";
import { retrieve, answerFromRetrieval } from "../services/research.js";

const QUERIES = [
  // Previously not_found — corpus gap, should now trigger a successful live-fetch.
  { q: "Can my employer enforce a non-compete after I resign?", expect: "should find something (live-fetch)" },
  // Previously not_found — live-fetch existed but its 0.5 embedding floor rejected every
  // IK candidate (best scored 0.465 on title+headline alone) on every single re-run.
  { q: "Kesavananda Bharati basic structure", expect: "should find something (live-fetch, relaxed floor)" },
  // Previously not_found — abbreviation expansion never recognised "NI Act" as a unit.
  { q: "Section 138 NI Act cheque bounce", expect: "should match corpus (hybrid retrieval / alias fix)" },
  // Already-working phrasing for the same provision — must keep working (regression guard).
  { q: "Section 138 Negotiable Instruments Act", expect: "regression: must still match" },
  // Previously not_found — Devanagari-script query lost every citable segment to the
  // term-overlap gate's Latin-only tokenizer even though its own embedding score was 0.76+.
  { q: "तलाक के बाद पत्नी को गुजारा भत्ता मिलेगा क्या?", expect: "should find something (cross-lingual relevance gate fix)" },
  { q: "talak ke baad patni ko kharcha milega kya", expect: "should find something (Hinglish)" },
  { q: "domestic violence protection order", expect: "regression: must still match" },
  // Already-working — regression guard for the main English-language path.
  { q: "Can a wife claim maintenance under Section 125 CrPC after divorce?", expect: "regression: must still match" },
];

async function main() {
  const rows = [];
  for (const { q, expect } of QUERIES) {
    const t0 = Date.now();
    try {
      const { results, fetchedNewSources } = await retrieve(q, {});
      const ans = await answerFromRetrieval(q, results);
      rows.push({
        query: q.length > 50 ? `${q.slice(0, 50)}…` : q,
        outcome: ans.outcome,
        topScore: ans.topScore?.toFixed(2) ?? "—",
        chunks: ans.segments.length,
        reason: ans.reason || "—",
        fetchedNewSources,
        ms: Date.now() - t0,
        expect,
      });
    } catch (err) {
      rows.push({ query: q, outcome: "ERROR", topScore: "—", chunks: 0, reason: err.message, fetchedNewSources: false, ms: Date.now() - t0, expect });
    }
  }

  console.table(rows.map(({ query, outcome, topScore, chunks, reason, fetchedNewSources, ms }) => ({ query, outcome, topScore, chunks, reason, fetchedNewSources, ms })));

  const failures = rows.filter((r) => r.outcome === "not_found" || r.outcome === "ERROR");
  if (failures.length > 0) {
    console.log(`\n${failures.length} quer${failures.length === 1 ? "y" : "ies"} still not_found/errored:`);
    for (const f of failures) console.log(`  - "${f.query}" -> ${f.outcome} (${f.reason}) — expected: ${f.expect}`);
    process.exitCode = 1;
  } else {
    console.log("\nAll queries returned at least one chunk.");
  }
}

main().catch((err) => {
  console.error("researchRetrievalCheck failed:", err);
  process.exitCode = 1;
});
