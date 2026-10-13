/**
 * Ask-&-learn domain router. Ported from routes/askLearn.js -- zero business logic here, per
 * docs/architecture/01-target-architecture.md section 3. Response DTOs are Zod-parsed
 * (.strict()) before being sent.
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { HttpError } from "../../services/access.js";
import {
  askQuestionSchema,
  answerQuestionSchema,
  createGuideSchema,
  moderationDecisionSchema,
  specialisationDto,
  createdQuestionDto,
  publicQuestionDto,
  myQuestionDto,
  createdAnswerDto,
  guideListItemDto,
  guideDetailDto,
  moderationQueueDto,
} from "@vidhira/contracts";
import { z } from "zod";
import * as service from "./service.js";

const router = Router();

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, result.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  return result.data;
}

const questionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => req.user?.id || req.ip || "unknown",
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  message: { error: "You can post up to 5 questions an hour." },
});

router.post("/questions", requireAuth, questionLimiter, async (req, res) => {
  const input = parse(askQuestionSchema, req.body);
  res.status(201).json(createdQuestionDto.parse(await service.askQuestion(req.user!, input)));
});

router.get("/questions", async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  res.json(z.array(publicQuestionDto).parse(await service.listPublishedQuestions({ area: q.area, q: q.q })));
});

router.get("/questions/mine", requireAuth, async (req, res) => {
  res.json(z.array(myQuestionDto).parse(await service.listMyQuestions(req.user!)));
});

router.post("/questions/:id/answers", requireAuth, requireRole("advocate"), async (req, res) => {
  const input = parse(answerQuestionSchema, req.body);
  res.status(201).json(createdAnswerDto.parse(await service.answerQuestion(req.user!, String(req.params.id), input)));
});

router.post("/answers/:id/helpful", requireAuth, async (req, res) => {
  res.json(await service.markAnswerHelpful(String(req.params.id)));
});

router.get("/guides", async (_req, res) => {
  res.json(z.array(guideListItemDto).parse(await service.listGuides()));
});

router.get("/guides/:id", async (req, res) => {
  res.json(guideDetailDto.parse(await service.getGuide(String(req.params.id))));
});

router.post("/admin/guides", requireAuth, requireRole("admin"), async (req, res) => {
  const input = parse(createGuideSchema, req.body);
  res.status(201).json(guideDetailDto.parse(await service.createGuide(input)));
});

router.delete("/admin/guides/:id", requireAuth, requireRole("admin"), async (req, res) => {
  await service.deleteGuide(String(req.params.id));
  res.status(204).end();
});

router.get("/admin/moderation", requireAuth, requireRole("admin"), async (_req, res) => {
  res.json(moderationQueueDto.parse(await service.getModerationQueue()));
});

router.post("/admin/moderation/:type/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const type = req.params.type;
  if (type !== "question" && type !== "answer") throw new HttpError(400, "type must be 'question' or 'answer'.");
  const input = parse(moderationDecisionSchema, req.body);
  res.json(await service.decideModeration(req.user!, type, String(req.params.id), input));
});

router.get("/specialisations", async (_req, res) => {
  res.json(z.array(specialisationDto).parse(await service.listSpecialisations()));
});

export default router;
