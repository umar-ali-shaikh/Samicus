import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/server/supabase";

/**
 * Shared landing point for every Supabase redirect-based auth flow (Google OAuth, email
 * confirmation, password recovery) -- all use PKCE (flowType: "pkce"), so they all arrive here
 * with a `?code=` to exchange for a session. `next` controls where the browser lands afterwards
 * (e.g. /reset-password for the recovery flow); defaults to /dashboard.
 *
 * This IS a BFF route per docs/MASTER-PROMPT.md's target_structure ("app/api/bff/**\/route.ts
 * thin proxies only: ... Supabase auth callback") -- it exists because cookies can only be set
 * from a Server Function or Route Handler, never from a Server Component.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
