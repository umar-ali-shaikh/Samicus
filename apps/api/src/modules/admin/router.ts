/**
 * Admin (trust & safety) domain router. Ported from routes/admin.js -- zero business logic
 * here, per docs/architecture/01-target-architecture.md section 3. Response DTOs are
 * Zod-parsed (.strict()) before being sent.
 */
import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { HttpError } from "../../services/access.js";
import { adminMatterAccessSchema, adminMatterReviewDto, adminAccessGrantListItemDto, decideVerificationSchema, adminStatsDto, usageDto, verificationCaseListItemDto, verificationCaseDto, complaintsReportDto } from "@vidhira/contracts";
import { z } from "zod";
import * as service from "./service.js";

const router = Router();
router.use("/admin", requireAuth, requireRole("admin", "founder"));

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, result.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  return result.data;
}

// Lightweight cost/usage visibility for the per-call-billed providers -- in-memory only.
router.get("/admin/usage", async (_req, res) => {
  res.json(usageDto.parse(await service.getUsage()));
});

// Complaint triage is shared by trust & safety (admin) and the founder.
router.get("/admin/complaints", async (_req, res) => {
  res.json(complaintsReportDto.parse(await service.getComplaintsReport()));
});

router.get("/admin/stats", async (_req, res) => {
  res.json(adminStatsDto.parse(await service.getStats()));
});

router.get("/admin/verification-cases", async (_req, res) => {
  res.json(z.array(verificationCaseListItemDto).parse(await service.listPendingVerificationCases()));
});

// Verification is a gate (data-model doc principle #4): only this action can flip an advocate
// to "verified", and it is always audit-logged.
router.post("/admin/verification-cases/:id/decide", requireRole("admin"), async (req, res) => {
  const input = parse(decideVerificationSchema, req.body);
  res.json(verificationCaseDto.parse(await service.decideVerification(req.user!, String(req.params.id), input)));
});

// Break-glass matter access -- admin only (trust & safety), never founder. Every attempt is
// logged; see service.accessMatter.
router.post("/admin/matter-access", requireRole("admin"), async (req, res) => {
  const input = parse(adminMatterAccessSchema, req.body);
  res.json(adminMatterReviewDto.parse(await service.accessMatter(req.user!, input)));
});

// The access log itself is readable by the founder too -- oversight of trust & safety.
router.get("/admin/matter-access", async (_req, res) => {
  res.json(z.array(adminAccessGrantListItemDto).parse(await service.listAccessGrants()));
});

export default router;
