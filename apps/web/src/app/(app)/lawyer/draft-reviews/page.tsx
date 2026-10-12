import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { apiClient, ApiError } from "@/server/apiClient";
import type { AdvocateDraftReviewListItemDto } from "@vidhira/contracts";
import { Card, Badge, Callout, EmptyState } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";

export const metadata: Metadata = {
  title: "Draft reviews — Vidhira",
  robots: { index: false, follow: false },
};

// Ported from frontend/src/screens/DraftReviews.jsx's default (no review open) view. Role
// gating relies on Express's requireRole("advocate") (see lawyer/page.tsx's comment for why).
export default async function LawyerDraftReviewsPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  let reviews: AdvocateDraftReviewListItemDto[] = [];
  try {
    reviews = await apiClient.get<AdvocateDraftReviewListItemDto[]>("/advocate/draft-reviews");
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 403) throw err;
    return (
      <div style={{ padding: 24, maxWidth: 700 }}>
        <Callout tone="warning">Only advocates can see draft reviews.</Callout>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-serif)", margin: 0 }}>Draft reviews</h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
          Clients ask you to review a document they drafted on Vidhira. Return comments within the stated turnaround.
        </p>
      </div>
      {reviews.length === 0 ? (
        <EmptyState title="No review requests" body="Paid draft-review requests from clients appear here." />
      ) : (
        reviews.map((r) => (
          <Link key={r.id} href={`/lawyer/draft-reviews/${r.id}`} style={{ textDecoration: "none", color: "inherit" }}>
            <Card style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, cursor: "pointer" }}>
              <div>
                <div style={{ fontWeight: 600 }}>{r.draft?.template?.name}</div>
                <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>Requested {fmtDateTime(r.submitted_at)}</div>
              </div>
              <Badge tone={r.status === "returned" ? "success" : "warning"}>{r.status.replace("_", " ")}</Badge>
            </Card>
          </Link>
        ))
      )}
    </div>
  );
}
