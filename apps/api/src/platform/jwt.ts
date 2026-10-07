/**
 * Local verification of Supabase access tokens against the project's JWKS -- replaces the
 * per-request `auth.getUser(token)` round trip (and the in-process identity Map it needed to
 * stay fast) that apps/api used before Phase 2. Confirmed empirically that this Supabase
 * project signs with an asymmetric key (ES256) before building this -- local JWKS verification
 * is only possible for asymmetric-signed projects; a project still on the legacy shared HS256
 * secret would need a different approach entirely.
 *
 * `createRemoteJWKSet` caches the fetched key set in-process and only re-fetches on an unknown
 * `kid` (subject to its own cooldown) -- this is a public-key cache, not a per-user identity
 * cache, so it is safe to share across horizontally-scaled instances without any
 * cross-instance invalidation concern (unlike the old identity Map).
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { env } from "../config/env.js";

const JWKS_URL = new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`);
const ISSUER = `${env.SUPABASE_URL}/auth/v1`;

const JWKS = createRemoteJWKSet(JWKS_URL);

export interface SupabaseJwtClaims extends JWTPayload {
  sub: string;
  email?: string;
  role?: string;
  session_id?: string;
  is_anonymous?: boolean;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}

export class JwtVerificationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "JwtVerificationError";
  }
}

/**
 * Verifies signature, issuer, audience, expiry and not-before (with a small clock-skew
 * allowance). Throws JwtVerificationError on any failure -- callers map that to 401.
 */
export async function verifySupabaseAccessToken(token: string): Promise<SupabaseJwtClaims> {
  try {
    const { payload } = await jwtVerify<SupabaseJwtClaims>(token, JWKS, {
      issuer: ISSUER,
      audience: "authenticated",
      clockTolerance: "10 seconds",
    });
    return payload;
  } catch (err) {
    throw new JwtVerificationError(err instanceof Error ? err.message : "JWT verification failed", { cause: err });
  }
}
