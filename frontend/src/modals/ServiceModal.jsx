import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useUI } from "../state/UIState";
import { useConfig, useMut } from "../api/hooks";
import { api } from "../lib/api";
import { payFor } from "../lib/payments";
import { inr } from "../lib/format";
import { ModalShell } from "../components/Modal";
import { Button, Card, Callout } from "../components/ui";

export function ServiceModal({ service }) {
  const { user, activeAccount } = useAuth();
  const { closeModal, showToast, go } = useUI();
  const config = useConfig();
  const [done, setDone] = useState(false);
  const fees = service.fees;
  const total = fees.total + service.gov;
  const paymentsOn = config.data?.payments?.enabled;

  const order = useMut(async () => {
    const created = await api.post(`/services/${service.id}/orders`, { accountId: activeAccount?.id });
    if (paymentsOn) {
      const paid = await payFor("service_order", created.id, { user, description: service.name });
      if (!paid) showToast("Payment window closed — your request is saved; you can pay from Services later.");
    }
    return created;
  }, { invalidate: ["/service-orders"], onSuccess: () => setDone(true) });

  return (
    <ModalShell kicker={service.category} title={service.name} onClose={closeModal} width={560}>
      {done ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Callout tone="success" title="Request received">
            {paymentsOn ? "Thanks — once payment clears, our team assigns a verified advocate and you'll hear from them here." : "Our team will assign a verified advocate and contact you. Online payment is not enabled on this deployment, so the fee is settled directly."}
          </Callout>
          <Button onClick={() => { closeModal(); go("matters"); }}>Go to my matters</Button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>{service.description}</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Card style={{ flex: "1 1 100px", textAlign: "center" }}><div style={{ fontSize: 10, color: "var(--color-label)" }}>PROFESSIONAL FEE</div><div style={{ fontFamily: "var(--font-serif)", fontSize: 20 }}>{inr(service.professional_fee)}</div></Card>
            <Card style={{ flex: "1 1 100px", textAlign: "center" }}><div style={{ fontSize: 10, color: "var(--color-label)" }}>GOVERNMENT CHARGES</div><div style={{ fontFamily: "var(--font-serif)", fontSize: 20 }}>{inr(service.gov)}</div></Card>
            {service.timeline_days && <Card style={{ flex: "1 1 100px", textAlign: "center" }}><div style={{ fontSize: 10, color: "var(--color-label)" }}>TIMELINE</div><div style={{ fontFamily: "var(--font-serif)", fontSize: 20 }}>{service.timeline_days}d</div></Card>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, fontSize: 12.5 }}>
            {[["Includes", service.includes], ["Documents required", service.required_documents], ["Deliverables", service.deliverables]].filter(([, l]) => l?.length).map(([h, l]) => (
              <div key={h}><strong>{h}</strong><ul style={{ paddingLeft: 18 }}>{l.map((i) => <li key={i}>{i}</li>)}</ul></div>
            ))}
          </div>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <tbody>
              <tr><td style={{ padding: "5px 0" }}>Professional fee</td><td style={{ textAlign: "right" }}>{inr(fees.fee)}</td></tr>
              <tr><td style={{ padding: "5px 0" }}>Platform fee</td><td style={{ textAlign: "right" }}>{inr(fees.platformFee)}</td></tr>
              <tr><td style={{ padding: "5px 0" }}>GST (18% on fee + platform fee)</td><td style={{ textAlign: "right" }}>{inr(fees.gst)}</td></tr>
              <tr><td style={{ padding: "5px 0" }}>Government charges</td><td style={{ textAlign: "right" }}>{inr(service.gov)}</td></tr>
              <tr style={{ borderTop: "1px solid var(--color-border)", fontWeight: 700 }}><td style={{ padding: "8px 0" }}>Total</td><td style={{ textAlign: "right" }}>{inr(total)}</td></tr>
            </tbody>
          </table>
          <Button onClick={() => order.mutate()} disabled={order.isPending || !activeAccount}>{order.isPending ? "Working…" : paymentsOn ? `Start & pay ${inr(total)}` : "Request this service"}</Button>
          {!paymentsOn && !config.isPending && <div style={{ fontSize: 11.5, color: "var(--color-label)" }}>Online payments aren't enabled on this deployment — no charge is taken here.</div>}
        </div>
      )}
    </ModalShell>
  );
}
