import "./config/env.js";
import { getSupabase } from "./config/db.js";
import { setSupabaseClient } from "@vidhira/rag/supabaseClient";
import { logger } from "./logger.js";

// @vidhira/rag never imports either app's own config/db.js -- each app wires its own
// Supabase client in once at boot, same as apps/api/src/index.js does. The Qdrant/embeddings
// call hooks are left unset here (apps/api's cost-dashboard call counter is that app's own
// concern, not this one's) -- @vidhira/rag no-ops a request hook that was never set.
setSupabaseClient(getSupabase());

// Phase 4's job table + handlers (reindex/reembed-all/reprocess, replacing apps/api's
// utils/rag.js CLI) land in a follow-up slice -- this boots cleanly with nothing registered.
logger.info("worker: skeleton boot, no jobs registered yet (see Phase 4)");
