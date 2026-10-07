/**
 * Consultations domain router. Ported from routes/consultations.js -- zero business logic
 * here, per docs/architecture/01-target-architecture.md section 3. Response DTOs are
 * Zod-parsed (.strict()) before being sent.
 */
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { HttpError } from "../../services/access.js";
import {
  bookConsultationSchema,
  patchConsultationSchema,
  consultationFeedbackSchema,
  consultationDto,
  consultationListItemDto,
  consultationFeedbackResultDto,
  consultationRoomDto,
  convertToMatterResultDto,
} from "@vidhira/contracts";
import { z } from "zod";
import * as service from "./service.js";

const router = Router();

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, result.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  return result.data;
}

router.post("/consultations", requireAuth, async (req, res) => {
  const input = parse(bookConsultationSchema, req.body);
  const consultation = await service.bookConsultation(req.user!, input);
  res.status(201).json(consultationDto.parse(consultation));
});

router.get("/consultations", requireAuth, async (req, res) => {
  const consultations = await service.listMyConsultations(req.user!.id);
  res.json(consultations.map((c) => consultationListItemDto.parse(c)));
});

router.patch("/consultations/:id", requireAuth, async (req, res) => {
  const input = parse(patchConsultationSchema, req.body);
  const consultation = await service.patchConsultation(req.user!, req.params.id as string, input);
  res.json(consultationDto.parse(consultation));
});

router.post("/consultations/:id/feedback", requireAuth, async (req, res) => {
  const input = parse(consultationFeedbackSchema, req.body);
  const result = await service.submitFeedback(req.user!, req.params.id as string, input);
  res.json(consultationFeedbackResultDto.parse(result));
});

router.post("/consultations/:id/room", requireAuth, async (req, res) => {
  const result = await service.openRoom(req.user!, req.params.id as string);
  res.json(consultationRoomDto.parse(result));
});

router.post("/consultations/:id/convert-to-matter", requireAuth, async (req, res) => {
  const title = typeof req.body?.title === "string" ? req.body.title : undefined;
  const result = await service.convertToMatter(req.user!, req.params.id as string, title);
  res.json(convertToMatterResultDto.parse(result));
});

export default router;
