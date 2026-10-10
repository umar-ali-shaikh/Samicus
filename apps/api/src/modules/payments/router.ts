/**
 * Payments domain router. Ported from routes/payments.js -- zero business logic here, per
 * docs/architecture/01-target-architecture.md section 3. Response DTOs are Zod-parsed
 * (.strict()) before being sent.
 */
import { Router } from "express";
import express from "express";
import { requireAuth } from "../../middleware/auth.js";
import { HttpError } from "../../services/access.js";
import { createPaymentIntentSchema, verifyPaymentSchema, paymentIntentDto, verifyPaymentResultDto, paymentHistoryItemDto } from "@vidhira/contracts";
import { z } from "zod";
import * as service from "./service.js";

const router = Router();

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, result.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  return result.data;
}

router.post("/payments/intents", requireAuth, async (req, res) => {
  const input = parse(createPaymentIntentSchema, req.body);
  const intent = await service.createIntent(req.user!, input);
  res.status(201).json(paymentIntentDto.parse(intent));
});

router.post("/payments/verify", requireAuth, async (req, res) => {
  const input = parse(verifyPaymentSchema, req.body);
  const result = await service.verifyPayment(req.user!, input);
  res.json(verifyPaymentResultDto.parse(result));
});

router.get("/payments/history", requireAuth, async (req, res) => {
  const history = await service.getHistory(req.user!.id);
  res.json(history.map((h) => paymentHistoryItemDto.parse(h)));
});

// Razorpay -> server confirmation. Mounted separately (before express.json()) with a raw-body
// parser because the signature covers the exact bytes -- see app.js.
export const paymentWebhook = Router();
paymentWebhook.post("/payments/webhook", express.raw({ type: "application/json", limit: "1mb" }), async (req, res) => {
  const raw = req.body instanceof Buffer ? req.body : Buffer.from("");
  await service.handleWebhook(raw, req.headers["x-razorpay-signature"]);
  res.json({ ok: true });
});

export default router;
