import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { getContractReviewAction } from "@/server/contractReviewActions";
import { Button } from "@/components/ui";
import { FindingsClient } from "./FindingsClient";

export const metadata: Metadata = {
  title: "Contract review — Vidhira",
  robots: { index: false, follow: false },
};

// Ported from frontend/src/screens/Review.jsx's Findings view.
export default async function ContractReviewDetailPage({ params }: { params: Promise<{ reviewId: string }> }) {
  const { reviewId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  const review = await getContractReviewAction(reviewId);

  return (
    <div style={{ padding: 24, maxWidth: 820, display: "flex", flexDirection: "column", gap: 16 }}>
      <Link href="/contract-review" style={{ textDecoration: "none" }}>
        <Button variant="ghost" style={{ width: "auto" }}>
          ← New review
        </Button>
      </Link>
      <FindingsClient review={review} />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <a href={`/api/bff/contract-reviews/${review.id}/export`} download style={{ textDecoration: "none" }}>
          <Button style={{ width: "auto" }}>Export negotiation note</Button>
        </a>
        <Link href="/advocates" style={{ textDecoration: "none" }}>
          <Button variant="outline" style={{ width: "auto" }}>
            Have an advocate review it
          </Button>
        </Link>
      </div>
    </div>
  );
}
