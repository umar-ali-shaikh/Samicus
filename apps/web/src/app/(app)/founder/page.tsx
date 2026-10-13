import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { ApiError } from "@/server/apiClient";
import { getAnalyticsTabAction } from "@/server/founderActions";
import { Callout } from "@/components/ui";
import { FounderTabView } from "./FounderTabView";

export const metadata: Metadata = {
  title: "Command Centre — Vidhira",
  robots: { index: false, follow: false },
};

// Ported from frontend/src/screens/CommandCentre.jsx (the "founder" overview tab). Role
// gating relies on Express's requireRole("founder") (modules/founder/router.ts).
export default async function FounderCommandCentrePage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  try {
    const response = await getAnalyticsTabAction("founder");
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
