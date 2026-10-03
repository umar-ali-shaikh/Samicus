import { useUI } from "../state/UIState";
import { useGet, useConfig, useMut } from "../api/hooks";
import { useAuth } from "../auth/AuthProvider";
import { payFor } from "../lib/payments";
import { Card, Badge, Button, QueryBoundary, EmptyState } from "../components/ui";
import { PageHeader } from "../components/PageHeader";
import { inr, fmtDate } from "../lib/format";

function MyOrders() {
  const { user } = useAuth();
  const config = useConfig();
  const orders = useGet("/service-orders");
  const pay = useMut((o) => payFor("service_order", o.id, { user, description: o.service.name }), { invalidate: ["/service-orders"], success: (ok) => (ok ? "Payment received." : "") });
  if (!orders.data?.length) return null;
  return (
    <div>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 17, marginBottom: 10 }}>Your orders</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {orders.data.map((o) => (
          <Card key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div><div style={{ fontWeight: 600 }}>{o.service.name}</div><div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>Requested {fmtDate(o.created_at)}</div></div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Badge tone={o.status === "delivered" ? "success" : o.status === "in_progress" ? "info" : "neutral"}>{o.status.replace("_", " ")}</Badge>
              {o.paid_at ? <Badge tone="success">paid</Badge> : config.data?.payments?.enabled && <Button onClick={() => pay.mutate(o)} disabled={pay.isPending}>Pay now</Button>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function Services() {
  const { openModal } = useUI();
  const services = useGet("/services");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader title="Fixed-fee legal services" subtitle="Professional fee and government charges are always disclosed separately. No outcome guarantees." />
      <QueryBoundary query={services} empty={<EmptyState title="No services published yet" body="Fixed-fee services will appear here once the catalogue is set up." />}>
        {(list) => (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            {list.map((s) => (
              <Card key={s.id} style={{ cursor: "pointer", display: "flex", flexDirection: "column", gap: 8 }} onClick={() => openModal("service", { service: s })}>
                <div><Badge>{s.category}</Badge></div>
                <div style={{ fontWeight: 700 }}>{s.name}</div>
                <div style={{ fontSize: 12.5, color: "var(--color-text-muted)", flex: 1 }}>{s.description}</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span>{inr(s.professional_fee)}{s.gov ? ` + ${inr(s.gov)} govt` : ""}</span>
                  {s.timeline_days && <span style={{ color: "var(--color-text-muted)" }}>{s.timeline_days} day{s.timeline_days === 1 ? "" : "s"}</span>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </QueryBoundary>
      <MyOrders />
    </div>
  );
}
