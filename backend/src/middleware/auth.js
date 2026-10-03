// Authentication is delegated to Supabase Auth (Google OAuth 2.0 and email/password).
// The browser signs in with supabase-js and sends its access token as a Bearer token;
// we validate it with Supabase, require a verified email, and load/provision the
// matching Samicus user.
import { getSupabase } from "../config/db.js";
import { provisionUser } from "../services/auth/provision.js";

// A user lookup per request would add a Supabase round trip to every call, so identities
// are cached briefly. Short enough that a disabled/deleted account stops working fast.
const IDENTITY_TTL_MS = 30 * 1000;
const IDENTITY_CACHE_MAX = 5000;
const identityCache = new Map(); // token -> { user, expiresAt }

function cacheIdentity(token, user) {
  if (identityCache.size >= IDENTITY_CACHE_MAX) {
    const now = Date.now();
    for (const [k, v] of identityCache) if (v.expiresAt < now) identityCache.delete(k);
    if (identityCache.size >= IDENTITY_CACHE_MAX) identityCache.clear();
  }
  identityCache.set(token, { user, expiresAt: Date.now() + IDENTITY_TTL_MS });
}

export const AUTH_ERRORS = {
  missing: { status: 401, code: "NOT_AUTHENTICATED", error: "Please sign in." },
  invalid: { status: 401, code: "NOT_AUTHENTICATED", error: "Your session has expired. Please sign in again." },
  unverified: {
    status: 403,
    code: "EMAIL_NOT_VERIFIED",
    error: "Please verify your email address — check your inbox for the confirmation link.",
  },
};

function fail(res, kind) {
  const { status, ...body } = AUTH_ERRORS[kind];
  return res.status(status).json(body);
}

export function bearerToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
}

async function resolveIdentity(token) {
  const hit = identityCache.get(token);
  if (hit && hit.expiresAt > Date.now()) return hit.user;
  const { data, error } = await getSupabase().auth.getUser(token);
  if (error || !data?.user) return null;
  cacheIdentity(token, data.user);
  return data.user;
}

/**
 * @param {{ allowUnverified?: boolean }} [opts] `/me` uses allowUnverified so the client can
 *   learn *why* it is blocked and show the "verify your email" screen.
 */
export function authenticate({ allowUnverified = false } = {}) {
  return async (req, res, next) => {
    try {
      const token = bearerToken(req);
      if (!token) return fail(res, "missing");

      const authUser = await resolveIdentity(token);
      if (!authUser) return fail(res, "invalid");

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

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

// Confirms req.user is a member of :accountId (route param) with one of the given roles.
export function requireAccountAccess(...roles) {
  return async (req, res, next) => {
    try {
      const accountId = req.params.id || req.params.accountId || req.body.accountId;
      const { data: membership, error } = await getSupabase()
        .from("account_members")
        .select("*")
        .eq("account_id", accountId)
        .eq("user_id", req.user.id)
        .not("accepted_at", "is", null)
        .maybeSingle();
      if (error) throw error;
      if (!membership || (roles.length && !roles.includes(membership.role))) {
        return res.status(403).json({ error: "Forbidden" });
      }
      req.membership = membership;
      next();
    } catch (err) {
      next(err);
    }
  };
}
