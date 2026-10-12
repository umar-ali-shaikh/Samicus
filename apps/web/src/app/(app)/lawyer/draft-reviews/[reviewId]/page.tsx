import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { getAdvocateDraftReviewDetailAction } from "@/server/draftingActions";
import { Card, Badge, Button } from "@/components/ui";
import { ReturnReviewClient } from "./ReturnReviewClient";

export const metadata: Metadata = {
  title: "Draft review — Vidhira",
  robots: { index: false, follow: false },
};

// Ported from frontend/src/screens/DraftReviews.jsx's ReviewDetail.
export default async function LawyerDraftReviewDetailPage({ params }: { params: Promise<{ reviewId: string }> }) {
  const { reviewId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  const detail = await getAdvocateDraftReviewDetailAction(reviewId);

  return (
    <div style={{ padding: 24, display: "flex", gap: 20, flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 340px" }}>
        <Link href="/lawyer/draft-reviews" style={{ textDecoration: "none" }}>
          <Button variant="ghost" style={{ width: "auto" }}>
            ← All reviews
          </Button>
        </Link>
        <Card style={{ marginTop: 8, padding: 16 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--color-label)", marginBottom: 8 }}>DRAFT UNDER REVIEW</div>
          {detail.draft.blocks.map((b) => (
            <div key={b.n} style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5 }}>
                {b.n}. {b.heading} {b.reviewAdvised && <Badge tone="warning">REVIEW ADVISED</Badge>}
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)", whiteSpace: "pre-wrap" }}>{b.text}</div>
            </div>
          ))}
        </Card>
      </div>
      <ReturnReviewClient detail={detail} />
    </div>
  );
}
