import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { ApiError } from "@/server/apiClient";
import { getResearchReportAction } from "@/server/researchActions";
import { ResearchReportClient } from "./ResearchReportClient";

export const metadata: Metadata = {
  title: "Research report — Vidhira",
  robots: { index: false, follow: false },
};

// Ported from frontend/src/screens/research/ResearchReport.jsx -- a saved search's full
// report. The "instant reopen" guarantee (clicking a past search loads the full saved report,
// never replays retrieve+answer) is the server action calling GET .../report directly.
export default async function ResearchReportPage({ params }: { params: Promise<{ queryId: string }> }) {
  const { queryId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  let report;
  try {
    report = await getResearchReportAction(queryId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return <ResearchReportClient queryId={queryId} initialReport={report} />;
}
