import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { getSupabase } from "../config/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { HttpError } from "../services/access.js";

const router = Router();

const CATEGORIES = ["deliverable_delay", "compliance_coverage", "supply_gap", "citation_accuracy", "payment", "advocate_conduct", "other"];

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => req.user?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
});

const createSchema = z.object({
  title: z.string().trim().min(5).max(160),
  description: z.string().trim().min(20).max(4000),
  category: z.enum(CATEGORIES).default("other"),
  serviceInvolved: z.string().trim().max(80).optional(),
  linkedRecordType: z.enum(["matter", "consultation", "pack_scan", "research_query", "payment"]).optional(),
  linkedRecordId: z.string().uuid().optional(),
});

router.post("/complaints", requireAuth, limiter, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const i = parsed.data;
  const { data, error } = await getSupabase()
    .from("complaints")
    .insert({
      ref: `CMP-${new Date().getFullYear()}-${crypto.randomInt(10000, 99999)}`,
      title: i.title,
      description: i.description,
      category: i.category,
      service_involved: i.serviceInvolved,
      linked_record_type: i.linkedRecordType,
      linked_record_id: i.linkedRecordId,
      raised_by: req.user.id,
    })
    .select("id, ref, status")
    .single();
  if (error) throw error;
  res.status(201).json(data);
});

router.get("/complaints/mine", requireAuth, async (req, res) => {
  const { data, error } = await getSupabase()
    .from("complaints")
    .select("id, ref, title, category, status, created_at, corrective_action")
    .eq("raised_by", req.user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  res.json(data);
});

const updateSchema = z.object({
  status: z.enum(["open", "escalated", "resolved"]).optional(),
  severity: z.enum(["low", "medium", "high"]).optional(),
  owner: z.string().trim().max(80).optional(),
  rootCause: z.string().trim().max(1000).optional(),
  correctiveAction: z.string().trim().max(1000).optional(),
  refundAmount: z.number().min(0).optional(),
});

router.patch("/admin/complaints/:id", requireAuth, requireRole("admin", "founder"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Invalid update.");
  const i = parsed.data;
  const patch = {};
  for (const [k, col] of Object.entries({ status: "status", severity: "severity", owner: "owner", rootCause: "root_cause", correctiveAction: "corrective_action", refundAmount: "refund_amount" })) {
    if (i[k] !== undefined) patch[col] = i[k];
  }
  if (Object.keys(patch).length === 0) throw new HttpError(400, "Nothing to update.");
  const { data, error } = await getSupabase().from("complaints").update(patch).eq("id", req.params.id).select().maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "Not found");
  res.json(data);
});

export default router;
