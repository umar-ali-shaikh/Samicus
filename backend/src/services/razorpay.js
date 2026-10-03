// Minimal Razorpay client (Orders API + signature verification) — no SDK dependency.
// Razorpay charges per transaction only (no monthly fee), which suits this budget.
import crypto from "crypto";

const API = "https://api.razorpay.com/v1";

export function paymentsEnabled() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export function publicPaymentConfig() {
  return paymentsEnabled() ? { enabled: true, provider: "razorpay", keyId: process.env.RAZORPAY_KEY_ID } : { enabled: false };
}

export async function createRazorpayOrder({ amountPaise, receipt, notes }) {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const res = await fetch(`${API}/orders`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt: receipt.slice(0, 40), notes }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.error?.description || `Razorpay error ${res.status}`);
    err.status = 502;
    err.expose = true;
    throw err;
  }
  return body;
}

function safeEqualHex(a, b) {
  const x = Buffer.from(String(a), "utf8");
  const y = Buffer.from(String(b), "utf8");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function verifyCheckoutSignature({ orderId, paymentId, signature }) {
  const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqualHex(expected, signature);
}

export function verifyWebhookSignature(rawBody, signature) {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET || !signature) return false;
  const expected = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}
