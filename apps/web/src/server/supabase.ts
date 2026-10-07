import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "./env";

/**
 * @supabase/ssr's own default cookie options are `{ httpOnly: false, sameSite: "lax" }` --
 * confirmed by reading @supabase/ssr's utils/constants.js (DEFAULT_COOKIE_OPTIONS) in
 * node_modules. httpOnly must be set explicitly here, or the session tokens would be readable
 * by browser JS, violating docs/MASTER-PROMPT.md's security requirements.
 *
 * Per the package's own docs (createServerClient.d.ts): always create a NEW client per
 * request/render, never share one across requests -- this is a factory, not a singleton.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookieOptions: {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, which can't set cookies -- safe to ignore because
          // proxy.ts refreshes the session and writes cookies back on every navigation anyway.
        }
      },
    },
  });
}
