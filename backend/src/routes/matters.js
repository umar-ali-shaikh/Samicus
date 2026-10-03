import { Router } from "express";
import { z } from "zod";
import { getSupabase } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError, advocateForUser, assertAccountMember, loadMatterForUser, memberAccountIds, requireSide } from "../services/access.js";
import { PLATFORM_FEE, GST_RATE } from "../services/matching.js";

const router = Router();

const MATTER_SELECT =
  "*, advocate:advocates(id, city, user:users(full_name, avatar_url)), practice_area:practice_areas(name), account:accounts(display_name, type)";

function parse(schema, body) {
  const r = schema.safeParse(body);
  if (!r.success) throw new HttpError(400, r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  return r.data;
}

async function grantedMatterIds(userId) {
  const { data, error } = await getSupabase()
    .from("matter_access_grants")
    .select("matter_id")
    .eq("subject_id", userId)
    .eq("subject_type", "user")
    .is("revoked_at", null);
  if (error) throw error;
  return data.map((g) => g.matter_id);
}

// Matters the caller can see: their accounts' matters, matters they are engaged on as the
// advocate, and matters explicitly shared with them through an access grant.
router.get("/matters", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const [accountIds, advocate, granted] = await Promise.all([memberAccountIds(req.user.id), advocateForUser(req.user.id), grantedMatterIds(req.user.id)]);

  const queries = [];
  if (accountIds.length) queries.push(supabase.from("matters").select(MATTER_SELECT).in("account_id", accountIds));
  if (advocate) queries.push(supabase.from("matters").select(MATTER_SELECT).eq("advocate_id", advocate.id));
  if (granted.length) queries.push(supabase.from("matters").select(MATTER_SELECT).in("id", granted));

  const rows = new Map();
  for (const r of await Promise.all(queries)) {
    if (r.error) throw r.error;
    for (const m of r.data) rows.set(m.id, { ...m, mySide: advocate && m.advocate_id === advocate.id ? "advocate" : "client" });
  }
  res.json([...rows.values()].sort((a, b) => new Date(b.opened_at) - new Date(a.opened_at)));
});

async function loadMatterContext(user, matterId) {
  try {
    return await loadMatterForUser(user, matterId);
  } catch (err) {
    // A user holding an explicit access grant (e.g. a CA or family member) is a read-only client-side viewer.
    if (err.status !== 404) throw err;
    const granted = await grantedMatterIds(user.id);
    if (!granted.includes(matterId)) throw err;
    const { data: matter, error } = await getSupabase().from("matters").select("*").eq("id", matterId).single();
    if (error) throw error;
    return { matter, side: "viewer", advocate: null };
  }
}

router.get("/matters/:id", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const ctx = await loadMatterContext(req.user, req.params.id);

  const { data: matter, error } = await supabase.from("matters").select(MATTER_SELECT).eq("id", ctx.matter.id).single();
  if (error) throw error;

  let documentsQuery = supabase
    .from("documents")
    .select("id, filename, mime, size_bytes, kind, shared_with, created_at, uploaded_by")
    .eq("matter_id", matter.id)
    .order("created_at", { ascending: false });
  // The advocate only ever sees documents the client explicitly shared with them.
  if (ctx.side === "advocate") documentsQuery = documentsQuery.contains("shared_with", [ctx.advocate.id]);

  const [timeline, tasks, hearings, documents, access, feeProposals, invoices] = await Promise.all([
    supabase.from("timeline_events").select("*").eq("matter_id", matter.id).order("occurred_at", { ascending: true }),
    supabase.from("tasks").select("*").eq("matter_id", matter.id).order("due_at", { ascending: true, nullsFirst: false }),
    supabase.from("hearings").select("*").eq("matter_id", matter.id).order("listed_at", { ascending: true }),
    documentsQuery,
    supabase.from("matter_access_grants").select("*").eq("matter_id", matter.id).is("revoked_at", null),
    supabase.from("fee_proposals").select("*").eq("matter_id", matter.id).order("created_at", { ascending: false }),
    supabase.from("invoices").select("*, invoice_line_items(*)").eq("matter_id", matter.id).order("created_at", { ascending: false }),
  ]);
  for (const r of [timeline, tasks, hearings, documents, access, feeProposals, invoices]) if (r.error) throw r.error;

  const showFees = ctx.side !== "viewer" || access.data.some((g) => g.subject_id === req.user.id && g.scope.includes("fees"));
  res.json({
    matter,
    side: ctx.side,
    timeline: timeline.data,
    tasks: tasks.data,
    hearings: hearings.data,
    documents: documents.data,
    access: ctx.side === "client" ? access.data : [],
    feeProposals: showFees ? feeProposals.data : [],
    invoices: showFees ? invoices.data : [],
  });
});

