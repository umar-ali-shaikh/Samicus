import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { getAdminStatsAction, listVerificationCasesAction } from "@/server/adminVerificationActions";
import { Card } from "@/components/ui";
import { VerificationQueueClient } from "./VerificationQueueClient";

export const metadata: Metadata = {
  title: "Verification & trust operations — Vidhira",
  robots: { index: false, follow: false },
};

// Ported from frontend/src/screens/AdminQueue.jsx. Role gating relies on Express's
// requireRole("admin", "founder") on the whole /admin/* surface (modules/admin/router.ts),
// same precedent as lawyer/page.tsx's comment on the proxy.ts role-gate no-op.
export default async function AdminVerificationPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  const [stats, cases] = await Promise.all([getAdminStatsAction(), listVerificationCasesAction()]);

  const tiles: Array<[string, number]> = [
    ["Pending verification", stats.pendingVerification],
    ["Verified advocates", stats.verifiedAdvocates],
    ["Awaiting moderation", stats.pendingModeration],
    ["Conflict flags (30d)", stats.conflictFlags30d],
    ["Open complaints", stats.openComplaints],
    ["Unassigned paid orders", stats.unassignedServiceOrders],
  ];

  return (
    <div style={{ padding: 24, maxWidth: 900, display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-serif)", margin: 0 }}>Verification &amp; trust operations</h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Admins never see matter contents.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        {tiles.map(([label, value]) => (
          <Card key={label} style={{ padding: 14 }}>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 20 }}>{value}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{label}</div>
          </Card>
        ))}
      </div>
      <VerificationQueueClient initialCases={cases} />
    </div>
  );
}
