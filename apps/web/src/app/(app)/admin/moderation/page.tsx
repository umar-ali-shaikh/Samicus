import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { getModerationQueueAction } from "@/server/learnActions";
import { ModerationClient } from "./ModerationClient";

export const metadata: Metadata = {
  title: "Moderation — Vidhira",
  robots: { index: false, follow: false },
};

// Ported from frontend/src/screens/Moderation.jsx.
export default async function AdminModerationPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  const queue = await getModerationQueueAction();

  return (
    <div style={{ padding: 24, maxWidth: 820, display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-serif)", margin: 0 }}>Moderation</h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
          Public questions and advocate answers are reviewed before they&apos;re published. Reject anything with private facts, names, advertising or
          advice that creates a client relationship.
        </p>
      </div>
      <ModerationClient initialQueue={queue} />
    </div>
  );
}
