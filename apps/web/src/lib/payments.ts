// Client-side Razorpay checkout trigger. Ported from frontend/src/lib/payments.js -- same
// flow (load checkout.js, create an order, open the modal, verify server-side on success) --
// now calling Server Actions instead of a REST client directly (the browser never calls
// Express directly, per docs/architecture/01-target-architecture.md section 2).
import { createPaymentIntentAction, verifyPaymentAction } from "@/server/paymentsActions";
import type { PAYMENT_KINDS } from "@vidhira/contracts";

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

interface RazorpayOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  prefill?: { name?: string; email?: string };
  theme?: { color: string };
  handler: (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void;
  modal?: { ondismiss: () => void };
}

interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: (r: { error?: { description?: string } }) => void) => void;
}

let scriptPromise: Promise<void> | null = null;
function loadCheckout(): Promise<void> {
  scriptPromise ||= new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("Couldn't load the payment window. Check your connection."));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/**
 * Opens Razorpay checkout for a payable record and verifies the result on the server.
 * Resolves true when paid, false when the user dismissed the window. Throws on errors.
 */
export async function payFor(
  kind: (typeof PAYMENT_KINDS)[number],
  id: string,
  { user, description }: { user?: { full_name?: string | null; email?: string | null }; description?: string },
): Promise<boolean> {
  const intentResult = await createPaymentIntentAction({ kind, id });
  if (!intentResult.ok) throw new Error(intentResult.error);
  const intent = intentResult.intent;
  if (!intent.keyId) throw new Error("Payments are not configured on this deployment.");

  await loadCheckout();
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: intent.keyId!,
      order_id: intent.orderId,
      amount: intent.amountPaise,
      currency: intent.currency,
      name: "Vidhira",
      description,
      prefill: { name: user?.full_name ?? undefined, email: user?.email ?? undefined },
      theme: { color: "#101A2C" },
      handler: (resp) => {
        (async () => {
          try {
            const verifyResult = await verifyPaymentAction({
              orderId: resp.razorpay_order_id,
              paymentId: resp.razorpay_payment_id,
              signature: resp.razorpay_signature,
            });
            if (!verifyResult.ok) throw new Error(verifyResult.error);
            resolve(true);
          } catch (err) {
            reject(err instanceof Error ? err : new Error("Payment verification failed."));
          }
        })();
      },
      modal: { ondismiss: () => resolve(false) },
    });
    rzp.on("payment.failed", (r) => reject(new Error(r?.error?.description || "Payment failed.")));
    rzp.open();
  });
}
