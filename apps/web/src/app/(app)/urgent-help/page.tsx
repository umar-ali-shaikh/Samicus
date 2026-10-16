import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { apiClient } from "@/server/apiClient";
import type { SpecialisationDto } from "@vidhira/contracts";
import { getPaymentsConfigAction } from "@/server/paymentsActions";
import { UrgentHelpClient } from "./UrgentHelpClient";

export const metadata: Metadata = {
  title: "Urgent help — Vidhira",
  robots: { index: false, follow: false },
};

// Ported from the legacy frontend/src/modals/UrgentModal.jsx (a modal there; a page here, since
// apps/web has no modal layer). Uses the existing POST /urgent-requests endpoint.
export default async function UrgentHelpPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  const [areas, paymentsConfig] = await Promise.all([apiClient.get<SpecialisationDto[]>("/specialisations"), getPaymentsConfigAction()]);
  const user = { full_name: data.user.user_metadata?.full_name as string | undefined, email: data.user.email };

  return <UrgentHelpClient areas={areas.map((a) => ({ id: a.id, name: a.name }))} paymentsEnabled={paymentsConfig.enabled} user={user} />;
}
