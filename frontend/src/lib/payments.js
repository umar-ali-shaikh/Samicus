import { api } from "./api";

let scriptPromise;
function loadCheckout() {
  scriptPromise ||= new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = resolve;
    s.onerror = () => { scriptPromise = null; reject(new Error("Couldn't load the payment window. Check your connection.")); };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/**
 * Opens Razorpay checkout for a payable record and verifies the result on the server.
 * Resolves true when paid, false when the user dismissed the window. Throws on errors.
 * @param {"consultation"|"invoice"|"service_order"|"draft_review"} kind
 */
export async function payFor(kind, id, { user, description }) {
  await loadCheckout();
  const intent = await api.post("/payments/intents", { kind, id });
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: intent.keyId,
      order_id: intent.orderId,
      amount: intent.amountPaise,
      currency: intent.currency,
      name: "Samicus",
      description,
      prefill: { name: user?.full_name, email: user?.email },
      theme: { color: "#101A2C" },
      handler: async (resp) => {
        try {
          await api.post("/payments/verify", { orderId: resp.razorpay_order_id, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature });
          resolve(true);
        } catch (err) { reject(err); }
      },
      modal: { ondismiss: () => resolve(false) },
    });
    rzp.on("payment.failed", (r) => reject(new Error(r?.error?.description || "Payment failed.")));
    rzp.open();
  });
}
