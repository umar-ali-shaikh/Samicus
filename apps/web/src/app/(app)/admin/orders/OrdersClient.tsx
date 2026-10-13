"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdminServiceOrderDto, DirectoryItemDto } from "@vidhira/contracts";
import { Card, Badge, Select, Callout, EmptyState } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { assignServiceOrderAction } from "@/server/servicesAdminActions";

function OrderRow({ o, advocates }: { o: AdminServiceOrderDto; advocates: DirectoryItemDto[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  function assign(advocateId: string) {
    if (!advocateId) return;
    setError(undefined);
    startTransition(async () => {
      const result = await assignServiceOrderAction(o.id, { advocateId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card style={{ padding: 16, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
      <div>
        <div style={{ fontWeight: 600 }}>{o.service?.name}</div>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          {o.account?.display_name.replace(/\s*\([0-9a-f]{6}\)$/, "")} · {fmtDate(o.created_at)}
        </div>
        {o.notes && <div style={{ fontSize: 12 }}>{o.notes}</div>}
        {error && <Callout tone="danger">{error}</Callout>}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Badge tone={o.paid_at ? "success" : "warning"}>{o.paid_at ? "paid" : "unpaid"}</Badge>
        <Badge>{o.status.replace("_", " ")}</Badge>
        {o.advocate ? (
          <span style={{ fontSize: 12.5 }}>Adv. {o.advocate.user?.full_name}</span>
        ) : (
          <Select
            value=""
            onChange={(e) => assign(e.target.value)}
            disabled={isPending}
            placeholder="Assign advocate…"
            options={advocates.map((a) => [a.id, `Adv. ${a.user?.full_name} · ${a.practice_areas.map((p) => p.name).join(", ")}`])}
          />
        )}
      </div>
    </Card>
  );
}

// Ported from frontend/src/screens/ServiceOrders.jsx.
export function OrdersClient({ orders, advocates }: { orders: AdminServiceOrderDto[]; advocates: DirectoryItemDto[] }) {
  if (orders.length === 0) {
    return <EmptyState title="No orders yet" body="Orders placed from the Services page appear here." />;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {orders.map((o) => (
        <OrderRow key={o.id} o={o} advocates={advocates} />
      ))}
    </div>
  );
}
