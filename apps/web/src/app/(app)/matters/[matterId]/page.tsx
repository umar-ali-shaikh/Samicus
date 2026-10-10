import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { apiClient, ApiError } from "@/server/apiClient";
import type { MatterDetailDto, MatterListItemDto } from "@vidhira/contracts";
import { getThreadsAction } from "@/server/messagesActions";
import { getPaymentsConfigAction } from "@/server/paymentsActions";
import { MatterDetailClient } from "./MatterDetailClient";

export async function generateMetadata({ params }: { params: Promise<{ matterId: string }> }): Promise<Metadata> {
  const { matterId } = await params;
  try {
    const detail = await apiClient.get<MatterDetailDto>(`/matters/${matterId}`);
    return { title: `${detail.matter.title} — Vidhira`, robots: { index: false, follow: false } };
  } catch {
    return { title: "Matter — Vidhira", robots: { index: false, follow: false } };
  }
}

export default async function MatterDetailPage({ params }: { params: Promise<{ matterId: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  const { matterId } = await params;
  let detail: MatterDetailDto;
  try {
    detail = await apiClient.get<MatterDetailDto>(`/matters/${matterId}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const allMatters = await apiClient.get<MatterListItemDto[]>("/matters");
  // Scope the pill bar to the same side as this matter's detail, so someone who is both an
  // advocate and a client elsewhere doesn't see their two roles' matters mixed in one list.
  const matters = detail.side === "viewer" ? allMatters : allMatters.filter((m) => m.mySide === detail.side);

  const threads = await getThreadsAction();
  const thread = threads.find((t) => t.matter?.reference === detail.matter.reference) ?? null;
  const paymentsConfig = await getPaymentsConfigAction();
  const user = { full_name: data.user.user_metadata?.full_name as string | undefined, email: data.user.email };

  return (
    <MatterDetailClient
      matters={matters}
      detail={detail}
      matterId={matterId}
      threadId={thread?.id ?? null}
      paymentsEnabled={paymentsConfig.enabled}
      user={user}
    />
  );
}
