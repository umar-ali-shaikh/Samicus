// CLI for the vector knowledge base:
//   npm run rag:reindex   embed any chunk that has no vector yet, then the clause library
//   npm run rag:status    show Qdrant / Postgres counts
import "../config/env.js";
import { getSupabase } from "../config/db.js";
import { reindexPending, ragEnabled } from "../services/rag/ingest.js";
import { indexClauseLibrary } from "../services/rag/clauses.js";
import { knowledgeBaseStats } from "../services/rag/retrieve.js";

const cmd = process.argv[2];

async function main() {
  if (!ragEnabled()) throw new Error("Set QDRANT_URL and GEMINI_API_KEY first.");
  if (cmd === "reindex") {
    const chunks = await reindexPending();
    const clauses = await indexClauseLibrary();
    console.log(`Embedded ${chunks} pending passages and ${clauses.indexed} clause-library entries.`);
  } else if (cmd === "status") {
    const sb = getSupabase();
    const [{ count: docs }, { count: chunks }, { count: pending }] = await Promise.all([
      sb.from("corpus_documents").select("*", { count: "exact", head: true }),
      sb.from("corpus_chunks").select("*", { count: "exact", head: true }),
      sb.from("corpus_chunks").select("*", { count: "exact", head: true }).is("embedded_at", null),
    ]);
    console.log({ postgres: { documents: docs, chunks, pendingEmbedding: pending }, qdrant: await knowledgeBaseStats() });
  } else {
    console.log("Usage: node src/utils/rag.js <reindex|status>");
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
