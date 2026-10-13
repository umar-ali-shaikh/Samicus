import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { apiClient } from "@/server/apiClient";
import { getPaymentsConfigAction } from "@/server/paymentsActions";
import type { ServiceListItemDto } from "@vidhira/contracts";
import { Button } from "@/components/ui";
import { ServiceOrderClient } from "./ServiceOrderClient";

export async function generateMetadata({ params }: { params: Promise<{ serviceId: string }> }): Promise<Metadata> {
  const { serviceId } = await params;
  const services = await apiClient.get<ServiceListItemDto[]>("/services");
  const service = services.find((s) => s.id === serviceId);
  return { title: service ? `${service.name} — Vidhira` : "Service — Vidhira", robots: { index: false, follow: false } };
}

// Ported from frontend/src/modals/ServiceModal.jsx. There is no GET /services/:id (the
// catalogue is small and always fetched as a list), so this filters the list server-side.
export default async function ServiceDetailPage({ params }: { params: Promise<{ serviceId: string }> }) {
  const { serviceId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  const [services, paymentsConfig] = await Promise.all([apiClient.get<ServiceListItemDto[]>("/services"), getPaymentsConfigAction()]);
  const service = services.find((s) => s.id === serviceId);
  if (!service) notFound();

  const user = { full_name: data.user.user_metadata?.full_name as string | undefined, email: data.user.email };

  return (
    <div style={{ padding: 24, maxWidth: 560, display: "flex", flexDirection: "column", gap: 16 }}>
      <Link href="/services" style={{ textDecoration: "none" }}>
        <Button variant="ghost" style={{ width: "auto" }}>
          ← Services
        </Button>
      </Link>
      <div>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--color-label)" }}>{service.category.toUpperCase()}</div>
        <h1 style={{ fontFamily: "var(--font-serif)", margin: "4px 0 0" }}>{service.name}</h1>
      </div>
      <ServiceOrderClient service={service} paymentsEnabled={paymentsConfig.enabled} user={user} />
    </div>
  );
}
