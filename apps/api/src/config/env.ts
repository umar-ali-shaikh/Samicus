/**
 * Single shared .env lives at the repo root (not inside apps/api/) so apps/api and apps/worker
 * read the same file. Loaded by Node's own `--env-file-if-exists` flag (every npm script that
 * runs this app passes `--env-file-if-exists=../../.env`, relative to apps/api/'s own cwd) --
 * not dotenv, per docs/MASTER-PROMPT.md's "no dotenv -- use node --env-file" rule. Side-effecting
 * import -- `import "./config/env.js"` at the
 * top of index.js runs this before anything else touches process.env.
 *
 * Replaces the old plain-dotenv env.js: validates every var with Zod and fails loudly (throws
 * before the server starts listening) on anything missing/malformed, per
 * docs/MASTER-PROMPT.md's "Zod-validated env at boot in each app... fail fast".
 */
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_DOCUMENT_BUCKET: z.string().min(1).default("documents"),

  CLIENT_ORIGIN: z.string().min(1).default("http://localhost:3000"),
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

  // Optional: shared state across horizontally-scaled instances (platform/cache.ts,
  // platform/rateLimit.ts). Unset -> each instance falls back to its own in-process Map, same
  // behaviour as before Redis was introduced.
  REDIS_URL: z.string().optional(),

  // Optional: direct Postgres connection for pg-boss (apps/worker's job queue -- apps/api only
  // enqueues). Distinct from SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY, which talk to Supabase's
  // REST API, not raw Postgres; pg-boss needs a real connection string (Supabase project
  // settings -> Database -> Connection string). Unset -> enqueue calls fail loudly when used,
  // same "optional integration, fails at use not at boot" pattern as Qdrant/OpenRouter/Razorpay.
  DATABASE_URL: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment configuration:\n${lines}\nSee .env.example.`);
}

if (parsed.data.NODE_ENV === "production" && !process.env.CLIENT_ORIGIN) {
  console.warn("CLIENT_ORIGIN is not set — CORS will only allow http://localhost:3000.");
}

export const env: Env = parsed.data;