const matterPatchSchema = z.object({
  stage: z.enum(["consultation", "engagement_confirmed", "action_in_progress", "resolution", "closed"]).optional(),
  nextAction: z.string().trim().max(300).optional(),
  forum: z.string().trim().max(160).optional(),
  title: z.string().trim().min(3).max(200).optional(),
});

router.patch("/matters/:id", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const ctx = await loadMatterForUser(req.user, req.params.id);
  const input = parse(matterPatchSchema, req.body);
  if (ctx.side === "client") {
    // Clients may only close their own matter; everything else is the advocate's call.
    if (!(input.stage === "closed" && Object.keys(input).length === 1)) throw new HttpError(403, "Only your advocate can update matter details.");
    await assertAccountMember(req.user.id, ctx.matter.account_id, ["owner", "admin"]);
  }
  const patch = {};
  if (input.stage) patch.stage = input.stage;
  if (input.stage === "closed") patch.closed_at = new Date().toISOString();
  if (input.nextAction !== undefined) patch.next_action = input.nextAction;
  if (input.forum !== undefined) patch.forum = input.forum;
  if (input.title) patch.title = input.title;
  if (Object.keys(patch).length === 0) throw new HttpError(400, "Nothing to update.");

  const { data, error } = await supabase.from("matters").update(patch).eq("id", ctx.matter.id).select().single();
  if (error) throw error;
  if (input.stage) {
    const { error: tlError } = await supabase.from("timeline_events").insert({
      matter_id: ctx.matter.id,
      type: "stage_changed",
      title: `Matter moved to “${input.stage.replace(/_/g, " ")}”`,
      actor_type: ctx.side === "advocate" ? "advocate" : "user",
      actor_id: ctx.side === "advocate" ? ctx.advocate.id : req.user.id,
    });
    if (tlError) throw tlError;
  }
  res.json(data);
});

const taskSchema = z.object({
  label: z.string().trim().min(2).max(300),
  ownerType: z.enum(["client", "advocate"]).default("client"),
  dueAt: z.string().datetime({ offset: true }).optional(),
  isStatutoryDeadline: z.boolean().default(false),
});

router.post("/matters/:id/tasks", requireAuth, async (req, res) => {
  const ctx = await loadMatterForUser(req.user, req.params.id);
  requireSide(ctx, "advocate", "Only the engaged advocate can add tasks.");
  const input = parse(taskSchema, req.body);
  const { data, error } = await getSupabase()
    .from("tasks")
    .insert({ matter_id: ctx.matter.id, label: input.label, owner_type: input.ownerType, due_at: input.dueAt, is_statutory_deadline: input.isStatutoryDeadline })
    .select()
    .single();
  if (error) throw error;
  res.status(201).json(data);
});

router.post("/matters/:id/tasks/:tid/complete", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const ctx = await loadMatterForUser(req.user, req.params.id);
  const { data: existing, error: findError } = await supabase.from("tasks").select("*").eq("id", req.params.tid).eq("matter_id", ctx.matter.id).maybeSingle();
  if (findError) throw findError;
  if (!existing) throw new HttpError(404, "Task not found.");
  if (existing.owner_type !== ctx.side) throw new HttpError(403, "This task belongs to the other party.");

  const completed = req.body?.completed !== false;
  const { data: task, error } = await supabase
    .from("tasks")
    .update({ completed_at: completed ? new Date().toISOString() : null })
    .eq("id", existing.id)
    .select()
    .single();
  if (error) throw error;

  if (completed) {
    const { error: timelineError } = await supabase.from("timeline_events").insert({
      matter_id: ctx.matter.id,
      type: "task_completed",
      title: `Task done: ${task.label}`,
      actor_type: ctx.side === "advocate" ? "advocate" : "user",
      actor_id: ctx.side === "advocate" ? ctx.advocate.id : req.user.id,
    });
    if (timelineError) throw timelineError;
  }
  res.json(task);
});

