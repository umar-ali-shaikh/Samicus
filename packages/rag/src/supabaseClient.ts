import type { SupabaseClient } from "@supabase/supabase-js";

// No Database type is generated for this project (the rest of the backend talks to Supabase
// from plain, untyped JS) -- typing this as SupabaseClient<any, any, any> rather than the
// unparameterized SupabaseClient keeps .from(table).select("a:b(c)")-style embedded-join
// selects from triggering supabase-js's literal-string relationship inference, which (with
// no real schema to consult) guesses the embed's cardinality wrong for this codebase's joins.
type AnySupabaseClient = SupabaseClient<any, any, any>;

// Each app (apps/api, apps/worker) owns its own Supabase client lifecycle (env loading,
// service-role key) and wires it in once at boot -- this package never imports a specific
// app's config/db.js directly, the same injection pattern as qdrant.ts's request hook and
// embeddings.ts's request hook.
let client: AnySupabaseClient | null = null;

export function setSupabaseClient(c: AnySupabaseClient): void {
  client = c;
}

export function getSupabaseClient(): AnySupabaseClient {
  if (!client) throw new Error("@vidhira/rag: setSupabaseClient() must be called at boot before using this package's DB-backed functions.");
  return client;
}
