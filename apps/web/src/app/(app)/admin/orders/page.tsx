import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { apiClient } from "@/server/apiClient";
import { getAdminServiceOrdersAction } from "@/server/servicesAdminActions";
import type { DirectoryItemDto } from "@vidhira/contracts";
import { OrdersClient } from "./OrdersClient";

export const metadata: Metadata = {
  title: "Service orders — Vidhira",
  robots: { index: false, follow: false },
};

// Ported from frontend/src/screens/ServiceOrders.jsx.
export default async function AdminOrdersPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  const [orders, advocates] = await Promise.all([getAdminServiceOrdersAction(), apiClient.get<DirectoryItemDto[]>("/advocates")]);

  return (
    <div style={{ padding: 24, maxWidth: 900, display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-serif)", margin: 0 }}>Service orders</h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Fixed-fee orders waiting for an advocate. Assigning one marks the order in progress.</p>
      </div>
      <OrdersClient orders={orders} advocates={advocates} />
    </div>
  );
}
