/**
 * AI Legal Assistant domain router. Ported from routes/legalAssistant.js -- zero business
 * logic here, per docs/architecture/01-target-architecture.md section 3. Response DTOs are
 * Zod-parsed (.strict()) before being sent.
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../../middleware/auth.js";
import { HttpError } from "../../services/access.js";
import { askAssistantSchema, assistantAnswerDto, assistantSessionDto, SESSION_ID_RE } from "@vidhira/contracts";
import * as service from "./service.js";

const router = Router();

// Per signed-in user (the route is behind requireAuth) -- every hit spends real IK +
// OpenRouter money, so this is tighter than the global per-IP backstop.
const askLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  keyGenerator: (req) => req.user?.id || req.ip || "unknown",
  validate: { keyGeneratorIpFallback: false },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many questions from this address — please wait a few minutes and try again." },
});

router.post("/legal-assistant/ask", requireAuth, askLimiter, async (req, res) => {
  const result = askAssistantSchema.safeParse(req.body);
  if (!result.success) throw new HttpError(400, result.error.issues[0]?.message || "'question' is required.");
  const answer = await service.ask(req.user!, result.data);
  res.json(assistantAnswerDto.parse(answer));
});

router.get("/legal-assistant/session/:sessionId", requireAuth, async (req, res) => {
  const sessionId = String(req.params.sessionId);
  if (!SESSION_ID_RE.test(sessionId)) throw new HttpError(400, "Invalid sessionId.");
  const turns = await service.getSessionTurns(req.user!.id, sessionId);
  res.json(assistantSessionDto.parse({ turns }));
});

export default router;
