/**
 * Messages domain router. Ported from routes/messages.js -- zero business logic here, per
 * docs/architecture/01-target-architecture.md section 3. Response DTOs are Zod-parsed
 * (.strict()) before being sent.
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../../middleware/auth.js";
import { HttpError } from "../../services/access.js";
import { sendMessageSchema, threadListItemDto, messageDto } from "@vidhira/contracts";
import { z } from "zod";
import * as service from "./service.js";

const router = Router();

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, result.error.issues.map((i) => i.message).join("; "));
  return result.data;
}

router.get("/threads", requireAuth, async (req, res) => {
  const threads = await service.listMyThreads(req.user!.id);
  res.json(threads.map((t) => threadListItemDto.parse(t)));
});

router.get("/threads/:id/messages", requireAuth, async (req, res) => {
  const messages = await service.getThreadMessages(req.user!.id, req.params.id as string);
  res.json(messages.map((m) => messageDto.parse(m)));
});

const sendLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: (req) => req.user?.id || req.ip!,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  message: { error: "You're sending messages too quickly." },
});

router.post("/threads/:id/messages", requireAuth, sendLimiter, async (req, res) => {
  const input = parse(sendMessageSchema, req.body);
  const message = await service.sendMessage(req.user!.id, req.params.id as string, input);
  res.status(201).json(messageDto.parse(message));
});

export default router;
