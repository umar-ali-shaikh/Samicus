/**
 * Authentication: verify the Supabase access token LOCALLY against the project's JWKS
 * (platform/jwt.ts) instead of a per-request `auth.getUser(token)` round trip. This replaces
 * both the Supabase round trip AND the in-process 5-second identity Map the old middleware
 * needed to make that round trip affordable -- JWT verification is cheap/stateless, so no
 * identity cache is needed at all (platform/jwt.ts's JWKS key cache is a public-key cache,
 * safe to run independently per instance).
 *
 * Email verification: the JWT's standard claims do NOT include `email_confirmed_at` (confirmed
 * against @supabase/auth-js's JwtPayload type), so it can't be read from the token alone. The
 * fix: a `users` row only ever gets created once a user is actually verified (provisionUser is
 * only ever called for a verified identity) -- so "a users row exists for this auth_id" IS the
 * verified signal, going forward. That means:
 *   - Returning users (row already exists): zero round trips, ever.
 *   - A user's very first authenticated call after signup/verification (no row yet): exactly
 *     ONE Supabase round trip to resolve "verified vs. not" and provision the row. Every
 *     subsequent call for that user takes the zero-round-trip fast path above.
 * This is a one-time cost per user, not a per-request one -- matching the architecture's "removes
 * the per-request Supabase round trip" goal while still gating correctly on verification.
 *
 * Trade-off carried over from the design this replaces: a verified JWT remains valid for its
 * natural lifetime (short-lived, auto-refreshed) even if the underlying Supabase user is
 * revoked/banned in the interim -- local JWT verification cannot see that. Role and account
 * membership are still re-checked against OUR DB on every request regardless, so a role change
 * or access revocation takes effect immediately even though raw token validity does not.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { getSupabase } from "../config/db.js";
import { provisionUser, type AppUser, type SupabaseAuthUser } from "../services/auth/provision.js";
import { verifySupabaseAccessToken, JwtVerificationError } from "../platform/jwt.js";

export interface AuthUserShape {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown> | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUser?: AuthUserShape;
      emailVerified?: boolean;
      user?: AppUser;
      membership?: { id: string; role: string };
    }
  }
}

export const AUTH_ERRORS = {
  missing: { status: 401, code: "NOT_AUTHENTICATED", error: "Please sign in." },
  invalid: { status: 401, code: "NOT_AUTHENTICATED", error: "Your session has expired. Please sign in again." },
  unverified: {
    status: 403,
    code: "EMAIL_NOT_VERIFIED",
    error: "Please verify your email address — check your inbox for the confirmation link.",
  },
} as const;

type AuthErrorKind = keyof typeof AUTH_ERRORS;

function fail(res: Response, kind: AuthErrorKind) {
  const { status, ...body } = AUTH_ERRORS[kind];
  return res.status(status).json(body);
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
}

export interface AuthenticateOptions {
  /** `/me` uses this so the client can learn *why* it is blocked and show the "verify your email" screen. */
  allowUnverified?: boolean;
}

export function authenticate({ allowUnverified = false }: AuthenticateOptions = {}): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = bearerToken(req);
      if (!token) return fail(res, "missing");

      let claims;
      try {
        claims = await verifySupabaseAccessToken(token);
      } catch (err) {
        if (err instanceof JwtVerificationError) return fail(res, "invalid");
        throw err;
      }

      const { data: existing, error } = await getSupabase().from("users").select("*").eq("auth_id", claims.sub).maybeSingle();
      if (error) throw error;

      if (existing) {
        req.authUser = {
          id: claims.sub,
          email: claims.email,
          app_metadata: claims.app_metadata,
          user_metadata: claims.user_metadata,
        };
        req.emailVerified = true;
        req.user = existing as AppUser;
        return next();
      }

      // No row yet for this auth_id: either genuinely unverified, or this is the very first
      // call after signup/verification. email_confirmed_at isn't in the JWT, so this is the
      // one place a live Supabase lookup is still required.
      const { data, error: getUserError } = await getSupabase().auth.getUser(token);
      if (getUserError || !data?.user) return fail(res, "invalid");
      const authUser = data.user as SupabaseAuthUser & { email_confirmed_at?: string | null };
      req.authUser = authUser;
      req.emailVerified = Boolean(authUser.email_confirmed_at);
      if (!req.emailVerified) {
        if (!allowUnverified) return fail(res, "unverified");
        return next();
      }

      req.user = await provisionUser(authUser);
      next();
    } catch (err) {
      next(err);
    }
  };
}

export const requireAuth = authenticate();

// requireAccountAccess moved to modules/accounts/policy.ts -- it was only ever used by that
// domain's routes, per the per-domain policy.ts layering.
export function requireRole(...roles: string[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}