const hearingSchema = z.object({
  listedAt: z.string().datetime({ offset: true }),
  forum: z.string().trim().max(160).optional(),
  courtHall: z.string().trim().max(60).optional(),
  purpose: z.string().trim().max(300).optional(),
});

router.post("/matters/:id/hearings", requireAuth, async (req, res) => {
  const ctx = await loadMatterForUser(req.user, req.params.id);
  requireSide(ctx, "advocate", "Only the engaged advocate can list hearings.");
  const input = parse(hearingSchema, req.body);
  const { data, error } = await getSupabase()
    .from("hearings")
    .insert({ matter_id: ctx.matter.id, listed_at: input.listedAt, forum: input.forum || ctx.matter.forum, court_hall: input.courtHall, purpose: input.purpose })
    .select()
    .single();
  if (error) throw error;
  res.status(201).json(data);
});

// --- Access grants (client side shares a matter with someone outside the account) ---

const accessSchema = z.object({
  email: z.string().trim().email(),
  role: z.string().trim().max(60).default("Viewer"),
  scope: z.array(z.enum(["documents", "messages", "tasks", "fees"])).min(1),
});

router.post("/matters/:id/access", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const ctx = await loadMatterForUser(req.user, req.params.id);
  requireSide(ctx, "client");
  await assertAccountMember(req.user.id, ctx.matter.account_id, ["owner", "admin"]);
  const input = parse(accessSchema, req.body);

  const { data: person, error: personError } = await supabase.from("users").select("id, full_name").ilike("email", input.email).maybeSingle();
  if (personError) throw personError;
  if (!person) throw new HttpError(404, "No Samicus user has that email yet. Ask them to sign up first.");

  const { data: grant, error } = await supabase
    .from("matter_access_grants")
    .insert({ matter_id: ctx.matter.id, subject_id: person.id, subject_type: "user", subject_name: person.full_name, subject_role: input.role, scope: input.scope })
    .select()
    .single();
  if (error) throw error;

  const { error: auditError } = await supabase.from("audit_logs").insert({
    actor_id: req.user.id, actor_role: req.user.role, action: "matter_access_granted", subject_type: "Matter", subject_id: ctx.matter.id,
  });
  if (auditError) throw auditError;
  res.status(201).json(grant);
});

router.delete("/matters/:id/access/:gid", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const ctx = await loadMatterForUser(req.user, req.params.id);
  requireSide(ctx, "client");
  await assertAccountMember(req.user.id, ctx.matter.account_id, ["owner", "admin"]);

  const { error } = await supabase
    .from("matter_access_grants")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", req.params.gid)
    .eq("matter_id", ctx.matter.id);
  if (error) throw error;

  // Revocation is immediate and always audit-logged, per the data-model doc.
  const { error: auditError } = await supabase.from("audit_logs").insert({
    actor_id: req.user.id, actor_role: req.user.role, action: "matter_access_revoked", subject_type: "Matter", subject_id: ctx.matter.id,
  });
  if (auditError) throw auditError;
  res.status(204).end();
});

// --- Fees: proposal → acceptance → invoices ---

const proposalSchema = z.object({
  scopeText: z.string().trim().min(10).max(4000),
  milestones: z.array(z.object({ label: z.string().trim().min(2).max(200), amount: z.number().min(0), trigger: z.string().trim().max(200).optional() })).min(1).max(12),
  statutoryEstimate: z.string().trim().max(300).optional(),
  exclusions: z.array(z.string().trim().max(200)).max(10).default([]),
  validUntil: z.string().datetime({ offset: true }).optional(),
});

router.post("/matters/:id/fee-proposals", requireAuth, async (req, res) => {
  const ctx = await loadMatterForUser(req.user, req.params.id);
  requireSide(ctx, "advocate", "Only the engaged advocate can send a fee proposal.");
  const input = parse(proposalSchema, req.body);
  const { data: proposal, error } = await getSupabase()
    .from("fee_proposals")
    .insert({
      matter_id: ctx.matter.id,
      advocate_id: ctx.advocate.id,
      scope_text: input.scopeText,
      milestones: input.milestones,
      statutory_estimate: input.statutoryEstimate,
      exclusions: input.exclusions,
      valid_until: input.validUntil,
    })
    .select()
    .single();
  if (error) throw error;
  res.status(201).json(proposal);
});

