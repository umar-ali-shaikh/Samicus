import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Boot-only passthrough. Phase 2 adds @supabase/ssr session refresh here plus the coarse
 * role gate read from packages/contracts' route manifest (see
 * docs/architecture/01-target-architecture.md section 5) -- not the only authz layer,
 * Express re-checks everything server-side regardless of what this proxy allows.
 *
 * Named "proxy" (not "middleware") per Next.js 16's renamed file convention -- see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md.
 */
export function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
