import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { signOutAction } from "@/server/authActions";

export const metadata: Metadata = {
  title: "Dashboard — Vidhira",
  robots: { index: false, follow: false },
};

/**
 * Placeholder authenticated landing page -- exists only to prove the auth flow end-to-end
 * (Phase 2's gate: "login/verify-email/reset flows work"). The real dashboard, with its full
 * nav and role-aware content, is built per docs/MASTER-PROMPT.md's Phase 3 domain slices.
 */
export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  return (
    <main style={{ padding: 40, fontFamily: "var(--font-sans)" }}>
      <h1 style={{ fontFamily: "var(--font-serif)" }}>Signed in</h1>
      <p>
        {data.user.email} ({data.user.app_metadata?.provider ?? "email"})
      </p>
      <form action={signOutAction}>
        <button type="submit" style={{ marginTop: 16, padding: "10px 16px", borderRadius: 10, border: "none", background: "var(--color-navy)", color: "#fff", cursor: "pointer" }}>
          Sign out
        </button>
      </form>
    </main>
  );
}
