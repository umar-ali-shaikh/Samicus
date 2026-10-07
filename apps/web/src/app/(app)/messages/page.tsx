import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { EmptyState } from "@/components/ui";
import { getThreadsAction } from "@/server/messagesActions";

export const metadata: Metadata = {
  title: "Messages — Vidhira",
  robots: { index: false, follow: false },
};

// Ported from frontend/src/screens/Messages.jsx's default-selection behaviour, same pattern
// as /matters: redirect into the real /messages/[threadId] route for the most recent thread.
export default async function MessagesPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  const threads = await getThreadsAction();
  if (threads.length > 0) redirect(`/messages/${threads[0]!.id}`);

  return (
    <div style={{ padding: 24, maxWidth: 700 }}>
      <h1 style={{ fontFamily: "var(--font-serif)" }}>Messages</h1>
      <EmptyState title="No conversations yet" body="A conversation opens automatically when an advocate accepts your request or opens a matter with you." />
    </div>
  );
}
