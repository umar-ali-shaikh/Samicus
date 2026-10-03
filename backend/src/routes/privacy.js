import { Router } from "express";
import { getSupabase } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/privacy/export", requireAuth, async (req, res) => {
  const { data: memberships, error } = await getSupabase().from("account_members").select("*").eq("user_id", req.user.id);
  if (error) throw error;
  res.json({ user: req.user, memberships, exportedAt: new Date().toISOString() });
});

router.post("/privacy/delete", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const { data: memberships, error } = await supabase.from("account_members").select("account_id").eq("user_id", req.user.id);
  if (error) throw error;
  const accountIds = memberships.map((m) => m.account_id);

  let engagedCount = 0;
  if (accountIds.length > 0) {
    const { count, error: countError } = await supabase
      .from("matters")
      .select("*", { count: "exact", head: true })
      .in("account_id", accountIds)
      .not("stage", "in", "(closed,archived)");
    if (countError) throw countError;
    engagedCount = count;
  }

  if (engagedCount > 0) {
    return res
      .status(409)
      .json({ error: "Cannot delete account while matters are engaged. Statutory retention applies until they are closed." });
  }

  const { error: deleteError } = await supabase.from("users").delete().eq("id", req.user.id);
  if (deleteError) throw deleteError;
  res.status(204).end();
});

export default router;
