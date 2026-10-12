import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { apiClient } from "@/server/apiClient";
import type { AccountDto, ContractReviewListItemDto, DocTemplateListItemDto } from "@vidhira/contracts";
import { Card, Callout } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { ReviewUploadClient } from "./ReviewUploadClient";

export const metadata: Metadata = {
  title: "Contract review — Vidhira",
  robots: { index: false, follow: false },
};

// Ported from frontend/src/screens/Review.jsx's default (no review open) view.
export default async function ContractReviewPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  const [templates, past, accounts, config] = await Promise.all([
    apiClient.get<DocTemplateListItemDto[]>("/doc-templates"),
    apiClient.get<ContractReviewListItemDto[]>("/contract-reviews"),
    apiClient.get<AccountDto[]>("/accounts"),
    apiClient.get<{ research: { enabled: boolean } }>("/config"),
  ]);
  const defaultAccount = accounts.find((a) => a.myRole === "owner") ?? accounts[0] ?? null;
  const disabled = !config.research.enabled;

  return (
    <div style={{ padding: 24, maxWidth: 820, display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-serif)", margin: 0 }}>Contract review</h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
          Upload a contract and see how each clause compares with a balanced baseline from our clause library. This is not a legal opinion.
        </p>
      </div>

      {disabled && (
        <Callout tone="warning">
          <strong>Not enabled on this deployment.</strong> Contract review needs the knowledge base (Qdrant + OpenRouter embeddings) to be configured.
        </Callout>
      )}

      <ReviewUploadClient templates={templates} accountId={defaultAccount?.id ?? null} disabled={disabled} />

      <div>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Your previous reviews</div>
        {past.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>Nothing yet.</div>
        ) : (
          past.map((r) => (
            <Link key={r.id} href={`/contract-review/${r.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <Card style={{ marginBottom: 8, padding: 12, display: "flex", justifyContent: "space-between", cursor: "pointer" }}>
                <span>
                  {r.document?.filename} <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>· {r.contract_type}</span>
                </span>
                <span style={{ fontSize: 12 }}>{fmtDate(r.created_at)}</span>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
