// Mocks platform/jwt.js so route tests can authenticate with plain "tok-x" bearer tokens
// instead of real signed JWTs (middleware/auth.ts verifies tokens against the real Supabase
// JWKS endpoint, which test fixtures can't produce). Pair with createFakeSupabase's
// `authUsers` map -- pass the exact same object so a verified token's claims line up with
// what the one-time-provisioning round trip (auth.getUser()) also returns for that user.
import { mock } from "node:test";

export class FakeJwtVerificationError extends Error {}

export function mockJwtVerification(authUsers) {
  mock.module("../platform/jwt.js", {
    namedExports: {
      JwtVerificationError: FakeJwtVerificationError,
      verifySupabaseAccessToken: async (token) => {
        const user = authUsers[token];
        if (!user) throw new FakeJwtVerificationError("invalid token");
        return {
          sub: user.id,
          email: user.email ?? undefined,
          app_metadata: user.app_metadata,
          user_metadata: user.user_metadata,
        };
      },
    },
  });
}
