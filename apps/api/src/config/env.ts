/**
 * Zod-validated environment schema for apps/api, mirroring every variable env.js/db.js/the
 * route files currently read from process.env directly (see docs/architecture/00-inventory.md
 * and the root .env.example). NOT YET WIRED IN -- apps/api still boots via config/env.js
 * (plain dotenv, no validation) per MASTER-PROMPT.md Phase 1's "AS-IS first" rule. This file
 * is adopted module-by-module starting Phase 2, replacing config/env.js once every call site
 * that reads process.env directly has been ported to import `env` from here instead.
 */
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_DOCUMENT_BUCKET: z.string().min(1).default("documents"),

  CLIENT_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  ADMIN_EMAILS: z.string().optional().default(""),
  FOUNDER_EMAILS: z.string().optional().default(""),

  QDRANT_URL: z.string().url().optional(),
  QDRANT_API_KEY: z.string().optional(),
  QDRANT_COLLECTION: z.string().default("vidhira_legal"),
  QDRANT_CLAUSE_COLLECTION: z.string().default("vidhira_clauses"),

  RAG_MIN_SCORE: z.coerce.number().default(0.55),
  RAG_SKIP_LIVE_SEARCH_SCORE: z.coerce.number().default(0.72),
  RAG_SKIP_LIVE_MIN_PASSAGES: z.coerce.number().int().default(3),

  OPENROUTER_EMBEDDING_MODEL: z.string().default("sentence-transformers/all-mpnet-base-v2"),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default("openai/gpt-oss-20b"),
  OPENROUTER_FALLBACK_MODEL: z.string().optional(),

  RESEARCH_NOTE_V2: z.string().optional(),

  IK_API_TOKEN: z.string().optional(),
  TAVILY_API_KEY: z.string().optional(),

  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  VIDEO_BASE_URL: z.string().url().default("https://meet.jit.si"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Fails loudly (throws) on first call if a required var is missing/invalid. Lazy so tests can set env first. */
export function loadEnv(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Invalid environment configuration:\n${parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n")}`);
    }
    cached = parsed.data;
  }
  return cached;
}
