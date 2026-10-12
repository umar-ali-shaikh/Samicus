import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { apiClient } from "@/server/apiClient";
import type { DocTemplateListItemDto } from "@vidhira/contracts";
import { EmptyState } from "@/components/ui";
import { TemplatePickerClient } from "./TemplatePickerClient";

export const metadata: Metadata = {
  title: "New draft — Vidhira",
  robots: { index: false, follow: false },
};

// Ported from frontend/src/screens/Draft.jsx's "Template" step, split into its own route
// per docs/MASTER-PROMPT.md's target_structure (drafts/new/).
export default async function NewDraftPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  const templates = await apiClient.get<DocTemplateListItemDto[]>("/doc-templates");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 24, maxWidth: 720 }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-serif)", margin: 0 }}>Draft a document</h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
          Pick a template, fill in your details and choose clauses. Every clause says whom it favours. Drafts are free; advocate review is optional.
        </p>
      </div>
      {templates.length === 0 ? (
        <EmptyState title="No templates yet" body="Document templates will appear here once they're published." />
      ) : (
        <TemplatePickerClient templates={templates} />
      )}
    </div>
  );
}
