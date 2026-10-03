import { Router } from "express";
import { getSupabase } from "../config/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth, requireRole("founder"));

const TAB_EXTRAS = {
  fcorp: async () => {
    const { data, error } = await getSupabase().from("corporate_account_health").select("*");
    if (error) throw error;
    return { accounts: data };
  },
  fadv: async () => {
    const { data, error } = await getSupabase().from("advocate_performance_rows").select("*, advocate:advocates(*)");
    if (error) throw error;
    return { rows: data };
  },
  fai: async () => {
    const { data, error } = await getSupabase().from("knowledge_gaps").select("*").order("asked_count", { ascending: false });
    if (error) throw error;
    return { knowledgeGaps: data };
  },
  fcomplaints: async () => {
    const { data, error } = await getSupabase().from("complaints").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return { complaints: data };
  },
};

router.get("/admin/analytics/:tab", async (req, res) => {
  const { tab } = req.params;
  const { data: snapshot, error } = await getSupabase().from("analytics_snapshots").select("*").eq("tab", tab).maybeSingle();
  if (error) throw error;

  const extra = TAB_EXTRAS[tab] ? await TAB_EXTRAS[tab]() : {};

  if (!snapshot && Object.keys(extra).length === 0) return res.status(404).json({ error: `No analytics snapshot for tab "${tab}"` });
  res.json({ tab, refreshedAt: snapshot?.refreshed_at, payload: snapshot?.payload || {}, ...extra });
});

// "Ask the data": only answers from what's actually on the dashboard, else an explicit
// refusal — the same non-hallucination contract as Vidhira, applied to internal BI.
router.post("/admin/analytics/ask", async (req, res) => {
  const { question } = req.body;
  const { data: snapshot, error } = await getSupabase().from("analytics_snapshots").select("payload").eq("tab", "founder").maybeSingle();
  if (error) throw error;
  const canned = snapshot?.payload?.ask || [];

  const qTokens = new Set(question.toLowerCase().split(/\s+/).filter((t) => t.length > 3));
  let best = null;
  let bestScore = 0;
  for (const item of canned) {
    const itemTokens = new Set(item.q.toLowerCase().split(/\s+/).filter((t) => t.length > 3));
    const overlap = [...qTokens].filter((t) => itemTokens.has(t)).length;
    if (overlap > bestScore) {
      bestScore = overlap;
      best = item;
    }
  }

  if (!best || bestScore === 0) {
    return res.json({ answered: false, message: "This dashboard holds no figure for that. Rather than estimate, it says nothing." });
  }
  res.json({ answered: true, answer: best.a, figures: best.f });
});

// Access-with-reason + audit-log gate before any privileged matter content can be viewed.
// An empty reason is refused, and the refusal itself is logged.
router.post("/admin/access-requests", async (req, res) => {
  const supabase = getSupabase();
  const { matterId, reason } = req.body;
  const { data: matter, error: matterError } = await supabase.from("matters").select("id").eq("id", matterId).maybeSingle();
  if (matterError) throw matterError;
  if (!matter) return res.status(404).json({ error: "Matter not found" });

  if (!reason || !reason.trim()) {
    const { error: grantError } = await supabase
      .from("admin_access_grants")
      .insert({ actor_id: req.user.id, matter_id: matterId, reason: "", outcome: "denied" });
    if (grantError) throw grantError;
    const { error: auditError } = await supabase.from("audit_logs").insert({
      actor_id: req.user.id,
      actor_role: "founder",
      action: "matter_access_request_denied",
      subject_type: "Matter",
      subject_id: matterId,
      outcome: "denied",
    });
    if (auditError) throw auditError;
    return res.status(422).json({ error: "A reason is required to request access to matter contents." });
  }

  const { error: grantError } = await supabase
    .from("admin_access_grants")
    .insert({ actor_id: req.user.id, matter_id: matterId, reason, outcome: "recorded" });
  if (grantError) throw grantError;
  const { error: auditError } = await supabase.from("audit_logs").insert({
    actor_id: req.user.id,
    actor_role: "founder",
    action: "matter_access_requested",
    subject_type: "Matter",
    subject_id: matterId,
    reason,
    outcome: "recorded",
  });
  if (auditError) throw auditError;
  res.status(201).json({ ok: true });
});

router.get("/admin/access-requests", async (req, res) => {
  const { data, error } = await getSupabase()
    .from("admin_access_grants")
    .select("*, matter:matters(*), actor:users(*)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  res.json(data);
});

export default router;
