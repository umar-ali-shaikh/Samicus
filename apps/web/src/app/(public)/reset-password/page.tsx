import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = {
  title: "Reset your password — Vidhira",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage() {
  // Reached only via the recovery link -> /api/bff/auth/callback?next=/reset-password, which
  // already exchanged the code for a session. No session here means a stale/reused/invalid link.
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  return <ResetPasswordForm />;
}
