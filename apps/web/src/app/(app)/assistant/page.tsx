import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { AssistantClient } from "./AssistantClient";

export const metadata: Metadata = {
  title: "AI Legal Assistant — Vidhira",
  robots: { index: false, follow: false },
};

// Ported from frontend/src/screens/LegalAssistant.jsx -- the conversational RAG chat surface
// (distinct from /case-law, a faceted judgment-search tool). Session id generation and
// conversation rehydration are both client-only (localStorage), so this Server Component only
// gates auth and hands off the signed-in user's id.
export default async function AssistantPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  return <AssistantClient userId={data.user.id} />;
}
