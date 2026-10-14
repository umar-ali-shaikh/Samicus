import "./config/env.js";
import { getSupabase } from "./config/db.js";
import { setSupabaseClient } from "@vidhira/rag/supabaseClient";
import { getBoss } from "./boss.js";
import { registerRagJobs } from "./jobs/ragJobs.js";
import { logger } from "./logger.js";

// @vidhira/rag never imports either app's own config/db.js -- each app wires its own
// Supabase client in once at boot, same as apps/api/src/index.js does. The Qdrant/embeddings
// call hooks are left unset here (apps/api's cost-dashboard call counter is that app's own
// concern, not this one's) -- @vidhira/rag no-ops a request hook that was never set.
setSupabaseClient(getSupabase());

async function main() {
  const boss = getBoss();
  await boss.start();
  await registerRagJobs(boss);
  logger.info("worker: listening for rag:reindex, rag:reembed-all, rag:reprocess jobs");
}

main().catch((err) => {
  logger.error({ err }, "worker failed to start");
  process.exit(1);
});
