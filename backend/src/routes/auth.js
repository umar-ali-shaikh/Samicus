import { Router } from "express";
import { getSupabase } from "../config/db.js";
import { signToken, requireAuth } from "../middleware/auth.js";

const router = Router();

// Mocked SMS provider: every phone accepts process.env.DEV_OTP.
router.post("/auth/otp", async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "phone is required" });
  res.json({ ok: true, message: `OTP sent to ${phone} (dev mode: use ${process.env.DEV_OTP})` });
});

router.post("/auth/verify", async (req, res) => {
  const { phone, otp, fullName } = req.body;
  if (!phone || !otp) return res.status(400).json({ error: "phone and otp are required" });
  if (otp !== process.env.DEV_OTP) return res.status(401).json({ error: "Invalid OTP" });

  const supabase = getSupabase();
  let { data: user, error } = await supabase.from("users").select("*").eq("phone", phone).maybeSingle();
  if (error) throw error;

  if (!user) {
    ({ data: user, error } = await supabase
      .from("users")
      .insert({ phone, full_name: fullName || "New user" })
      .select()
      .single());
    if (error) throw error;

    const { data: account, error: accountError } = await supabase
      .from("accounts")
      .insert({ type: "individual", display_name: user.full_name })
      .select()
      .single();
    if (accountError) throw accountError;

    const { error: memberError } = await supabase
      .from("account_members")
      .insert({ account_id: account.id, user_id: user.id, role: "owner", accepted_at: new Date().toISOString() });
    if (memberError) throw memberError;
  }

  const token = signToken(user);
  res.json({ token, user });
});

router.get("/me", requireAuth, async (req, res) => {
  const { data: memberships, error } = await getSupabase()
    .from("account_members")
    .select("*, account:accounts(*)")
    .eq("user_id", req.user.id)
    .not("accepted_at", "is", null);
  if (error) throw error;

  res.json({
    user: req.user,
    accounts: memberships.map((m) => ({ ...m.account, myRole: m.role })),
  });
});

export default router;
