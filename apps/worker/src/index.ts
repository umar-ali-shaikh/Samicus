/**
 * Boot-only skeleton. Phase 4 moves the RAG ingest/reindex/reprocess/reembed commands here
 * (currently apps/api/src/utils/rag.js + apps/api/src/services/rag/*) and adds the
 * pg-boss-backed job table so apps/api only enqueues work and polls status.
 */
import { logger } from "./logger.js";

logger.info("worker: skeleton boot, no jobs registered yet (see Phase 4)");
