// RAG batch jobs -- replaces apps/api/src/utils/rag.js's CLI (reindex/reembed-all/reprocess),
// which called these same @vidhira/rag functions inline. apps/api only enqueues now (or, until
// an admin UI trigger exists, operators enqueue via this app's own CLI -- see cli.ts); this app
// processes.
import type { PgBoss } from "pg-boss";
import { reindexPending, ragEnabled } from "@vidhira/rag/ingest";
import { indexClauseLibrary } from "@vidhira/rag/clauses";
import { reprocessExistingPassages } from "@vidhira/rag/reprocess";
import { getSupabase } from "../config/db.js";
import { logger } from "../logger.js";

export const QUEUES = {
  reindex: "rag:reindex",
  reembedAll: "rag:reembed-all",
  reprocess: "rag:reprocess",
} as const;

async function runReindex() {
  if (!ragEnabled()) throw new Error("Set QDRANT_URL and OPENROUTER_API_KEY first.");
  const chunks = await reindexPending();
  const clauses = await indexClauseLibrary();
  logger.info(`Embedded ${chunks} pending passages and ${clauses.indexed} clause-library entries.`);
}

export async function registerRagJobs(boss: PgBoss): Promise<void> {
  for (const queue of Object.values(QUEUES)) await boss.createQueue(queue);

  await boss.work(QUEUES.reindex, async () => {
    await runReindex();
  });

  await boss.work(QUEUES.reembedAll, async () => {
    if (!ragEnabled()) throw new Error("Set QDRANT_URL and OPENROUTER_API_KEY first.");
    // Qdrant upsertPoints writes by chunk id, so clearing embedded_at and re-running the
    // normal "pending" path overwrites each existing point with its new vector in place --
    // no need to delete/recreate the collection as long as the new model's dimension still
    // matches qdrant.ts's VECTOR_SIZE.
    const { error } = await getSupabase().from("corpus_chunks").update({ embedded_at: null }).not("id", "is", null);
    if (error) throw error;
    await runReindex();
  });

  await boss.work(QUEUES.reprocess, async () => {
    if (!ragEnabled()) throw new Error("Set QDRANT_URL and OPENROUTER_API_KEY first.");
    const { scanned, textChanged, reclassified, dropped } = await reprocessExistingPassages();
    logger.info(`Scanned ${scanned} passages: ${textChanged} had text cleaned up, ${reclassified} were reclassified, ${dropped} flagged as page artifacts.`);
  });
}
