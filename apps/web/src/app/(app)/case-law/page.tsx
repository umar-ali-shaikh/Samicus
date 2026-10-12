import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { CaseLawClient } from "./CaseLawClient";

export const metadata: Metadata = {
  title: "Case law search — Vidhira",
  robots: { index: false, follow: false },
};

// Ported from frontend/src/screens/CaseLaw.jsx -- a faceted search tool for browsing Indian
// Kanoon judgments directly (distinct from /research and /assistant, both of which are
// retrieval-then-cite RAG surfaces). Entirely client-interactive, so this Server Component
// only gates auth/verification before handing off.
export default async function CaseLawPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  return <CaseLawClient />;
}
