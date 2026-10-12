import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { getCorpusStatusAction, listResearchQueriesAction } from "@/server/researchActions";
import { ResearchHomeClient } from "./ResearchHomeClient";

export const metadata: Metadata = {
  title: "Vidhira Research — Vidhira",
  robots: { index: false, follow: false },
};

// Ported from frontend/src/screens/research/ResearchHome.jsx -- search + My Research list +
// browse library. The corpus/my-research/examples fetches run in parallel on the server; the
// client component re-fetches its own slice after a mutation (pin/delete/retry/search).
export default async function ResearchPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  const [status, myResearch] = await Promise.all([getCorpusStatusAction(), listResearchQueriesAction()]);
  const examples = myResearch.length === 0 ? await listResearchQueriesAction({ tag: "example" }) : [];

  return <ResearchHomeClient initialStatus={status} initialMyResearch={myResearch} initialExamples={examples} />;
}
