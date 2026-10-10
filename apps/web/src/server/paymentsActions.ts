"use server";

import { apiClient, ApiError } from "./apiClient";
import type { CreatePaymentIntentInput, PaymentIntentDto, VerifyPaymentInput, VerifyPaymentResultDto } from "@vidhira/contracts";

// GET /config is still served by the not-yet-converted config.js -- only the one field this
// domain needs is typed here (loose, like other not-yet-converted cross-domain calls).
export interface PaymentsConfig {
  enabled: boolean;
  provider?: string;
  keyId?: string;
}

export async function getPaymentsConfigAction(): Promise<PaymentsConfig> {
  const config = await apiClient.get<{ payments: PaymentsConfig }>("/config");
  return config.payments;
}

export type CreateIntentResult = { ok: true; intent: PaymentIntentDto } | { ok: false; error: string };

export async function createPaymentIntentAction(input: CreatePaymentIntentInput): Promise<CreateIntentResult> {
  try {
    const intent = await apiClient.post<PaymentIntentDto>("/payments/intents", input);
    return { ok: true, intent };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}

export type VerifyPaymentActionResult = { ok: true; result: VerifyPaymentResultDto } | { ok: false; error: string };

export async function verifyPaymentAction(input: VerifyPaymentInput): Promise<VerifyPaymentActionResult> {
  try {
    const result = await apiClient.post<VerifyPaymentResultDto>("/payments/verify", input);
    return { ok: true, result };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}
