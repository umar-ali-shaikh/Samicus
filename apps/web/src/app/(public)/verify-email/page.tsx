import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { VerifyEmailClient } from "./VerifyEmailClient";

export const metadata: Metadata = {
  title: "Verify your email — Vidhira",
  robots: { index: false, follow: false },
};

export default async function VerifyEmailPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (data.user.email_confirmed_at) redirect("/dashboard");

  return <VerifyEmailClient email={data.user.email ?? "your email"} />;
}
