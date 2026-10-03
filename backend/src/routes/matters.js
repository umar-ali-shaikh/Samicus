import { Router } from "express";
import { getSupabase } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

async function myAccountIds(userId) {
  const { data, error } = await getSupabase()
    .from("account_members")
    .select("account_id")
    .eq("user_id", userId)
    .not("accepted_at", "is", null);
  if (error) throw error;
  return data.map((m) => m.account_id);
}

// Client accounts see their matters via AccountMember; advocates aren't members of a
// client's account, so they see matters where they're the engaged advocate instead.
async function matterScopeFilter(user) {
  if (user.role === "advocate") {
    const { data: advocate, error } = await getSupabase().from("advocates").select("id").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    return { column: "advocate_id", value: advocate?.id };
  }
  const accountIds = await myAccountIds(user.id);
  return { column: "account_id", in: accountIds };
}

function applyScope(query, scope) {
  if (scope.in) return query.in(scope.column, scope.in);
  return query.eq(scope.column, scope.value);
}

router.get("/matters", requireAuth, async (req, res) => {
  const scope = await matterScopeFilter(req.user);
  let query = getSupabase().from("matters").select("*, advocate:advocates(*), practice_area:practice_areas(*)");
  query = applyScope(query, scope);
  const { data, error } = await query;
  if (error) throw error;
  res.json(data);
});

router.get("/matters/:id", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const scope = await matterScopeFilter(req.user);
  let query = supabase.from("matters").select("*, advocate:advocates(*), practice_area:practice_areas(*)").eq("id", req.params.id);
  query = applyScope(query, scope);
  const { data: matter, error } = await query.maybeSingle();
  if (error) throw error;
  if (!matter) return res.status(404).json({ error: "Not found" });

  const [timeline, tasks, hearings, documents, access, feeProposals, invoices] = await Promise.all([
    supabase.from("timeline_events").select("*").eq("matter_id", matter.id).order("occurred_at", { ascending: true }),
    supabase.from("tasks").select("*").eq("matter_id", matter.id),
    supabase.from("hearings").select("*").eq("matter_id", matter.id),
    supabase.from("documents").select("*").eq("matter_id", matter.id),
    supabase.from("matter_access_grants").select("*").eq("matter_id", matter.id).is("revoked_at", null),
    supabase.from("fee_proposals").select("*").eq("matter_id", matter.id),
    supabase.from("invoices").select("*, invoice_line_items(*)").eq("matter_id", matter.id),
  ]);
  for (const r of [timeline, tasks, hearings, documents, access, feeProposals, invoices]) {
    if (r.error) throw r.error;
  }

  res.json({
    matter,
    timeline: timeline.data,
    tasks: tasks.data,
    hearings: hearings.data,
    documents: documents.data,
    access: access.data,
    feeProposals: feeProposals.data,
    invoices: invoices.data,
  });
});

router.post("/matters/:id/tasks/:tid/complete", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const { data: task, error } = await supabase
    .from("tasks")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", req.params.tid)
    .eq("matter_id", req.params.id)
    .select()
    .single();
  if (error) throw error;

  const { error: timelineError } = await supabase.from("timeline_events").insert({
    matter_id: req.params.id,
    type: "task_completed",
    title: `Task marked done: ${task?.label || ""}`,
    actor_type: "user",
    actor_id: req.user.id,
  });
  if (timelineError) throw timelineError;

  res.json(task);
});

router.post("/matters/:id/access", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const body = req.body;
  const { data: grant, error } = await supabase
    .from("matter_access_grants")
    .insert({
      matter_id: req.params.id,
      subject_id: body.subjectId,
      subject_type: body.subjectType,
      subject_name: body.subjectName,
      subject_role: body.subjectRole,
      scope: body.scope,
      granted_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;

  const { error: auditError } = await supabase.from("audit_logs").insert({
    actor_id: req.user.id,
    actor_role: req.user.role,
    action: "matter_access_granted",
    subject_type: "Matter",
    subject_id: req.params.id,
  });
  if (auditError) throw auditError;

  res.status(201).json(grant);
});

router.delete("/matters/:id/access/:gid", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("matter_access_grants")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", req.params.gid);
  if (error) throw error;

  // Revocation is immediate and always audit-logged, per the data-model doc.
  const { error: auditError } = await supabase.from("audit_logs").insert({
    actor_id: req.user.id,
    actor_role: req.user.role,
    action: "matter_access_revoked",
    subject_type: "Matter",
    subject_id: req.params.id,
  });
  if (auditError) throw auditError;

  res.status(204).end();
});

router.post("/matters/:id/fee-proposals", requireAuth, async (req, res) => {
  const body = req.body;
  const { data: proposal, error } = await getSupabase()
    .from("fee_proposals")
    .insert({
      matter_id: req.params.id,
      advocate_id: body.advocateId,
      scope_text: body.scopeText,
      milestones: body.milestones,
      statutory_estimate: body.statutoryEstimate,
      exclusions: body.exclusions,
      valid_until: body.validUntil,
    })
    .select()
    .single();
  if (error) throw error;
  res.status(201).json(proposal);
});

router.post("/matters/:id/fee-proposals/:pid/accept", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const { data: proposal, error } = await supabase
    .from("fee_proposals")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", req.params.pid)
    .select()
    .single();
  if (error) throw error;

  const { error: matterError } = await supabase
    .from("matters")
    .update({ stage: "engagement_confirmed", engaged_at: new Date().toISOString() })
    .eq("id", req.params.id);
  if (matterError) throw matterError;

  const { error: timelineError } = await supabase.from("timeline_events").insert({
    matter_id: req.params.id,
    type: "engagement_confirmed",
    title: "Fee proposal accepted — engagement confirmed",
    actor_type: "user",
    actor_id: req.user.id,
  });
  if (timelineError) throw timelineError;

  res.json(proposal);
});

router.get("/accounts/:id/legal-spend", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const { data: matters, error } = await supabase.from("matters").select("id, stage").eq("account_id", req.params.id);
  if (error) throw error;

  const matterIds = matters.map((m) => m.id);
  let invoices = [];
  if (matterIds.length > 0) {
    const { data, error: invoiceError } = await supabase
      .from("invoices")
      .select("total, invoice_line_items(category, amount)")
      .in("matter_id", matterIds);
    if (invoiceError) throw invoiceError;
    invoices = data;
  }

  const totals = invoices.reduce(
    (acc, inv) => {
      (inv.invoice_line_items || []).forEach((li) => {
        acc[li.category] = (acc[li.category] || 0) + Number(li.amount);
      });
      acc.total += Number(inv.total);
      return acc;
    },
    { professional: 0, government: 0, platform: 0, total: 0 }
  );

  res.json({ openMatters: matters.filter((m) => !["closed", "archived"].includes(m.stage)).length, totals });
});

export default router;
