import { Router } from "express";
import rateLimit from "express-rate-limit";
import { getSupabase } from "../config/db.js";
import { authenticate, requireAuth, AUTH_ERRORS } from "../middleware/auth.js";

const router = Router();

// Sign-in/sign-up/Google OAuth happen in the browser against Supabase Auth (supabase-js).
// The API only ever sees the resulting access token.

async function loadAccounts(userId) {
  const { data: memberships, error } = await getSupabase()
    .from("account_members")
    .select("*, account:accounts(*)")
    .eq("user_id", userId)
    .not("accepted_at", "is", null);
  if (error) throw error;
  return memberships.map((m) => ({ ...m.account, myRole: m.role }));
}

async function loadAdvocate(userId) {
  const { data, error } = await getSupabase()
    .from("advocates")
    .select("id, verification_status, bar_council, enrolment_number, availability_state, accepts_urgent")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Current session. Unlike every other route this tolerates an unverified email, so the
// client can show a "verify your email" screen instead of a bare 403.
router.get("/me", authenticate({ allowUnverified: true }), async (req, res) => {
  if (!req.emailVerified) {
    return res.status(AUTH_ERRORS.unverified.status).json({
      ...AUTH_ERRORS.unverified,
      email: req.authUser.email,
    });
  }
  const [accounts, advocate] = await Promise.all([loadAccounts(req.user.id), loadAdvocate(req.user.id)]);
  res.json({
    user: req.user,
    accounts,
    advocate,
    provider: req.authUser.app_metadata?.provider || "email",
  });
});

const profileLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

router.patch("/me", profileLimiter, requireAuth, async (req, res) => {
  const { fullName, city, state, preferredLanguage, phone } = req.body || {};
  const patch = {};
  if (fullName !== undefined) {
    if (!String(fullName).trim()) return res.status(400).json({ error: "Name cannot be empty." });
    patch.full_name = String(fullName).trim().slice(0, 120);
  }
  if (city !== undefined) patch.city = city ? String(city).slice(0, 80) : null;
  if (state !== undefined) patch.state = state ? String(state).slice(0, 80) : null;
  if (preferredLanguage !== undefined) {
    if (!["en", "hi"].includes(preferredLanguage)) return res.status(400).json({ error: "preferredLanguage must be 'en' or 'hi'." });
    patch.preferred_language = preferredLanguage;
  }
  if (phone !== undefined) patch.phone = phone ? String(phone).slice(0, 20) : null;
  if (Object.keys(patch).length === 0) return res.status(400).json({ error: "Nothing to update." });

  const { data, error } = await getSupabase().from("users").update(patch).eq("id", req.user.id).select().single();
  if (error) throw error;
  res.json({ user: data });
});

export default router;
