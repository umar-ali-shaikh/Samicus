import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { routeManifest } from "@vidhira/contracts";
import { env } from "./server/env";

/**
 * Refreshes the Supabase session on every navigation (writing any rotated tokens back as
 * HttpOnly cookies) and applies the coarse role gate from packages/contracts' route manifest.
 * Named "proxy" (not "middleware") per Next.js 16's renamed file convention.
 *
 * This is NOT the only authorization layer -- Express re-verifies the JWT and re-checks role
 * and object-level policy on every request regardless of what this proxy allows through (see
 * docs/architecture/01-target-architecture.md section 2).
 *
 * Open question for Phase 3 (not solved here): the route manifest's `roles` gate needs the
 * caller's APP role (client/advocate/admin/founder), which lives in our `users` table, not in
 * the Supabase JWT's standard claims. Until the manifest actually has role-gated entries, this
 * is a correctness no-op (routeManifest is empty -- see packages/contracts/src/routes.ts) and
 * deliberately does not guess at a solution (custom access token hook vs. a role cookie vs. a
 * scoped DB read) -- that decision is made when the first role-gated route actually ships.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookieOptions: {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  // Triggers lazy session init/refresh before any route code runs (createServerClient uses
  // skipAutoInitialize -- nothing loads the session until a call like this one).
  const { data } = await supabase.auth.getClaims();

  const route = routeManifest.find((entry) => entry.path === request.nextUrl.pathname);
  if (route && route.roles.length > 0 && !data?.claims) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
