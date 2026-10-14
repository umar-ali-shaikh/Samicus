import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { routeManifest, type Role } from "@vidhira/contracts";
import { env } from "./server/env";

/**
 * Refreshes the Supabase session on every navigation (writing any rotated tokens back as
 * HttpOnly cookies) and applies the coarse role gate from packages/contracts' route manifest.
 * Named "proxy" (not "middleware") per Next.js 16's renamed file convention.
 *
 * This is NOT the only authorization layer -- Express re-verifies the JWT and re-checks role
 * and object-level policy on every request regardless of what this proxy allows through (see
 * docs/architecture/01-target-architecture.md section 2). A wrong decision here can only ever
 * cause a wrong REDIRECT (showing a page shell that then gets a 403 from apps/api, or sending
 * someone to their own role's home page instead of the page they wanted) -- it can never leak
 * data, because apps/api never trusts this layer either.
 *
 * Role resolution: the Supabase JWT's standard claims don't carry the caller's APP role
 * (client/advocate/admin/founder lives in our `users` table, not Supabase Auth). Rather than
 * query the database directly from here (would need a service-role key in apps/web, a new
 * secret-exposure surface this app doesn't otherwise have) or add a Supabase custom access
 * token hook (an auth-provider-level change outside this repo, flagged in MASTER-PROMPT.md's
 * constraints as needing explicit sign-off), this calls apps/api's existing GET /api/me --
 * the same authoritative source every other server-to-server call already trusts -- and caches
 * the result in a short-lived HttpOnly cookie so most requests skip the round trip entirely.
 * If apps/api is unreachable or the cache is cold, the gate fails OPEN (role treated as
 * unknown, request allowed through): apps/api's own per-request check is still the real gate,
 * so failing open here only ever costs a wasted render, never a data leak.
 */

const ROLE_COOKIE = "vidhira-role";
const ROLE_COOKIE_MAX_AGE_SECONDS = 300; // short: self-heals quickly if a role ever changes (rare -- see provisionUser's "only on first link" rule); apps/api is the real gate either way.

// Where a signed-in user with a resolved role should land when the URL they hit isn't theirs.
// signInAction always redirects to /dashboard regardless of actual role (that redirect isn't
// role-aware), so this can't default to /dashboard -- that's client-only in the manifest below,
// which would send a non-client role straight back into another mismatch on their very first
// post-login request.
const ROLE_HOME: Record<Role, string> = {
  client: "/dashboard",
  advocate: "/lawyer",
  admin: "/admin/verification",
  founder: "/founder",
};

function matchManifestEntry(pathname: string) {
  const pathSegments = pathname.split("/").filter(Boolean);
  return routeManifest.find((entry) => {
    const patternSegments = entry.path.split("/").filter(Boolean);
    if (patternSegments.length !== pathSegments.length) return false;
    return patternSegments.every((seg, i) => seg.startsWith("[") || seg === pathSegments[i]);
  });
}

async function resolveRole(request: NextRequest, accessToken: string | undefined): Promise<Role | null> {
  const cached = request.cookies.get(ROLE_COOKIE)?.value as Role | undefined;
  if (cached) return cached;
  if (!accessToken) return null;
  try {
    const res = await fetch(new URL("/api/me", env.API_INTERNAL_URL), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { user?: { role?: Role } };
    return data.user?.role ?? null;
  } catch {
    return null;
  }
}

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

  const route = matchManifestEntry(request.nextUrl.pathname);
  if (!route || route.roles.length === 0) return response;

  if (!data?.claims) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // getSession() is normally unsafe for authorization decisions on the server (its session.user
  // comes from storage, not re-verified) -- but here the raw access_token is only ever
  // forwarded to apps/api for IT to re-verify, mirroring server/apiClient.ts's own accessToken()
  // helper exactly, never trusted locally. getClaims() above already locally verified the JWT
  // signature for the actual gate decision; this is purely to fetch the token string itself.
  const { data: sessionData } = await supabase.auth.getSession();
  const role = await resolveRole(request, sessionData.session?.access_token);

  if (role) {
    response.cookies.set(ROLE_COOKIE, role, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: ROLE_COOKIE_MAX_AGE_SECONDS,
      path: "/",
    });
    // Only redirect if we're not ALREADY on that role's home page -- otherwise a role whose
    // home page itself isn't reachable for some other reason would loop against itself.
    if (!route.roles.includes(role) && request.nextUrl.pathname !== ROLE_HOME[role]) {
      return NextResponse.redirect(new URL(ROLE_HOME[role], request.url));
    }
  }
  // role === null (cold cache + apps/api unreachable, or /api/me genuinely has no role):
  // fail open, per this file's own doc comment -- apps/api's requireRole() is the real gate.

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
