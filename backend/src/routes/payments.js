import { Router } from "express";
import express from "express";
import { z } from "zod";
import { getSupabase } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError, assertAccountMember } from "../services/access.js";
import { createRazorpayOrder, paymentsEnabled, verifyCheckoutSignature, verifyWebhookSignature } from "../services/razorpay.js";

const router = Router();

const METHOD_MAP = { upi: "upi", card: "card", netbanking: "net_banking", wallet: "card" };

// Works out what is being paid for and how much — always from the database, never from the client.
async function loadPayable(user, kind, id) {
  const supabase = getSupabase();
  if (kind === "consultation") {
    const { data, error } = await supabase.from("consultations").select("id, account_id, fee_total, paid_at, state").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, "Consultation not found.");
    await assertAccountMember(user.id, data.account_id).catch(() => { throw new HttpError(404, "Consultation not found."); });
    if (data.paid_at) throw new HttpError(409, "Already paid.");
    if (data.state === "cancelled") throw new HttpError(409, "This consultation was cancelled.");
    return { accountId: data.account_id, amount: Number(data.fee_total) };
  }
  if (kind === "invoice") {
    const { data, error } = await supabase.from("invoices").select("id, total, status, matter:matters(account_id)").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, "Invoice not found.");
    await assertAccountMember(user.id, data.matter.account_id, ["owner", "admin", "finance"]).catch(() => { throw new HttpError(404, "Invoice not found."); });
    if (data.status === "paid") throw new HttpError(409, "Already paid.");
    return { accountId: data.matter.account_id, amount: Number(data.total) };
  }
  if (kind === "service_order") {
    const { data, error } = await supabase.from("service_orders").select("id, account_id, paid_at, service:services(professional_fee, government_fee)").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, "Order not found.");
    await assertAccountMember(user.id, data.account_id).catch(() => { throw new HttpError(404, "Order not found."); });
    if (data.paid_at) throw new HttpError(409, "Already paid.");
    const fee = Number(data.service.professional_fee);
    const gov = Number(data.service.government_fee);
    const platform = 99;
    return { accountId: data.account_id, amount: fee + gov + platform + Math.round((fee + platform) * 0.18) };
  }
  if (kind === "draft_review") {
    const { data, error } = await supabase.from("draft_reviews").select("id, fee, paid_at, draft:document_drafts(account_id)").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, "Review not found.");
    await assertAccountMember(user.id, data.draft.account_id).catch(() => { throw new HttpError(404, "Review not found."); });
    if (data.paid_at) throw new HttpError(409, "Already paid.");
    const fee = Number(data.fee);
    return { accountId: data.draft.account_id, amount: fee + 99 + Math.round((fee + 99) * 0.18) };
  }
  throw new HttpError(400, "Unsupported payment kind.");
}

const intentSchema = z.object({ kind: z.enum(["consultation", "invoice", "service_order", "draft_review"]), id: z.string().uuid() });

router.post("/payments/intents", requireAuth, async (req, res) => {
  if (!paymentsEnabled()) {
    throw new HttpError(503, "Online payments are not enabled on this deployment.", { code: "PAYMENTS_DISABLED" });
  }
  const parsed = intentSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "kind and id are required.");
  const { kind, id } = parsed.data;
  const payable = await loadPayable(req.user, kind, id);
  const amountPaise = Math.round(payable.amount * 100);
  if (!(amountPaise > 0)) throw new HttpError(409, "Nothing to pay.");

  const order = await createRazorpayOrder({ amountPaise, receipt: `${kind.slice(0, 4)}-${id.slice(0, 8)}`, notes: { kind, subjectId: id } });
  const { data, error } = await getSupabase()
    .from("payment_orders")
    .insert({ kind, subject_id: id, account_id: payable.accountId, created_by: req.user.id, amount_paise: amountPaise, provider_order_id: order.id })
    .select("id, provider_order_id, amount_paise, currency")
    .single();
  if (error) throw error;
  res.status(201).json({ paymentOrderId: data.id, orderId: data.provider_order_id, amountPaise: data.amount_paise, currency: data.currency, keyId: process.env.RAZORPAY_KEY_ID });
});

