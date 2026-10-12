/**
 * Drafting domain router. Ported from routes/drafting.js -- zero business logic here, per
 * docs/architecture/01-target-architecture.md section 3. Response DTOs are Zod-parsed
 * (.strict()) before being sent.
 */
import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { HttpError, advocateForUser } from "../../services/access.js";
import {
  createDraftSchema,
  patchDraftSchema,
  requestDraftReviewSchema,
  returnDraftReviewSchema,
  docTemplateListItemDto,
  docTemplateDetailDto,
  documentDraftDto,
  draftListItemDto,
  draftPreviewResultDto,
  draftReviewDto,
  advocateDraftReviewListItemDto,
  advocateDraftReviewDetailDto,
} from "@vidhira/contracts";
import { z } from "zod";
import * as service from "./service.js";

const router = Router();

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return result.data;
}

router.get("/doc-templates", requireAuth, async (_req, res) => {
  res.json(z.array(docTemplateListItemDto).parse(await service.listTemplates()));
});

router.get("/doc-templates/:id", requireAuth, async (req, res) => {
  res.json(docTemplateDetailDto.parse(await service.getTemplateDetail(String(req.params.id))));
});

router.post("/drafts", requireAuth, async (req, res) => {
  const input = parse(createDraftSchema, req.body);
  res.status(201).json(documentDraftDto.parse(await service.createDraft(req.user!, input)));
});

router.get("/drafts", requireAuth, async (req, res) => {
  res.json(z.array(draftListItemDto).parse(await service.listMyDrafts(req.user!)));
});

router.get("/drafts/:id", requireAuth, async (req, res) => {
  res.json(documentDraftDto.parse(await service.getDraft(req.user!, String(req.params.id))));
});

router.patch("/drafts/:id", requireAuth, async (req, res) => {
  const input = parse(patchDraftSchema, req.body);
  res.json(documentDraftDto.parse(await service.patchDraft(req.user!, String(req.params.id), input)));
});

router.post("/drafts/:id/preview", requireAuth, async (req, res) => {
  res.json(draftPreviewResultDto.parse(await service.preview(req.user!, String(req.params.id))));
});

router.get("/drafts/:id/download", requireAuth, async (req, res) => {
  const format = req.query.format === "pdf" ? "pdf" : "docx";
  const { buffer, filename, contentType } = await service.download(req.user!, String(req.params.id), format);
  res.set({ "Content-Type": contentType, "Content-Disposition": `attachment; filename="${filename}"` });
  res.send(buffer);
});

router.post("/drafts/:id/reviews", requireAuth, async (req, res) => {
  const input = parse(requestDraftReviewSchema, req.body);
  res.status(201).json(draftReviewDto.parse(await service.requestReview(req.user!, String(req.params.id), input)));
});

router.get("/drafts/:id/reviews/:rid", requireAuth, async (req, res) => {
  res.json(draftReviewDto.parse(await service.getReview(req.user!, String(req.params.id), String(req.params.rid))));
});

// --- Advocate side ---

router.get("/advocate/draft-reviews", requireAuth, requireRole("advocate"), async (req, res) => {
  const advocate = await advocateForUser(req.user!.id);
  res.json(z.array(advocateDraftReviewListItemDto).parse(await service.listReviewsForAdvocate(advocate)));
});

router.get("/advocate/draft-reviews/:id", requireAuth, requireRole("advocate"), async (req, res) => {
  const advocate = await advocateForUser(req.user!.id);
  res.json(advocateDraftReviewDetailDto.parse(await service.getReviewDetailForAdvocate(advocate, String(req.params.id))));
});

router.post("/advocate/draft-reviews/:id/return", requireAuth, requireRole("advocate"), async (req, res) => {
  const advocate = await advocateForUser(req.user!.id);
  const input = parse(returnDraftReviewSchema, req.body);
  res.json(draftReviewDto.parse(await service.returnReview(advocate, String(req.params.id), input)));
});

export default router;
