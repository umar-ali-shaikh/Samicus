import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { verifyCheckoutSignature, verifyWebhookSignature, paymentsEnabled, publicPaymentConfig } from "./razorpay.js";

test("payments are disabled without keys and never leak the secret", () => {
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  assert.equal(paymentsEnabled(), false);
  assert.deepEqual(publicPaymentConfig(), { enabled: false });
  process.env.RAZORPAY_KEY_ID = "rzp_test_x";
  process.env.RAZORPAY_KEY_SECRET = "secret";
  assert.deepEqual(publicPaymentConfig(), { enabled: true, provider: "razorpay", keyId: "rzp_test_x" });
});

test("checkout signature must match HMAC(order|payment)", () => {
  process.env.RAZORPAY_KEY_SECRET = "secret";
  const good = crypto.createHmac("sha256", "secret").update("order_1|pay_1").digest("hex");
  assert.equal(verifyCheckoutSignature({ orderId: "order_1", paymentId: "pay_1", signature: good }), true);
  assert.equal(verifyCheckoutSignature({ orderId: "order_1", paymentId: "pay_2", signature: good }), false);
  assert.equal(verifyCheckoutSignature({ orderId: "order_1", paymentId: "pay_1", signature: "short" }), false);
});

test("webhook signature is checked over the raw body", () => {
  process.env.RAZORPAY_WEBHOOK_SECRET = "whsec";
  const body = Buffer.from('{"event":"payment.captured"}');
  const sig = crypto.createHmac("sha256", "whsec").update(body).digest("hex");
  assert.equal(verifyWebhookSignature(body, sig), true);
  assert.equal(verifyWebhookSignature(Buffer.from('{"event":"x"}'), sig), false);
  assert.equal(verifyWebhookSignature(body, undefined), false);
});
