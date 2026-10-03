import { Router } from "express";
import { getSupabase } from "../config/db.js";
import { requireAuth, requireAccountAccess } from "../middleware/auth.js";

const router = Router();

router.get("/accounts", requireAuth, async (req, res) => {
  const { data: memberships, error } = await getSupabase()
    .from("account_members")
    .select("*, account:accounts(*)")
    .eq("user_id", req.user.id)
    .not("accepted_at", "is", null);
  if (error) throw error;
  res.json(memberships.map((m) => ({ ...m.account, myRole: m.role })));
});

router.post("/accounts/:id/members", requireAuth, requireAccountAccess("owner", "admin"), async (req, res) => {
  const supabase = getSupabase();
  const { phone, fullName, role } = req.body;

  let { data: user, error } = await supabase.from("users").select("*").eq("phone", phone).maybeSingle();
  if (error) throw error;
  if (!user) {
    ({ data: user, error } = await supabase.from("users").insert({ phone, full_name: fullName || phone }).select().single());
    if (error) throw error;
  }

  const { data: existing, error: existingError } = await supabase
    .from("account_members")
    .select("id")
    .eq("account_id", req.params.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return res.status(409).json({ error: "Already a member" });

  const now = new Date().toISOString();
  const { data: member, error: memberError } = await supabase
    .from("account_members")
    .insert({
      account_id: req.params.id,
      user_id: user.id,
      role: role || "member",
      invited_at: now,
      accepted_at: now, // dev: auto-accept, no invite email flow
    })
    .select()
    .single();
  if (memberError) throw memberError;
  res.status(201).json(member);
});

router.delete("/accounts/:id/members/:mid", requireAuth, requireAccountAccess("owner", "admin"), async (req, res) => {
  const { error } = await getSupabase().from("account_members").delete().eq("id", req.params.mid).eq("account_id", req.params.id);
  if (error) throw error;
  res.status(204).end();
});

export default router;
