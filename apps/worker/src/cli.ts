// Enqueues RAG jobs -- replaces apps/api's old `npm run rag:*` scripts (apps/api/src/utils/rag.js),
// which ran these inline. `status` is a direct read (not a job: nothing to queue for a
// synchronous count), everything else sends a job for this app's own worker loop (src/index.ts)
// to pick up.
//   npm run rag:reindex      embed any chunk that has no vector yet, then the clause library
//   npm run rag:reembed-all  force every chunk to be re-embedded (e.g. after switching the
//                            embedding provider/model)
//   npm run rag:reprocess    re-run entity decoding / page-artifact stripping / paragraph
//                            reclassification over EXISTING passages
//   npm run rag:status       show Qdrant / Postgres counts (reads directly, no job enqueued)
import "./config/env.js";
import { getSupabase } from "./config/db.js";
import { setSupabaseClient } from "@vidhira/rag/supabaseClient";
import { ragEnabled } from "@vidhira/rag/ingest";
import { knowledgeBaseStats } from "@vidhira/rag/retrieve";
import { getBoss } from "./boss.js";
import { QUEUES } from "./jobs/ragJobs.js";

setSupabaseClient(getSupabase());

const cmd = process.argv[2];

async function main() {
  if (!ragEnabled()) throw new Error("Set QDRANT_URL and OPENROUTER_API_KEY first.");

  if (cmd === "status") {
    const sb = getSupabase();
    const [{ count: docs }, { count: chunks }, { count: pending }] = await Promise.all([
      sb.from("corpus_documents").select("*", { count: "exact", head: true }),
      sb.from("corpus_chunks").select("*", { count: "exact", head: true }),
      sb.from("corpus_chunks").select("*", { count: "exact", head: true }).is("embedded_at", null),
    ]);
    console.log({ postgres: { documents: docs, chunks, pendingEmbedding: pending }, qdrant: await knowledgeBaseStats() });
    return;
  }

  const queue = cmd === "reindex" ? QUEUES.reindex : cmd === "reembed-all" ? QUEUES.reembedAll : cmd === "reprocess" ? QUEUES.reprocess : null;
  if (!queue) {
    console.log("Usage: tsx src/cli.ts <reindex|reembed-all|reprocess|status>");
    return;
  }

  const boss = getBoss();
  await boss.start();
  await boss.createQueue(queue);
  const id = await boss.send(queue, {});
  console.log(`Enqueued "${cmd}" as job ${id}. Run apps/worker's own process (npm run dev/start) to have it picked up.`);
  await boss.stop({ graceful: false });
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
