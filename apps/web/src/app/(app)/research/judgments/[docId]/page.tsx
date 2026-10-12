import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { ApiError } from "@/server/apiClient";
import { getCorpusDocumentAction, getCorpusDocumentChunksAction } from "@/server/researchActions";
import { JudgmentReaderClient } from "./JudgmentReaderClient";

export const metadata: Metadata = {
  title: "Judgment — Vidhira Research",
  robots: { index: false, follow: false },
};

// Ported from frontend/src/screens/research/JudgmentReader.jsx -- an in-app full judgment
// reader, every indexed chunk in reading order. `cited` (comma-separated chunk ids) carries
// forward the "jump to what this report cited" handoff that the original SPA passed through
// in-memory UIState -- here it travels as a URL param instead, which is the Next-native
// equivalent and (unlike the original) survives a reload or a shared link.
export default async function JudgmentPage({ params, searchParams }: { params: Promise<{ docId: string }>; searchParams: Promise<{ cited?: string }> }) {
  const { docId } = await params;
  const { cited } = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  let doc;
  try {
    doc = await getCorpusDocumentAction(docId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const chunks = await getCorpusDocumentChunksAction(docId);
  const citedChunkIds = cited ? cited.split(",").filter(Boolean) : [];

  return <JudgmentReaderClient doc={doc} initialChunks={chunks} citedChunkIds={citedChunkIds} />;
}
