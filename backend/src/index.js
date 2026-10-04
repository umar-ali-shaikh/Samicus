import "./config/env.js";

import { createApp } from "./app.js";
import { getSupabase } from "./config/db.js";
import { seedAll } from "./seed/seed.js";
import { ensureDocumentBucket } from "./services/storage.js";
import { ensureClauseIndex } from "./services/rag/clauses.js";
import { ragEnabled } from "./services/rag/ingest.js";

const PORT = process.env.PORT || 4000;

function checkEnv() {
  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")} — see .env.example.`);
  }
  if (process.env.NODE_ENV === "production" && !process.env.CLIENT_ORIGIN) {
    console.warn("CLIENT_ORIGIN is not set — CORS will only allow http://localhost:5173.");
  }
}

async function main() {
  checkEnv();
  const supabase = getSupabase();

  // Fails fast with a clear message if the schema has not been applied yet.
  const { count, error } = await supabase.from("practice_areas").select("*", { count: "exact", head: true });
  if (error) {
    throw new Error(`Cannot read the database (${error.message}). Run backend/src/db/schema.sql in the Supabase SQL editor first.`);
  }
  // Only the reference catalogues (practice areas, situations, document templates) — never demo data.
  if (count === 0) await seedAll();

  await ensureDocumentBucket();

  if (ragEnabled()) {
    ensureClauseIndex().catch((err) => console.error("Clause library indexing failed:", err.message));
  } else {
    console.warn("RAG is off: set QDRANT_URL and GEMINI_API_KEY to enable the knowledge base, research library and contract review.");
  }

  const app = createApp();
  app.listen(PORT, () => console.log(`Vidhira API listening on :${PORT}`));
}

main().catch((err) => {
  console.error("Failed to start server:", err.message);
  process.exit(1);
});
