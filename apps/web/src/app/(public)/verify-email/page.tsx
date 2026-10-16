import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { VerifyEmailClient } from "./VerifyEmailClient";

export const metadata: Metadata = {
  title: "Verify your email — Vidhira",
  robots: { index: false, follow: false },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    if (data.user.email_confirmed_at) redirect("/dashboard");
    return <VerifyEmailClient email={data.user.email ?? "your email"} signedIn />;
  }
  // Just signed up with confirmation required: no session exists yet (see signUpAction), so
  // the address comes from the redirect. Without one there's nothing to show -- go sign in.
  const { email } = await searchParams;
  if (!email || !EMAIL_RE.test(email)) redirect("/login");
  return <VerifyEmailClient email={email} signedIn={false} />;
}
