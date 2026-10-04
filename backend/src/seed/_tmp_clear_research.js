// One-off cleanup: empties research_queries and everything hanging off it (example-tagged
// seed reports + any account's own "My Research" saved searches), per explicit user request.
// Does NOT touch corpus_documents/corpus_chunks (the shared RAG knowledge base).
import "../config/env.js";
import { getSupabase } from "../config/db.js";

const supabase = getSupabase();

async function countRows(table) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) throw error;
  return count;
}

async function deleteAll(table, column = "id") {
  const { error } = await supabase.from(table).delete().not(column, "is", null);
  if (error) throw error;
}

const before = {
  research_queries: await countRows("research_queries"),
  research_query_chunks: await countRows("research_query_chunks"),
  research_answers: await countRows("research_answers"),
  research_answer_segments: await countRows("research_answer_segments"),
  research_chat_turns: await countRows("research_chat_turns"),
};
console.log("Before:", before);

// Children first (no ON DELETE CASCADE on these FKs per schema.sql).
await deleteAll("research_chat_turns");
await deleteAll("research_answer_segments");
await deleteAll("research_answers");
await deleteAll("research_query_chunks");
await deleteAll("research_queries");

const after = {
  research_queries: await countRows("research_queries"),
  research_query_chunks: await countRows("research_query_chunks"),
  research_answers: await countRows("research_answers"),
  research_answer_segments: await countRows("research_answer_segments"),
  research_chat_turns: await countRows("research_chat_turns"),
};
console.log("After:", after);
