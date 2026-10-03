import { createClient } from "@supabase/supabase-js";

let client;

// Lazily created, memoized singleton — mirrors the old connectDB()'s one-connection-
// per-process model, just without an explicit connect step (the Supabase client is a
// thin REST wrapper, not a persistent connection to manage).
export function getSupabase() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set — see backend/.env.example.");
    }
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}
