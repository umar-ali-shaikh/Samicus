"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ServiceListItemDto } from "@vidhira/contracts";
import { Button, Card, Callout } from "@/components/ui";
import { inr } from "@/lib/format";
import { createServiceOrderAction } from "@/server/serviceOrdersActions";
import { payFor } from "@/lib/payments";

// Ported from frontend/src/modals/ServiceModal.jsx -- a real route per docs/MASTER-PROMPT.md's
// url_and_routing_rules ("guide and service modals become real routes").
export function ServiceOrderClient({
  service,
  paymentsEnabled,
  user,
}: {
  service: ServiceListItemDto;
  paymentsEnabled: boolean;
  user: { full_name?: string; email?: string | null };
}) {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const total = service.fees.total + service.gov;

  function order() {
    setError(undefined);
    startTransition(async () => {
      const result = await createServiceOrderAction(service.id, {});
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (paymentsEnabled) {
        try {
          const paid = await payFor("service_order", result.order.id, { user, description: service.name });
          if (!paid) setError("Payment window closed — your request is saved; you can pay from Services later.");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Payment failed.");
        }
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Callout tone="success">
          {paymentsEnabled
            ? "Thanks — once payment clears, our team assigns a verified advocate and you'll hear from them here."
            : "Our team will assign a verified advocate and contact you. Online payment is not enabled on this deployment, so the fee is settled directly."}
        </Callout>
        <Button onClick={() => router.push("/matters")} style={{ width: "auto" }}>
          Go to my matters
        </Button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && <Callout tone="danger">{error}</Callout>}
      <div>{service.description}</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Card style={{ flex: "1 1 100px", padding: 14, textAlign: "center" }}>
          <div style={{ fontSize: 10, color: "var(--color-label)" }}>PROFESSIONAL FEE</div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 20 }}>{inr(service.professional_fee)}</div>
        </Card>
        <Card style={{ flex: "1 1 100px", padding: 14, textAlign: "center" }}>
          <div style={{ fontSize: 10, color: "var(--color-label)" }}>GOVERNMENT CHARGES</div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 20 }}>{inr(service.gov)}</div>
        </Card>
        {service.timeline_days && (
          <Card style={{ flex: "1 1 100px", padding: 14, textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "var(--color-label)" }}>TIMELINE</div>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 20 }}>{service.timeline_days}d</div>
          </Card>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, fontSize: 12.5 }}>
        {([
          ["Includes", service.includes],
          ["Documents required", service.required_documents],
          ["Deliverables", service.deliverables],
        ] as const)
          .filter(([, l]) => l.length)
          .map(([h, l]) => (
            <div key={h}>
              <strong>{h}</strong>
              <ul style={{ paddingLeft: 18 }}>
                {l.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          ))}
      </div>
      <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={{ padding: "5px 0" }}>Professional fee</td>
            <td style={{ textAlign: "right" }}>{inr(service.fees.professionalFee)}</td>
          </tr>
          <tr>
            <td style={{ padding: "5px 0" }}>Platform fee</td>
            <td style={{ textAlign: "right" }}>{inr(service.fees.platformFee)}</td>
          </tr>
          <tr>
            <td style={{ padding: "5px 0" }}>GST (18% on fee + platform fee)</td>
            <td style={{ textAlign: "right" }}>{inr(service.fees.gst)}</td>
          </tr>
          <tr>
            <td style={{ padding: "5px 0" }}>Government charges</td>
            <td style={{ textAlign: "right" }}>{inr(service.gov)}</td>
          </tr>
          <tr style={{ borderTop: "1px solid var(--color-border)", fontWeight: 700 }}>
            <td style={{ padding: "8px 0" }}>Total</td>
            <td style={{ textAlign: "right" }}>{inr(total)}</td>
          </tr>
        </tbody>
      </table>
      <Button onClick={order} disabled={isPending} style={{ width: "auto" }}>
        {isPending ? "Working…" : paymentsEnabled ? `Start & pay ${inr(total)}` : "Request this service"}
      </Button>
      {!paymentsEnabled && <div style={{ fontSize: 11.5, color: "var(--color-label)" }}>Online payments aren&apos;t enabled on this deployment — no charge is taken here.</div>}
    </div>
  );
}
