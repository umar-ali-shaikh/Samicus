/**
 * Payments domain contracts. Ported from apps/api/src/routes/payments.js's inline validation
 * and its handlers' response shapes. The amount paid is always computed server-side from the
 * subject row (consultation/invoice/service_order/draft_review) -- the client only ever sends
 * which thing it wants to pay for, never an amount.
 */
import { z } from "zod";

export const PAYMENT_KINDS = ["consultation", "invoice", "service_order", "draft_review"] as const;
export const PAYMENT_ORDER_STATUSES = ["created", "paid", "failed"] as const;

export const createPaymentIntentSchema = z.object({
  kind: z.enum(PAYMENT_KINDS),
  id: z.string().uuid(),
});
export type CreatePaymentIntentInput = z.infer<typeof createPaymentIntentSchema>;

export const paymentIntentDto = z
  .object({
    paymentOrderId: z.string(),
    orderId: z.string(),
    amountPaise: z.number(),
    currency: z.string(),
    keyId: z.string().nullable(),
  })
  .strict();
export type PaymentIntentDto = z.infer<typeof paymentIntentDto>;

export const verifyPaymentSchema = z.object({
  orderId: z.string().min(5),
  paymentId: z.string().min(5),
  signature: z.string().min(10),
  method: z.string().optional(),
});
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;

export const verifyPaymentResultDto = z.object({ ok: z.literal(true), kind: z.enum(PAYMENT_KINDS), subjectId: z.string() }).strict();
export type VerifyPaymentResultDto = z.infer<typeof verifyPaymentResultDto>;

export const paymentHistoryItemDto = z
  .object({
    id: z.string(),
    kind: z.enum(PAYMENT_KINDS),
    subject_id: z.string(),
    amount_paise: z.number(),
    currency: z.string(),
    status: z.enum(PAYMENT_ORDER_STATUSES),
    method: z.string().nullable(),
    paid_at: z.string().nullable(),
    created_at: z.string(),
  })
  .strict();
export type PaymentHistoryItemDto = z.infer<typeof paymentHistoryItemDto>;
