// CLI for the vector knowledge base:
//   npm run rag:reindex      embed any chunk that has no vector yet, then the clause library
//   npm run rag:reembed-all  force every chunk to be re-embedded (e.g. after switching the
//                            embedding provider/model — old vectors live in a different,
//                            incomparable coordinate space and must all be recomputed)
//   npm run rag:status       show Qdrant / Postgres counts
import "../config/env.js";
import { getSupabase } from "../config/db.js";
import { reindexPending, ragEnabled } from "../services/rag/ingest.js";
import { indexClauseLibrary } from "../services/rag/clauses.js";
import { knowledgeBaseStats } from "../services/rag/retrieve.js";

const cmd = process.argv[2];

async function main() {
  if (!ragEnabled()) throw new Error("Set QDRANT_URL and OPENROUTER_API_KEY first.");
  if (cmd === "reindex" || cmd === "reembed-all") {
    if (cmd === "reembed-all") {
      // Qdrant upsertPoints writes by chunk id, so clearing embedded_at and re-running the
      // normal "pending" path overwrites each existing point with its new vector in place —
      // no need to delete/recreate the collection as long as the new model's dimension still
      // matches rag/qdrant.js's VECTOR_SIZE.
      const { error } = await getSupabase().from("corpus_chunks").update({ embedded_at: null }).not("id", "is", null);
      if (error) throw error;
    }
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
    console.log("Usage: node src/utils/rag.js <reindex|reembed-all|status>");
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
