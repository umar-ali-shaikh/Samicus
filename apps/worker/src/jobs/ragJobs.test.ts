import { test, mock } from "node:test";
import assert from "node:assert/strict";
import type { PgBoss } from "pg-boss";

let ragEnabledValue = true;
let reindexCalls = 0;
let indexClauseLibraryCalls = 0;
let reprocessCalls = 0;
let updateCall: { table: string; patch: unknown } | null = null;

mock.module("@vidhira/rag/ingest", {
  namedExports: {
    ragEnabled: () => ragEnabledValue,
    reindexPending: async () => {
      reindexCalls += 1;
      return 7;
    },
  },
});
mock.module("@vidhira/rag/clauses", {
  namedExports: {
    indexClauseLibrary: async () => {
      indexClauseLibraryCalls += 1;
      return { indexed: 3 };
    },
  },
});
mock.module("@vidhira/rag/reprocess", {
  namedExports: {
    reprocessExistingPassages: async () => {
      reprocessCalls += 1;
      return { scanned: 10, textChanged: 2, reclassified: 1, dropped: 0 };
    },
  },
});
mock.module("../config/db.js", {
  namedExports: {
    getSupabase: () => ({
      from: (table: string) => ({
        update: (patch: unknown) => {
          updateCall = { table, patch };
          return { not: async () => ({ error: null }) };
        },
      }),
    }),
  },
});

const { registerRagJobs, QUEUES } = await import("./ragJobs.js");

// Captures the handler registered for each queue so tests can invoke it directly without a
// real pg-boss/Postgres instance -- createQueue/work are the only two methods registerRagJobs
// calls on the boss it's given.
function fakeBoss() {
  const createdQueues: string[] = [];
  const handlers: Record<string, (jobs: unknown[]) => Promise<unknown>> = {};
  const boss = {
    createQueue: async (name: string) => {
      createdQueues.push(name);
    },
    work: async (name: string, handler: (jobs: unknown[]) => Promise<unknown>) => {
      handlers[name] = handler;
      return "fake-worker-id";
    },
  };
  return { boss: boss as unknown as PgBoss, createdQueues, handlers };
}

test("registerRagJobs() creates all three queues and registers a handler for each", async () => {
  const { boss, createdQueues, handlers } = fakeBoss();
  await registerRagJobs(boss);

  assert.deepEqual(createdQueues, [QUEUES.reindex, QUEUES.reembedAll, QUEUES.reprocess]);
  assert.equal(typeof handlers[QUEUES.reindex], "function");
  assert.equal(typeof handlers[QUEUES.reembedAll], "function");
  assert.equal(typeof handlers[QUEUES.reprocess], "function");
});

test("rag:reindex handler calls reindexPending() and indexClauseLibrary()", async () => {
  ragEnabledValue = true;
  reindexCalls = 0;
  indexClauseLibraryCalls = 0;
  const { boss, handlers } = fakeBoss();
  await registerRagJobs(boss);

  await handlers[QUEUES.reindex]!([{}]);

  assert.equal(reindexCalls, 1);
  assert.equal(indexClauseLibraryCalls, 1);
});

test("rag:reembed-all handler clears embedded_at before reindexing", async () => {
  ragEnabledValue = true;
  reindexCalls = 0;
  indexClauseLibraryCalls = 0;
  updateCall = null;
  const { boss, handlers } = fakeBoss();
  await registerRagJobs(boss);

  await handlers[QUEUES.reembedAll]!([{}]);

  assert.deepEqual(updateCall, { table: "corpus_chunks", patch: { embedded_at: null } });
  assert.equal(reindexCalls, 1);
  assert.equal(indexClauseLibraryCalls, 1);
});

test("rag:reprocess handler calls reprocessExistingPassages()", async () => {
  ragEnabledValue = true;
  reprocessCalls = 0;
  const { boss, handlers } = fakeBoss();
  await registerRagJobs(boss);

  await handlers[QUEUES.reprocess]!([{}]);

  assert.equal(reprocessCalls, 1);
});

test("every handler refuses to run when RAG isn't configured", async () => {
  ragEnabledValue = false;
  const { boss, handlers } = fakeBoss();
  await registerRagJobs(boss);

  await assert.rejects(() => handlers[QUEUES.reindex]!([{}]), /Set QDRANT_URL and OPENROUTER_API_KEY/);
  await assert.rejects(() => handlers[QUEUES.reembedAll]!([{}]), /Set QDRANT_URL and OPENROUTER_API_KEY/);
  await assert.rejects(() => handlers[QUEUES.reprocess]!([{}]), /Set QDRANT_URL and OPENROUTER_API_KEY/);
});
