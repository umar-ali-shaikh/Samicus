import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { apiClient, ApiError } from "@/server/apiClient";
import type { AdvocateDto, GuideListItemDto, MyQuestionDto, PublicQuestionDto, SpecialisationDto } from "@vidhira/contracts";
import { LearnClient } from "./LearnClient";

export const metadata: Metadata = {
  title: "Ask & learn — Vidhira",
  robots: { index: false, follow: false },
};

// Ported from frontend/src/screens/Learn.jsx.
export default async function LearnPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  let advocate: AdvocateDto | null = null;
  try {
    advocate = await apiClient.get<AdvocateDto>("/advocate/profile");
  } catch (err) {
    if (!(err instanceof ApiError) || (err.status !== 404 && err.status !== 403)) throw err;
  }
  const canAnswer = advocate?.verification_status === "verified";

  const [areas, questions, mine, guides] = await Promise.all([
    apiClient.get<SpecialisationDto[]>("/specialisations"),
    apiClient.get<PublicQuestionDto[]>("/questions"),
    apiClient.get<MyQuestionDto[]>("/questions/mine"),
    apiClient.get<GuideListItemDto[]>("/guides"),
  ]);
  const pendingCount = mine.filter((q) => q.status === "pending_moderation").length;

  return <LearnClient areas={areas} initialQuestions={questions} guides={guides} canAnswer={canAnswer} pendingCount={pendingCount} />;
}
