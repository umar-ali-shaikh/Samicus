import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { ApiError } from "@/server/apiClient";
import { getAnalyticsTabAction } from "@/server/founderActions";
import { FOUNDER_TABS, type FounderTab } from "@vidhira/contracts";
import { Callout } from "@/components/ui";
import { FounderTabView } from "../FounderTabView";

export const metadata: Metadata = {
  title: "Command Centre — Vidhira",
  robots: { index: false, follow: false },
};

// Ported from frontend/src/screens/CommandCentre.jsx -- one route per remaining FOUNDER_TABS
// entry (fdemand/fservices/ffunnel/frevenue/fcorp/fadv/fai/fcomplaints), per
// docs/MASTER-PROMPT.md's "founder/<one segment per existing FOUNDER_TABS entry>".
export default async function FounderTabPage({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  if (tab === "founder" || !FOUNDER_TABS.includes(tab as FounderTab)) notFound();

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  try {
    const response = await getAnalyticsTabAction(tab as FounderTab);
    return <FounderTabView response={response} />;
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      return (
        <div style={{ padding: 24, maxWidth: 700 }}>
          <Callout tone="warning">Only the founder account can see the Command Centre.</Callout>
        </div>
      );
    }
    throw err;
  }
}
