import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);

// The anon key is public by design; the database denies it every table (see schema.sql), so all
// data access goes through the API with the user's access token. Supabase Auth only handles
// sign-in (Google OAuth 2.0 and email/password with email verification).
export const supabase = supabaseConfigured
  ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" } })
  : null;
