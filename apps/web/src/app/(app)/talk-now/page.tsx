import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { apiClient } from "@/server/apiClient";
import type { SituationDto } from "@vidhira/contracts";
import { getPaymentsConfigAction } from "@/server/paymentsActions";
import { TalkNowClient } from "./TalkNowClient";

export const metadata: Metadata = {
  title: "Talk now — Vidhira",
  robots: { index: false, follow: false },
};

export default async function TalkNowPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  const [situations, paymentsConfig] = await Promise.all([apiClient.get<SituationDto[]>("/situations"), getPaymentsConfigAction()]);
  const user = { full_name: data.user.user_metadata?.full_name as string | undefined, email: data.user.email };

  return <TalkNowClient situations={situations} paymentsEnabled={paymentsConfig.enabled} user={user} />;
}
