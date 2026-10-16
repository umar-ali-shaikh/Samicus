import { env } from "@/server/env";

// Razorpay -> apps/api webhook pass-through, for deployments where apps/api has no public URL
// of its own (one-service mode, scripts/render-start.mjs). Point Razorpay's webhook at
// https://<web-host>/api/payments/webhook and this forwards it to apps/api over
// API_INTERNAL_URL. The body is forwarded byte-for-byte: Razorpay's x-razorpay-signature HMAC
// covers the exact raw bytes (see docs/architecture/02-security-model.md §5), so it is never
// parsed or re-serialized here. apps/api still does all verification.
export async function POST(request: Request): Promise<Response> {
  const body = await request.arrayBuffer();
  const headers: Record<string, string> = { "Content-Type": request.headers.get("content-type") ?? "application/json" };
  const signature = request.headers.get("x-razorpay-signature");
  if (signature) headers["x-razorpay-signature"] = signature;

  const upstream = await fetch(`${env.API_INTERNAL_URL}/api/payments/webhook`, { method: "POST", headers, body, cache: "no-store" });
  return new Response(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
  });
}
