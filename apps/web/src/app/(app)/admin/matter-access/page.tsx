import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { listMatterAccessLogAction } from "@/server/adminMatterAccessActions";
import { Card, Badge, EmptyState } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { MatterAccessClient } from "./MatterAccessClient";

export const metadata: Metadata = {
  title: "Matter access — Vidhira",
  robots: { index: false, follow: false },
};

// Break-glass matter access (admin_access_grants). Opening a matter is admin-only and needs a
// recorded reason; the log below is readable by admin and founder. Role gating is Express's
// own (modules/admin/router.ts), same precedent as ../verification/page.tsx.
export default async function MatterAccessPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  const log = await listMatterAccessLogAction();

  return (
    <div style={{ padding: 24, maxWidth: 900, display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-serif)", margin: 0 }}>Matter access</h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
          Admins can&apos;t see a matter&apos;s contents by default. To investigate one (for example, a complaint), record why — every attempt is logged here,
          and the client and advocate see a notice on the matter&apos;s timeline. Fees, invoices, messages and document downloads are never shown.
        </p>
      </div>

      <MatterAccessClient />

      <div>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 17, marginBottom: 10 }}>Access log</div>
        {log.length === 0 ? (
          <EmptyState title="No access recorded" body="Every matter an admin opens, or tries to open, appears here." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {log.map((g) => (
              <Card key={g.id} style={{ padding: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>
                    {g.matter ? `${g.matter.reference} · ${g.matter.title}` : "Matter removed"}
                  </div>
                  <Badge tone={g.outcome === "recorded" ? "success" : "danger"}>{g.outcome === "recorded" ? "Opened" : "Refused"}</Badge>
                </div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  {g.actor?.full_name || g.actor?.email || "Unknown admin"} · {fmtDateTime(g.created_at)}
                </div>
                <div style={{ fontSize: 13 }}>{g.reason || "(no reason given)"}</div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
