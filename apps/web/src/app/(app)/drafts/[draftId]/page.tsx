import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { apiClient } from "@/server/apiClient";
import { getPaymentsConfigAction } from "@/server/paymentsActions";
import type { DirectoryItemDto, DocTemplateDetailDto, DocumentDraftDto } from "@vidhira/contracts";
import { DraftEditorClient } from "./DraftEditorClient";

export const metadata: Metadata = {
  title: "Draft a document — Vidhira",
  robots: { index: false, follow: false },
};

// Ported from frontend/src/screens/Draft.jsx's Editor (steps "Your details" / "Special
// clauses" / "Review & issue" -- "Template" is now its own route, /drafts/new).
export default async function DraftEditorPage({ params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  const draft = await apiClient.get<DocumentDraftDto>(`/drafts/${draftId}`);
  const [{ template, clauses }, advocates, paymentsConfig] = await Promise.all([
    apiClient.get<DocTemplateDetailDto>(`/doc-templates/${draft.template_id}`),
    apiClient.get<DirectoryItemDto[]>("/advocates"),
    getPaymentsConfigAction(),
  ]);

  const user = { full_name: data.user.user_metadata?.full_name as string | undefined, email: data.user.email };

  return (
    <DraftEditorClient draft={draft} template={template} clauses={clauses} advocates={advocates} paymentsEnabled={paymentsConfig.enabled} user={user} />
  );
}
