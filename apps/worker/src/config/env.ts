/**
 * Same shared-root-.env + Zod-validated-fail-fast pattern as apps/api/src/config/env.ts --
 * both apps read the SAME .env file at the repo root, loaded by Node's own
 * `--env-file-if-exists` flag (every npm script that runs this app passes
 * `--env-file-if-exists=../../.env`), not dotenv. Side-effecting import: `import
 * "./config/env.js"` at the top of index.ts runs this before anything else touches
 * process.env (including @vidhira/rag's functions, which read QDRANT_* and OPENROUTER_*
 * vars directly off process.env rather than through this validated object).
 */
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Direct Postgres connection for pg-boss's job table (apps/api only enqueues, this app
  // processes). Distinct from SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY, which talk to
  // Supabase's REST API, not raw Postgres -- see apps/api/src/config/env.ts's own comment
  // on this same distinction. Required here (unlike apps/api, where it's optional): a worker
  // that can't reach its job table has nothing to do.
  DATABASE_URL: z.string().min(1),

  QDRANT_URL: z.string().url().optional(),
  QDRANT_API_KEY: z.string().optional(),
  QDRANT_COLLECTION: z.string().default("vidhira_legal"),
  QDRANT_CLAUSE_COLLECTION: z.string().default("vidhira_clauses"),

  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_EMBEDDING_MODEL: z.string().default("sentence-transformers/all-mpnet-base-v2"),

  LOG_LEVEL: z.string().default("info"),
});

export type Env = z.infer<typeof schema>;

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment configuration:\n${lines}\nSee .env.example.`);
}

export const env: Env = parsed.data;
