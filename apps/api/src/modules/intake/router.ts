/**
 * Intake/matching domain router. Ported from routes/intake.js -- zero business logic here, per
 * docs/architecture/01-target-architecture.md section 3. Response DTOs are Zod-parsed
 * (.strict()) before being sent.
 */
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { HttpError } from "../../services/access.js";
import { createIntakeSchema, urgentRequestSchema, intakeDto, intakeListItemDto, matchesResponseDto, urgentRequestResultDto, intakeStatusDto } from "@vidhira/contracts";
import { z } from "zod";
import * as service from "./service.js";

const router = Router();

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, result.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  return result.data;
}

// Facts (description) are stored but never returned to an advocate until conflict-check
// clears AND the client explicitly consents -- see /intake-requests/:id/consent below.
router.post("/intake-requests", requireAuth, async (req, res) => {
  const input = parse(createIntakeSchema, req.body);
  const intake = await service.createScheduledOrInstantIntake(req.user!, input);
  res.status(201).json(intakeDto.parse(intake));
});

router.get("/intake-requests", requireAuth, async (req, res) => {
  const intakes = await service.listMyIntakes(req.user!.id);
  res.json(intakes.map((i) => intakeListItemDto.parse(i)));
});

router.get("/intake-requests/:id/matches", requireAuth, async (req, res) => {
  const result = await service.computeMatches(req.user!, req.params.id as string);
  res.json(matchesResponseDto.parse(result));
});

router.post("/intake-requests/:id/consent", requireAuth, async (req, res) => {
  const intake = await service.giveConsent(req.user!, req.params.id as string);
  res.json(intakeDto.parse(intake));
});

// Urgent path -- same request model, shorter SLA framing, fastest-callback fallback.
router.post("/urgent-requests", requireAuth, async (req, res) => {
  const input = parse(urgentRequestSchema, req.body);
  const result = await service.createUrgentRequest(req.user!, input);
  res.json(urgentRequestResultDto.parse(result));
});

// Poll target for the instant / urgent flow: has an advocate accepted yet?
router.get("/intake-requests/:id", requireAuth, async (req, res) => {
  const status = await service.getIntakeStatus(req.user!, req.params.id as string);
  res.json(intakeStatusDto.parse(status));
});

// The client withdraws a request that is still waiting for an advocate.
router.post("/intake-requests/:id/cancel", requireAuth, async (req, res) => {
  const intake = await service.cancelIntake(req.user!, req.params.id as string);
  res.json(intakeDto.parse(intake));
});

export default router;