// Marks the subject paid. Idempotent: the conditional update only wins once per order.
async function settle(providerOrderId, providerPaymentId, method) {
  const supabase = getSupabase();
  const { data: order, error } = await supabase
    .from("payment_orders")
    .update({ status: "paid", provider_payment_id: providerPaymentId, method: method || null, paid_at: new Date().toISOString() })
    .eq("provider_order_id", providerOrderId)
    .neq("status", "paid")
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!order) return null; // already settled (or unknown)

  const paidAt = order.paid_at;
  if (order.kind === "consultation") {
    const { error: e } = await supabase.from("consultations").update({ paid_at: paidAt, payment_method: METHOD_MAP[method] || null }).eq("id", order.subject_id);
    if (e) throw e;
  } else if (order.kind === "service_order") {
    const { error: e } = await supabase.from("service_orders").update({ paid_at: paidAt }).eq("id", order.subject_id);
    if (e) throw e;
  } else if (order.kind === "draft_review") {
    const { error: e } = await supabase.from("draft_reviews").update({ paid_at: paidAt }).eq("id", order.subject_id);
    if (e) throw e;
  } else if (order.kind === "invoice") {
    // Payment row + invoice status as one transaction — see capture_payment() in schema.sql.
    const { error: e } = await supabase.rpc("capture_payment", {
      p_invoice_id: order.subject_id,
      p_method: METHOD_MAP[method] || "upi",
      p_gateway_ref: providerPaymentId,
      p_escrow_state: "held",
    });
    if (e) throw e;
  }
  return order;
}

const verifySchema = z.object({ orderId: z.string().min(5), paymentId: z.string().min(5), signature: z.string().min(10), method: z.string().optional() });

router.post("/payments/verify", requireAuth, async (req, res) => {
  if (!paymentsEnabled()) throw new HttpError(503, "Online payments are not enabled.", { code: "PAYMENTS_DISABLED" });
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "orderId, paymentId and signature are required.");
  const { orderId, paymentId, signature, method } = parsed.data;

  const { data: order, error } = await getSupabase().from("payment_orders").select("*").eq("provider_order_id", orderId).maybeSingle();
  if (error) throw error;
  if (!order || order.created_by !== req.user.id) throw new HttpError(404, "Order not found.");
  if (!verifyCheckoutSignature({ orderId, paymentId, signature })) throw new HttpError(400, "Payment signature could not be verified.");

  await settle(orderId, paymentId, method);
  res.json({ ok: true, kind: order.kind, subjectId: order.subject_id });
});

// Razorpay → server confirmation (covers the browser closing before /verify runs).
// Mounted with a raw-body parser because the signature covers the exact bytes.
export const paymentWebhook = Router();
paymentWebhook.post("/payments/webhook", express.raw({ type: "application/json", limit: "1mb" }), async (req, res) => {
  const raw = req.body instanceof Buffer ? req.body : Buffer.from("");
  if (!verifyWebhookSignature(raw, req.headers["x-razorpay-signature"])) return res.status(400).json({ error: "Bad signature" });
  const event = JSON.parse(raw.toString("utf8"));
  const payment = event?.payload?.payment?.entity;
  if (event.event === "payment.captured" && payment?.order_id) {
    await settle(payment.order_id, payment.id, payment.method);
  }
  res.json({ ok: true });
});

router.get("/payments/history", requireAuth, async (req, res) => {
  const { data, error } = await getSupabase()
    .from("payment_orders")
    .select("id, kind, subject_id, amount_paise, currency, status, method, paid_at, created_at")
    .eq("created_by", req.user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  res.json(data);
});

export default router;
