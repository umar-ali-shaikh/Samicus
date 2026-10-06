// Seeds 3 example Research Library reports (run once per environment, like `npm run seed`):
//   npm run seed:research-examples
//
// Run through the REAL pipeline (retrieve -> answer, same code path a live user search
// takes) so these are genuine reports, not fixtures — just tagged "example" so they're
// visible to every signed-in user (no owning account) and shown on a cold-start library
// (see routes/research.js's loadQueryForReport / GET /research/queries?tag=example).
//
// Safe to re-run: skips a question if an example with that exact text already exists.
import "../config/env.js";
import { getSupabase } from "../config/db.js";
import { retrieve, answerFromRetrieval, generateResearchInsights, relevanceThreshold, findRelatedCases, detectLanguage } from "../services/research.js";
import { ragEnabled } from "../services/rag/ingest.js";

const MODEL_VERSION = "sentence-transformers/all-mpnet-base-v2+qdrant";
const TITLE_MAX = 80;
const deriveTitle = (text) => (text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX - 1)}…` : text);

const EXAMPLE_QUESTIONS = [
  "Is a cheque bounce complaint under Section 138 NI Act maintainable after 30 days of notice?",
  "Anticipatory bail under Section 482 BNSS / 438 CrPC in matrimonial disputes",
  "Tenant eviction for bona fide personal need: landmark Supreme Court judgments",
];

async function seedOne(supabase, text) {
  const { data: existing, error: existingError } = await supabase
    .from("research_queries")
    .select("id")
    .eq("text", text)
    .contains("tags", ["example"])
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    console.log(`Already seeded, skipping: "${text}"`);
    return;
  }

  const threshold = relevanceThreshold();
  const [scored, locale] = await Promise.all([retrieve(text), detectLanguage(text)]);

  const { data: query, error: queryError } = await supabase
    .from("research_queries")
    .insert({
      account_id: null, // globally visible — see loadQueryForReport in routes/research.js
      text,
      title: deriveTitle(text),
      locale,
      threshold,
      model_version: MODEL_VERSION,
      outcome: scored.some((s) => s.score >= threshold) ? "answered" : "not_found",
      tags: ["example"],
    })
    .select()
    .single();
  if (queryError) throw queryError;

  if (scored.length === 0) {
    console.warn(`No evidence found for "${text}" — seeded as not_found. Ask it in the AI Legal Assistant first to build up the knowledge base, then re-run this script.`);
    return;
  }

  const { error: chunksError } = await supabase
    .from("research_query_chunks")
    .insert(scored.map((s, i) => ({ query_id: query.id, chunk_id: s.chunk.id, score: s.score, position: i })));
  if (chunksError) throw chunksError;

  const result = await answerFromRetrieval(scored);
  if (result.outcome === "not_found") {
    await supabase.from("research_queries").update({ outcome: "not_found" }).eq("id", query.id);
    console.warn(`Only non-citable passages found for "${text}" — seeded as not_found.`);
    return;
  }

  const { data: answer, error: answerError } = await supabase
    .from("research_answers")
    .insert({ query_id: query.id, unsupported_span_count: result.unsupportedSpanCount })
    .select()
    .single();
  if (answerError) throw answerError;

  const { error: segmentsError } = await supabase
    .from("research_answer_segments")
    .insert(result.segments.map((s, i) => ({ research_answer_id: answer.id, position: i, text: s.text, chunk_id: s.chunkId })));
  if (segmentsError) throw segmentsError;

  const [insights, relatedCaseIds] = await Promise.all([
    generateResearchInsights(text, result.segments, { language: locale }),
    findRelatedCases(result.segments[0], result.segments.map((s) => s.documentId).filter(Boolean)),
  ]);
  const caseCards = {};
  for (const seg of result.segments) {
    caseCards[seg.chunkId] = { ...(insights.caseCards[seg.chunkId] || {}), gloss: insights.glosses[seg.chunkId] || null };
  }
  const { error: updateError } = await supabase
    .from("research_answers")
    .update({ summary: insights.summary, case_cards: caseCards, related_searches: insights.relatedSearches, related_case_ids: relatedCaseIds })
    .eq("id", answer.id);
  if (updateError) throw updateError;

  console.log(`Seeded: "${text}" — ${result.segments.length} case(s), outcome=${result.outcome}`);
}

async function main() {
  if (!ragEnabled()) throw new Error("Set QDRANT_URL and OPENROUTER_API_KEY first.");
  const supabase = getSupabase();
  for (const question of EXAMPLE_QUESTIONS) {
    await seedOne(supabase, question);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
