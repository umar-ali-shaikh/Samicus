/**
 * Complaints domain router. Ported from routes/complaints.js -- zero business logic here, per
 * docs/architecture/01-target-architecture.md section 3. Response DTOs are Zod-parsed
 * (.strict()) before being sent.
 */
import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { HttpError } from "../../services/access.js";
import { createComplaintSchema, updateComplaintSchema, createdComplaintDto, myComplaintDto, complaintDto } from "@vidhira/contracts";
import { z } from "zod";
import { createRateLimiter } from "../../platform/rateLimit.js";
import * as service from "./service.js";

const router = Router();

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return result.data;
}

const limiter = createRateLimiter("rl:complaints:", {
  windowMs: 60 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => req.user?.id || req.ip || "unknown",
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
});

router.post("/complaints", requireAuth, limiter, async (req, res) => {
  const input = parse(createComplaintSchema, req.body);
  res.status(201).json(createdComplaintDto.parse(await service.createComplaint(req.user!, input)));
});

router.get("/complaints/mine", requireAuth, async (req, res) => {
  res.json(z.array(myComplaintDto).parse(await service.listMyComplaints(req.user!)));
});

router.patch("/admin/complaints/:id", requireAuth, requireRole("admin", "founder"), async (req, res) => {
  const input = parse(updateComplaintSchema, req.body);
  res.json(complaintDto.parse(await service.updateComplaint(String(req.params.id), input)));
});

export default router;
