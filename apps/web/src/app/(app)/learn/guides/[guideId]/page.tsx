import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { apiClient } from "@/server/apiClient";
import type { GuideDetailDto } from "@vidhira/contracts";
import { Button, Callout } from "@/components/ui";
import { fmtDate } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ guideId: string }> }): Promise<Metadata> {
  const { guideId } = await params;
  try {
    const guide = await apiClient.get<GuideDetailDto>(`/guides/${guideId}`);
    return { title: `${guide.title} — Vidhira`, robots: { index: false, follow: false } };
  } catch {
    return { title: "Guide — Vidhira", robots: { index: false, follow: false } };
  }
}

// Ported from frontend/src/modals/GuideModal.jsx -- a real route per docs/MASTER-PROMPT.md's
// url_and_routing_rules ("guide ... modals become real routes: deep-linkable and back-button
// safe"), rather than a client-side-only modal.
export default async function GuidePage({ params }: { params: Promise<{ guideId: string }> }) {
  const { guideId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  const guide = await apiClient.get<GuideDetailDto>(`/guides/${guideId}`);

  return (
    <div style={{ padding: 24, maxWidth: 640, display: "flex", flexDirection: "column", gap: 14 }}>
      <Link href="/learn" style={{ textDecoration: "none" }}>
        <Button variant="ghost" style={{ width: "auto" }}>
          ← Ask & learn
        </Button>
      </Link>
      <div>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--color-label)" }}>KNOW YOUR RIGHTS</div>
        <h1 style={{ fontFamily: "var(--font-serif)", margin: "4px 0 0" }}>{guide.title}</h1>
      </div>
      <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.7 }}>{guide.body}</div>
      <Callout tone="neutral">
        General information, reviewed {guide.reviewed_at ? fmtDate(guide.reviewed_at) : "by our team"}. It is not legal advice and does not create an advocate–client relationship.
      </Callout>
    </div>
  );
}
