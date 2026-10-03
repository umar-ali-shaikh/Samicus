import { Router } from "express";
import { getSupabase } from "../config/db.js";
import { z } from "zod";
import { requireAuth, requireAccountAccess } from "../middleware/auth.js";
import { HttpError } from "../services/access.js";

const router = Router();

const MEMBER_ROLES = ["admin", "member", "finance", "viewer"];

router.get("/accounts", requireAuth, async (req, res) => {
  const { data: memberships, error } = await getSupabase()
    .from("account_members")
    .select("*, account:accounts(*)")
    .eq("user_id", req.user.id)
    .not("accepted_at", "is", null);
  if (error) throw error;
  res.json(memberships.map((m) => ({ ...m.account, myRole: m.role })));
});

const accountSchema = z.object({
  type: z.enum(["family", "business"]),
  displayName: z.string().trim().min(2).max(120),
  gstin: z.string().trim().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "Invalid GSTIN").optional(),
  cin: z.string().trim().max(30).optional(),
  billingAddress: z.string().trim().max(400).optional(),
});

// Extra workspaces (a family or a business) on top of the personal account every user gets.
router.post("/accounts", requireAuth, async (req, res) => {
  const parsed = accountSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const input = parsed.data;
  const supabase = getSupabase();
  const { data: account, error } = await supabase
    .from("accounts")
    .insert({ type: input.type, display_name: input.displayName, gstin: input.gstin, cin: input.cin, billing_address: input.billingAddress, seat_limit: input.type === "business" ? 10 : 4 })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") throw new HttpError(409, "An account with that name already exists.");
    throw error;
  }
  const { error: memberError } = await supabase
    .from("account_members")
    .insert({ account_id: account.id, user_id: req.user.id, role: "owner", accepted_at: new Date().toISOString() });
  if (memberError) throw memberError;
  res.status(201).json({ ...account, myRole: "owner" });
});

router.get("/plans", async (req, res) => {
  const { data, error } = await getSupabase().from("plans").select("*").order("price_monthly");
  if (error) throw error;
  res.json(data);
});

router.post("/accounts/:id/members", requireAuth, requireAccountAccess("owner", "admin"), async (req, res) => {
  const supabase = getSupabase();
  const email = String(req.body.email || "").trim().toLowerCase();
  const { fullName, role } = req.body;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: "A valid email address is required." });
  if (role && !MEMBER_ROLES.includes(role)) return res.status(400).json({ error: "Invalid role." });
  if (role === "owner") return res.status(400).json({ error: "An account has one owner." });

  // Invitee may not have signed in yet: create a login-less placeholder row. It is linked
  // to their Supabase identity (matched by verified email) the first time they sign in.
  let { data: user, error } = await supabase.from("users").select("*").ilike("email", email).maybeSingle();
  if (error) throw error;
  if (!user) {
    ({ data: user, error } = await supabase
      .from("users")
      .insert({ email, full_name: fullName?.trim() || email.split("@")[0] })
      .select()
      .single());
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

  const [{ data: account, error: accountError }, { count: seats, error: seatsError }] = await Promise.all([
    supabase.from("accounts").select("seat_limit").eq("id", req.params.id).single(),
    supabase.from("account_members").select("*", { count: "exact", head: true }).eq("account_id", req.params.id),
  ]);
  if (accountError) throw accountError;
  if (seatsError) throw seatsError;
  if (seats >= account.seat_limit) throw new HttpError(409, `This account is limited to ${account.seat_limit} members.`);

  const { data: member, error: memberError } = await supabase
    .from("account_members")
    .insert({
      account_id: req.params.id,
      user_id: user.id,
      role: role || "member",
      invited_at: new Date().toISOString(),
      // Becomes active once the invitee signs in with this (verified) email.
      accepted_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (memberError) throw memberError;
  res.status(201).json(member);
});

router.get("/accounts/:id/members", requireAuth, requireAccountAccess(), async (req, res) => {
  const { data, error } = await getSupabase()
    .from("account_members")
    .select("id, role, invited_at, accepted_at, user:users(id, full_name, email, avatar_url)")
    .eq("account_id", req.params.id);
  if (error) throw error;
  res.json(data);
});

router.delete("/accounts/:id/members/:mid", requireAuth, requireAccountAccess("owner", "admin"), async (req, res) => {
  const { error } = await getSupabase().from("account_members").delete().eq("id", req.params.mid).eq("account_id", req.params.id);
  if (error) throw error;
  res.status(204).end();
});

export default router;