router.post("/matters/:id/fee-proposals/:pid/accept", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const ctx = await loadMatterForUser(req.user, req.params.id);
  requireSide(ctx, "client", "Only the client can accept a fee proposal.");
  await assertAccountMember(req.user.id, ctx.matter.account_id, ["owner", "admin", "finance"]);

  const { data: existing, error: findError } = await supabase.from("fee_proposals").select("*").eq("id", req.params.pid).eq("matter_id", ctx.matter.id).maybeSingle();
  if (findError) throw findError;
  if (!existing) throw new HttpError(404, "Proposal not found.");
  if (existing.accepted_at) throw new HttpError(409, "This proposal was already accepted.");
  if (existing.valid_until && new Date(existing.valid_until) < new Date()) throw new HttpError(410, "This proposal has expired. Ask your advocate for a new one.");

  const { data: proposal, error } = await supabase.from("fee_proposals").update({ accepted_at: new Date().toISOString() }).eq("id", existing.id).select().single();
  if (error) throw error;

  const { error: matterError } = await supabase
    .from("matters")
    .update({ stage: "engagement_confirmed", engaged_at: new Date().toISOString(), next_action: "Advocate to begin work per the agreed scope" })
    .eq("id", ctx.matter.id);
  if (matterError) throw matterError;

  const { error: timelineError } = await supabase.from("timeline_events").insert({
    matter_id: ctx.matter.id, type: "engagement_confirmed", title: "Fee proposal accepted — engagement confirmed", actor_type: "user", actor_id: req.user.id,
  });
  if (timelineError) throw timelineError;
  res.json(proposal);
});

const invoiceSchema = z.object({
  items: z
    .array(z.object({ label: z.string().trim().min(2).max(200), amount: z.number().positive(), category: z.enum(["professional", "government"]) }))
    .min(1)
    .max(12),
  dueAt: z.string().datetime({ offset: true }).optional(),
});

// Itemised the way the product promises: professional, government and platform fees are
// always separate lines; GST (18%) applies to professional + platform fee.
router.post("/matters/:id/invoices", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const ctx = await loadMatterForUser(req.user, req.params.id);
  requireSide(ctx, "advocate", "Only the engaged advocate can raise an invoice.");
  const input = parse(invoiceSchema, req.body);

  const lines = [
    ...input.items.map((i) => ({ ...i, tax_rate: i.category === "professional" ? GST_RATE * 100 : 0 })),
    { label: "Platform fee", amount: PLATFORM_FEE, category: "platform", tax_rate: GST_RATE * 100 },
  ];
  const taxable = lines.filter((l) => l.tax_rate > 0).reduce((s, l) => s + l.amount, 0);
  const gst = Math.round(taxable * GST_RATE);
  const total = lines.reduce((s, l) => s + l.amount, 0) + gst;

  const { data: invoice, error } = await supabase.from("invoices").insert({ matter_id: ctx.matter.id, total, due_at: input.dueAt, status: "due" }).select().single();
  if (error) throw error;
  const { error: lineError } = await supabase
    .from("invoice_line_items")
    .insert(lines.map((l, position) => ({ invoice_id: invoice.id, position, label: l.label, amount: l.amount, category: l.category, tax_rate: l.tax_rate })));
  if (lineError) throw lineError;
  res.status(201).json({ ...invoice, gst });
});

router.get("/accounts/:id/legal-spend", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  await assertAccountMember(req.user.id, req.params.id, ["owner", "admin", "finance"]);
  const { data: matters, error } = await supabase.from("matters").select("id, stage").eq("account_id", req.params.id);
  if (error) throw error;

  const matterIds = matters.map((m) => m.id);
  let invoices = [];
  if (matterIds.length > 0) {
    const { data, error: invoiceError } = await supabase
      .from("invoices")
      .select("total, status, invoice_line_items(category, amount)")
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
      if (inv.status === "paid") acc.paid += Number(inv.total);
      return acc;
    },
    { professional: 0, government: 0, platform: 0, total: 0, paid: 0 }
  );

  res.json({ openMatters: matters.filter((m) => !["closed", "archived"].includes(m.stage)).length, totals });
});

export default router;
