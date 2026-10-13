import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { apiClient } from "@/server/apiClient";
import { getPaymentsConfigAction } from "@/server/paymentsActions";
import type { ServiceListItemDto, ServiceOrderDto } from "@vidhira/contracts";
import { Card, Badge, Button, EmptyState } from "@/components/ui";
import { inr, fmtDate } from "@/lib/format";
import { PayOrderButton } from "./PayOrderButton";

export const metadata: Metadata = {
  title: "Fixed-fee services — Vidhira",
  robots: { index: false, follow: false },
};

// Ported from frontend/src/screens/Services.jsx.
export default async function ServicesPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  const [services, orders, paymentsConfig] = await Promise.all([
    apiClient.get<ServiceListItemDto[]>("/services"),
    apiClient.get<ServiceOrderDto[]>("/service-orders"),
    getPaymentsConfigAction(),
  ]);
  const user = { full_name: data.user.user_metadata?.full_name as string | undefined, email: data.user.email };

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-serif)", margin: 0 }}>Fixed-fee legal services</h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
          Professional fee and government charges are always disclosed separately. No outcome guarantees.
        </p>
      </div>

      {services.length === 0 ? (
        <EmptyState title="No services published yet" body="Fixed-fee services will appear here once the catalogue is set up." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          {services.map((s) => (
            <Link key={s.id} href={`/services/${s.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <Card style={{ padding: 16, cursor: "pointer", display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
                <div>
                  <Badge>{s.category}</Badge>
                </div>
                <div style={{ fontWeight: 700 }}>{s.name}</div>
                <div style={{ fontSize: 12.5, color: "var(--color-text-muted)", flex: 1 }}>{s.description}</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span>
                    {inr(s.professional_fee)}
                    {s.gov ? ` + ${inr(s.gov)} govt` : ""}
                  </span>
                  {s.timeline_days && <span style={{ color: "var(--color-text-muted)" }}>{s.timeline_days} day{s.timeline_days === 1 ? "" : "s"}</span>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {orders.length > 0 && (
        <div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 17, marginBottom: 10 }}>Your orders</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {orders.map((o) => (
              <Card key={o.id} style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{o.service?.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>Requested {fmtDate(o.created_at)}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Badge tone={o.status === "delivered" ? "success" : o.status === "in_progress" ? "info" : "neutral"}>{o.status.replace("_", " ")}</Badge>
                  {o.paid_at ? (
                    <Badge tone="success">paid</Badge>
                  ) : (
                    paymentsConfig.enabled && <PayOrderButton orderId={o.id} serviceName={o.service?.name ?? "Service"} user={user} />
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
