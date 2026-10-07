import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { apiClient, ApiError } from "@/server/apiClient";
import type { MatterListItemDto } from "@vidhira/contracts";
import { EmptyState } from "@/components/ui";

export const metadata: Metadata = {
  title: "Matters — Vidhira",
  robots: { index: false, follow: false },
};

// Ported from frontend/src/screens/Matters.jsx's default-selection behaviour (first matter,
// or the one named by the route param) -- here expressed as a redirect into the real
// /matters/[matterId] route instead of client-side `param` state.
export default async function MattersPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  let advocateMode = true;
  try {
    await apiClient.get("/advocate/profile");
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 403)) advocateMode = false;
    else throw err;
  }

  const matters = await apiClient.get<MatterListItemDto[]>("/matters");
  const mine = matters.filter((m) => (advocateMode ? m.mySide === "advocate" : m.mySide === "client"));

  if (mine.length > 0) redirect(`/matters/${mine[0]!.id}`);

  return (
    <div style={{ padding: 24, maxWidth: 700 }}>
      <h1 style={{ fontFamily: "var(--font-serif)" }}>{advocateMode ? "Matters" : "My matters"}</h1>
      <EmptyState
        title="No matters yet"
        body={
          advocateMode
            ? "Matters appear here when you accept a client request or open one after a consultation."
            : "Once an advocate accepts your request or you confirm an engagement, your matter appears here."
        }
      />
    </div>
  );
}
