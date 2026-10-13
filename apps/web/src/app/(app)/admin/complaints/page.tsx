import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { getComplaintsReportAction } from "@/server/complaintsActions";
import { ComplaintsListClient } from "./ComplaintsListClient";

export const metadata: Metadata = {
  title: "Complaints — Vidhira",
  robots: { index: false, follow: false },
};

// Ported from frontend/src/screens/ComplaintsDesk.jsx.
export default async function AdminComplaintsPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  const report = await getComplaintsReportAction();

  return (
    <div style={{ padding: 24, maxWidth: 900, display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-serif)", margin: 0 }}>Complaints</h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Triage, own and close every complaint — with the root cause and the corrective action recorded.</p>
      </div>
      <ComplaintsListClient initialComplaints={report.complaints} kpis={report.kpis} />
    </div>
  );
}
