/**
 * Business logic for the payments domain. Ported from routes/payments.js -- same behaviour,
 * including the exact validation order, error messages and fee maths, split out from HTTP
 * concerns. The amount paid is always computed here from the subject row, never trusted from
 * the client.
 */
import { HttpError, assertAccountMember } from "../../services/access.js";
import { createRazorpayOrder, paymentsEnabled, verifyCheckoutSignature, verifyWebhookSignature } from "../../services/razorpay.js";
import type { CreatePaymentIntentInput, PaymentHistoryItemDto, PaymentIntentDto, VerifyPaymentInput, VerifyPaymentResultDto } from "@vidhira/contracts";
import * as repo from "./repository.js";

const METHOD_MAP: Record<string, string> = { upi: "upi", card: "card", netbanking: "net_banking", wallet: "card" };
const PLATFORM_FEE = 99;
const GST_RATE = 0.18;

interface Payable {
  accountId: string;
  amount: number;
}

// Works out what is being paid for and how much -- always from the database, never from the client.
async function loadPayable(user: { id: string }, kind: CreatePaymentIntentInput["kind"], id: string): Promise<Payable> {
  if (kind === "consultation") {
    const row = await repo.findConsultationForPayment(id);
    if (!row) throw new HttpError(404, "Consultation not found.");
    await assertAccountMember(user.id, row.account_id).catch(() => {
      throw new HttpError(404, "Consultation not found.");
    });
    if (row.paid_at) throw new HttpError(409, "Already paid.");
    if (row.state === "cancelled") throw new HttpError(409, "This consultation was cancelled.");
    return { accountId: row.account_id, amount: Number(row.fee_total) };
  }
  if (kind === "invoice") {
    const row = await repo.findInvoiceForPayment(id);
    if (!row) throw new HttpError(404, "Invoice not found.");
    await assertAccountMember(user.id, row.matter?.account_id, ["owner", "admin", "finance"]).catch(() => {
      throw new HttpError(404, "Invoice not found.");
    });
    if (row.status === "paid") throw new HttpError(409, "Already paid.");
    return { accountId: row.matter!.account_id, amount: Number(row.total) };
  }
  if (kind === "service_order") {
    const row = await repo.findServiceOrderForPayment(id);
    if (!row) throw new HttpError(404, "Order not found.");
    await assertAccountMember(user.id, row.account_id).catch(() => {
      throw new HttpError(404, "Order not found.");
    });
    if (row.paid_at) throw new HttpError(409, "Already paid.");
    const fee = Number(row.service!.professional_fee);
    const gov = Number(row.service!.government_fee);
    return { accountId: row.account_id, amount: fee + gov + PLATFORM_FEE + Math.round((fee + PLATFORM_FEE) * GST_RATE) };
  }
  if (kind === "draft_review") {
    const row = await repo.findDraftReviewForPayment(id);
    if (!row) throw new HttpError(404, "Review not found.");
    await assertAccountMember(user.id, row.draft?.account_id).catch(() => {
      throw new HttpError(404, "Review not found.");
    });
    if (row.paid_at) throw new HttpError(409, "Already paid.");
    const fee = Number(row.fee);
    return { accountId: row.draft!.account_id, amount: fee + PLATFORM_FEE + Math.round((fee + PLATFORM_FEE) * GST_RATE) };
  }
  throw new HttpError(400, "Unsupported payment kind.");
}

export async function createIntent(user: { id: string }, input: CreatePaymentIntentInput): Promise<PaymentIntentDto> {
  if (!paymentsEnabled()) throw new HttpError(503, "Online payments are not enabled on this deployment.", { code: "PAYMENTS_DISABLED" });
  const payable = await loadPayable(user, input.kind, input.id);
  const amountPaise = Math.round(payable.amount * 100);
  if (!(amountPaise > 0)) throw new HttpError(409, "Nothing to pay.");

  const order = (await createRazorpayOrder({ amountPaise, receipt: `${input.kind.slice(0, 4)}-${input.id.slice(0, 8)}`, notes: { kind: input.kind, subjectId: input.id } })) as { id: string };
  const row = await repo.insertPaymentOrder({ kind: input.kind, subjectId: input.id, accountId: payable.accountId, createdBy: user.id, amountPaise, providerOrderId: order.id });
  return { paymentOrderId: row.id, orderId: row.provider_order_id, amountPaise: row.amount_paise, currency: row.currency, keyId: process.env.RAZORPAY_KEY_ID ?? null };
}

// Marks the subject paid. Idempotent: the conditional update only wins once per order.
async function settle(providerOrderId: string, providerPaymentId: string, method: string | undefined): Promise<repo.PaymentOrderRow | null> {
  const order = await repo.settlePaymentOrder(providerOrderId, providerPaymentId, method ?? null);
  if (!order) return null; // already settled (or unknown)

  const paidAt = order.paid_at!;
  if (order.kind === "consultation") {
    await repo.markConsultationPaid(order.subject_id, paidAt, METHOD_MAP[method ?? ""] ?? null);
  } else if (order.kind === "service_order") {
    await repo.markServiceOrderPaid(order.subject_id, paidAt);
  } else if (order.kind === "draft_review") {
    await repo.markDraftReviewPaid(order.subject_id, paidAt);
  } else if (order.kind === "invoice") {
    await repo.capturePayment(order.subject_id, METHOD_MAP[method ?? ""] ?? "upi", providerPaymentId, "held");
  }
  return order;
}

export async function verifyPayment(user: { id: string }, input: VerifyPaymentInput): Promise<VerifyPaymentResultDto> {
  if (!paymentsEnabled()) throw new HttpError(503, "Online payments are not enabled.", { code: "PAYMENTS_DISABLED" });
  const order = await repo.findPaymentOrderByProviderOrderId(input.orderId);
  if (!order || order.created_by !== user.id) throw new HttpError(404, "Order not found.");
  if (!verifyCheckoutSignature({ orderId: input.orderId, paymentId: input.paymentId, signature: input.signature })) {
    throw new HttpError(400, "Payment signature could not be verified.");
  }

  await settle(input.orderId, input.paymentId, input.method);
  return { ok: true, kind: order.kind as VerifyPaymentResultDto["kind"], subjectId: order.subject_id };
}

// Razorpay -> server confirmation (covers the browser closing before /verify runs).
export async function handleWebhook(rawBody: Buffer, signature: string | string[] | undefined): Promise<void> {
  if (!verifyWebhookSignature(rawBody, signature)) throw new HttpError(400, "Bad signature");
  const event = JSON.parse(rawBody.toString("utf8"));
  const payment = event?.payload?.payment?.entity;
  if (event.event === "payment.captured" && payment?.order_id) {
    await settle(payment.order_id, payment.id, payment.method);
  }
}

export async function getHistory(userId: string): Promise<PaymentHistoryItemDto[]> {
  const rows = await repo.listPaymentHistoryForUser(userId);
  return rows as unknown as PaymentHistoryItemDto[];
}
