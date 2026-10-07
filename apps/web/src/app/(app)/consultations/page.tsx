import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { apiClient, ApiError } from "@/server/apiClient";
import type { ConsultationListItemDto } from "@vidhira/contracts";
import { ConsultationsClient } from "./ConsultationsClient";

export const metadata: Metadata = {
  title: "Consultations — Vidhira",
  robots: { index: false, follow: false },
};

// Ported from frontend/src/screens/Consultations.jsx. Whether the caller sees the
// client-side or advocate-side view is decided the same way as /lawyer: try
// GET /advocate/profile and treat 403 (role isn't "advocate" -- requireRole's own response)
// or 404 (role is "advocate" but no profile row exists) as "this user isn't an advocate" (see
// that page's comment on why a real role gate is out of scope here).
export default async function ConsultationsPage() {
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

  const consultations = await apiClient.get<ConsultationListItemDto[]>("/consultations");
  return <ConsultationsClient consultations={consultations} advocateMode={advocateMode} />;
}
