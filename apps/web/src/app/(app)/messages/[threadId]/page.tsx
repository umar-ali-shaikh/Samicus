import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { ApiError } from "@/server/apiClient";
import { getThreadMessagesAction, getThreadsAction } from "@/server/messagesActions";
import { MessagesClient } from "./MessagesClient";

export const metadata: Metadata = {
  title: "Messages — Vidhira",
  robots: { index: false, follow: false },
};

export default async function ThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  const { threadId } = await params;
  const threads = await getThreadsAction();
  if (!threads.some((t) => t.id === threadId)) notFound();

  let initialMessages;
  try {
    initialMessages = await getThreadMessagesAction(threadId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return <MessagesClient threads={threads} activeThreadId={threadId} initialMessages={initialMessages} />;
}
