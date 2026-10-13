/**
 * Advocates domain router. Ported from routes/advocates.js -- zero business logic here, per
 * docs/architecture/01-target-architecture.md section 3. Response DTOs are Zod-parsed
 * (.strict()) before being sent.
 */
import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { selfAdvocate } from "./policy.js";
import { HttpError } from "../../services/access.js";
import {
  applyAdvocateSchema,
  advocateProfilePatchSchema,
  availabilityPatchSchema,
  notifyWhenAvailableSchema,
  directoryQuerySchema,
  advocateDto,
  directoryItemDto,
  availabilityDayDto,
  conflictCheckDto,
} from "@vidhira/contracts";
import { z } from "zod";
import * as service from "./service.js";

const router = Router();

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, result.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  return result.data;
}

// --- Public directory / profile / slots ---

// The response body is a plain array -- same wire shape as before pagination was added here,
// so frontend/src/screens/Find.jsx (the still-running legacy Vite screen, which calls this
// with no page/pageSize params) keeps working unmodified. Pagination is still real: the query
// is bounded (default pageSize 50, max 100) rather than unbounded, and metadata is exposed via
// headers for any client that wants to paginate properly (apps/web's new /advocates page does).
router.get("/advocates", async (req, res) => {
  const query = parse(directoryQuerySchema, req.query);
  const result = await service.searchDirectory(query);
  res.set({
    "X-Total-Count": String(result.total),
    "X-Page": String(result.page),
    "X-Page-Size": String(result.pageSize),
    "X-Has-More": String(result.hasMore),
  });
  res.json(result.items.map((item) => directoryItemDto.parse(item)));
});

router.post("/advocates/notify-when-available", requireAuth, async (req, res) => {
  const input = parse(notifyWhenAvailableSchema, req.body);
  await service.notifyWhenAvailable(req.user!.id, input);
  res.status(201).json({ ok: true });
});

router.get("/advocates/:id", async (req, res) => {
  const advocate = await service.getAdvocateById(req.params.id as string);
  res.json(advocateDto.parse(advocate));
});

router.get("/advocates/:id/slots", async (req, res) => {
  const slots = await service.getSlots(req.params.id as string);
  res.json(slots.map((s) => availabilityDayDto.parse(s)));
});

// --- Advocate onboarding ---

router.post("/advocate/apply", requireAuth, async (req, res) => {
  const input = parse(applyAdvocateSchema, req.body);
  const advocate = await service.applyAsAdvocate(req.user!, input);
  res.status(201).json(advocateDto.parse(advocate));
});

// --- Advocate self-service ---

router.patch("/advocate/availability", requireAuth, requireRole("advocate"), selfAdvocate, async (req, res) => {
  const input = parse(availabilityPatchSchema, req.body);
  const updated = await service.updateAvailability(req.advocate!, input);
  res.json(advocateDto.parse(updated));
});

router.get("/advocate/requests", requireAuth, requireRole("advocate"), selfAdvocate, async (req, res) => {
  const requests = await service.listMyRequests(req.advocate!);
  res.json(requests);
});

router.get("/advocate/requests/:id", requireAuth, requireRole("advocate"), selfAdvocate, async (req, res) => {
  const detail = await service.getRequestDetail(req.advocate!, req.params.id as string);
  res.json(detail);
});

router.post("/advocate/requests/:id/conflict-check", requireAuth, requireRole("advocate"), selfAdvocate, async (req, res) => {
  const check = await service.runConflictCheck(req.advocate!, req.params.id as string);
  res.json(conflictCheckDto.parse(check));
});

router.post("/advocate/requests/:id/accept", requireAuth, requireRole("advocate"), selfAdvocate, async (req, res) => {
  const result = await service.acceptRequest(req.advocate!, req.user!.id, req.params.id as string);
  res.json(result);
});

router.post("/advocate/requests/:id/decline", requireAuth, requireRole("advocate"), selfAdvocate, async (req, res) => {
  await service.declineRequest(req.advocate!, req.user!.id, req.params.id as string);
  res.status(204).end();
});

router.post("/advocate/resubmit", requireAuth, requireRole("advocate"), selfAdvocate, async (req, res) => {
  await service.resubmit(req.advocate!);
  res.json({ ok: true });
});

router.get("/advocate/profile", requireAuth, requireRole("advocate"), async (req, res) => {
  const profile = await service.getMyProfile(req.user!.id);
  res.json(advocateDto.parse(profile));
});

router.patch("/advocate/profile", requireAuth, requireRole("advocate"), async (req, res) => {
  const input = parse(advocateProfilePatchSchema, req.body);
  const updated = await service.updateMyProfile(req.user!.id, input);
  res.json(advocateDto.parse(updated));
});

export default router;
