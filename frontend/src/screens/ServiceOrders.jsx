import { useGet, useMut } from "../api/hooks";
import { api } from "../lib/api";
import { Card, Badge, QueryBoundary, EmptyState } from "../components/ui";
import { PageHeader } from "../components/PageHeader";
import { Select } from "../components/forms";
import { fmtDate } from "../lib/format";

function OrderRow({ o, advocates }) {
  const assign = useMut((advocateId) => api.post(`/admin/service-orders/${o.id}/assign`, { advocateId }), { invalidate: ["/admin"], success: "Assigned." });
  return (
    <Card style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
      <div>
        <div style={{ fontWeight: 600 }}>{o.service?.name}</div>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{o.account?.display_name?.replace(/\s*\([0-9a-f]{6}\)$/, "")} · {fmtDate(o.created_at)}</div>
        {o.notes && <div style={{ fontSize: 12 }}>{o.notes}</div>}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Badge tone={o.paid_at ? "success" : "warning"}>{o.paid_at ? "paid" : "unpaid"}</Badge>
        <Badge>{o.status.replace("_", " ")}</Badge>
        {o.advocate ? <span style={{ fontSize: 12.5 }}>Adv. {o.advocate.user?.full_name}</span> : (
          <Select value="" onChange={(e) => e.target.value && assign.mutate(e.target.value)} placeholder="Assign advocate…" options={advocates.map((a) => [a.id, `Adv. ${a.user?.full_name} · ${(a.practice_areas || []).map((p) => p.name).join(", ")}`])} />
        )}
      </div>
    </Card>
  );
}

export function ServiceOrders() {
  const orders = useGet("/admin/service-orders", undefined, { refetchInterval: 30000 });
  const advocates = useGet("/advocates");
  return (
    <div style={{ maxWidth: 900, display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader title="Service orders" subtitle="Fixed-fee orders waiting for an advocate. Assigning one marks the order in progress." />
      <QueryBoundary query={orders} empty={<EmptyState title="No orders yet" body="Orders placed from the Services page appear here." />}>
        {(list) => list.map((o) => <OrderRow key={o.id} o={o} advocates={advocates.data || []} />)}
      </QueryBoundary>
    </div>
  );
}
