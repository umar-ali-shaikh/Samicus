import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { apiClient } from "@/server/apiClient";
import type { DraftListItemDto } from "@vidhira/contracts";
import { Card, Badge, Button, EmptyState } from "@/components/ui";

export const metadata: Metadata = {
  title: "Drafts — Vidhira",
  robots: { index: false, follow: false },
};

// Ported from frontend/src/screens/Draft.jsx's default view (recent drafts list). The
// template picker that used to share this screen is now its own route, /drafts/new, so both
// halves of the original screen are deep-linkable per docs/MASTER-PROMPT.md's target_structure.
export default async function DraftsPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  const drafts = await apiClient.get<DraftListItemDto[]>("/drafts");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 24, maxWidth: 720 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-serif)", margin: 0 }}>Draft a document</h1>
          <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
            Pick a template, fill in your details and choose clauses. Every clause says whom it favours. Drafts are free; advocate review is optional.
          </p>
        </div>
        <Link href="/drafts/new" style={{ textDecoration: "none" }}>
          <Button style={{ width: "auto" }}>New draft</Button>
        </Link>
      </div>

      {drafts.length === 0 ? (
        <EmptyState title="No drafts yet" body="Start a new draft from a template." />
      ) : (
        <div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Your recent drafts</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {drafts.map((d) => (
              <Link key={d.id} href={`/drafts/${d.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                <Card style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                  <span>{d.template?.name}</span>
                  <Badge>{d.status.replace("_", " ")}</Badge>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
