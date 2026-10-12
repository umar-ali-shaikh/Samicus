/**
 * Contract-review domain router. Ported from routes/contractReview.js -- zero business logic
 * here, per docs/architecture/01-target-architecture.md section 3. Response DTOs are Zod-
 * parsed (.strict()) before being sent.
 */
import { Router } from "express";
import { HttpError } from "../../services/access.js";
import { createContractReviewSchema, contractReviewDetailDto, contractReviewListItemDto } from "@vidhira/contracts";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import * as service from "./service.js";

const router = Router();

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return result.data;
}

router.post("/contract-reviews", requireAuth, async (req, res) => {
  const input = parse(createContractReviewSchema, req.body);
  res.status(201).json(contractReviewDetailDto.parse(await service.createReview(req.user!, input)));
});

router.get("/contract-reviews", requireAuth, async (req, res) => {
  res.json(z.array(contractReviewListItemDto).parse(await service.listMyReviews(req.user!)));
});

router.get("/contract-reviews/:id", requireAuth, async (req, res) => {
  res.json(contractReviewDetailDto.parse(await service.getReviewDetail(req.user!, String(req.params.id))));
});

// Negotiation note as a DOCX -- comparison against a baseline, not a legal opinion.
router.get("/contract-reviews/:id/export", requireAuth, async (req, res) => {
  const buffer = await service.exportNegotiationNote(req.user!, String(req.params.id));
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  res.setHeader("Content-Disposition", 'attachment; filename="contract-review-note.docx"');
  res.send(buffer);
});

export default router;
