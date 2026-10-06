import { Router } from "express";
import { z } from "zod";
import { getSupabase } from "../config/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { HttpError, assertAccountMember, defaultAccountId, memberAccountIds } from "../services/access.js";
import { computeFees } from "../services/matching.js";

const router = Router();

// Service catalogue: the fixed-fee product list. Managed by admins, never hard-coded.
router.get("/services", async (req, res) => {
  const { data, error } = await getSupabase().from("services").select("*").order("category").order("name");
  if (error) throw error;
  res.json(data.map((s) => ({ ...s, fees: computeFees(Number(s.professional_fee)), gov: Number(s.government_fee) })));
});

const serviceSchema = z.object({
  category: z.string().trim().min(2).max(60),
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(1000).optional(),
  professionalFee: z.number().min(0),
  governmentFee: z.number().min(0).default(0),
  timelineDays: z.number().int().min(1).max(365).optional(),
  includes: z.array(z.string().trim().max(160)).max(12).default([]),
  requiredDocuments: z.array(z.string().trim().max(160)).max(12).default([]),
  deliverables: z.array(z.string().trim().max(160)).max(12).default([]),
});

function toRow(i) {
  return {
    category: i.category, name: i.name, description: i.description, professional_fee: i.professionalFee, government_fee: i.governmentFee,
    timeline_days: i.timelineDays, includes: i.includes, required_documents: i.requiredDocuments, deliverables: i.deliverables,
  };
}

router.post("/admin/services", requireAuth, requireRole("admin"), async (req, res) => {
  const parsed = serviceSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const { data, error } = await getSupabase().from("services").insert(toRow(parsed.data)).select().single();
  if (error) throw error;
  res.status(201).json(data);
});

router.put("/admin/services/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const parsed = serviceSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const { data, error } = await getSupabase().from("services").update(toRow(parsed.data)).eq("id", req.params.id).select().maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "Service not found.");
  res.json(data);
});

router.delete("/admin/services/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const { count, error: countError } = await getSupabase().from("service_orders").select("*", { count: "exact", head: true }).eq("service_id", req.params.id);
  if (countError) throw countError;
  if (count > 0) throw new HttpError(409, "This service has orders and cannot be deleted.");
  const { error } = await getSupabase().from("services").delete().eq("id", req.params.id);
  if (error) throw error;
  res.status(204).end();
});

router.post("/services/:id/orders", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const accountId = req.body?.accountId || (await defaultAccountId(req.user.id));
  await assertAccountMember(req.user.id, accountId);
  const { data: service, error: serviceError } = await supabase.from("services").select("id").eq("id", req.params.id).maybeSingle();
  if (serviceError) throw serviceError;
  if (!service) throw new HttpError(404, "Service not found.");

  const { data: order, error } = await supabase
    .from("service_orders")
    .insert({ service_id: service.id, account_id: accountId, status: "started", notes: req.body?.notes ? String(req.body.notes).slice(0, 2000) : null })
    .select()
    .single();
  if (error) throw error;
  res.status(201).json(order);
});

router.get("/service-orders", requireAuth, async (req, res) => {
  const accountIds = await memberAccountIds(req.user.id);
  if (accountIds.length === 0) return res.json([]);
  const { data, error } = await getSupabase()
    .from("service_orders")
    .select("*, service:services(name, category, professional_fee, government_fee)")
    .in("account_id", accountIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  res.json(data);
});

// Admin: paid orders waiting for an advocate, and assignment.
router.get("/admin/service-orders", requireAuth, requireRole("admin"), async (req, res) => {
  const { data, error } = await getSupabase()
    .from("service_orders")
    .select("*, service:services(name, category), account:accounts(display_name), advocate:advocates(id, user:users(full_name))")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  res.json(data);
});

router.post("/admin/service-orders/:id/assign", requireAuth, requireRole("admin"), async (req, res) => {
  const { advocateId } = req.body || {};
  const { data: advocate, error: advocateError } = await getSupabase().from("advocates").select("id").eq("id", advocateId).eq("verification_status", "verified").maybeSingle();
  if (advocateError) throw advocateError;
  if (!advocate) throw new HttpError(404, "Verified advocate not found.");
  const { data, error } = await getSupabase().from("service_orders").update({ advocate_id: advocate.id, status: "in_progress" }).eq("id", req.params.id).select().maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "Order not found.");
  res.json(data);
});

export default router;
