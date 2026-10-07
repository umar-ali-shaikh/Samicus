import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { apiClient, ApiError } from "@/server/apiClient";
import type { AccountDto, ConsultationListItemDto, DocumentListItemDto, MatterListItemDto } from "@vidhira/contracts";
import { DocumentsClient } from "./DocumentsClient";

export const metadata: Metadata = {
  title: "Documents — Vidhira",
  robots: { index: false, follow: false },
};

// Ported from frontend/src/screens/Documents.jsx. The original scopes the upload form to the
// client's currently-active account; apps/web has no multi-account switcher in its shell yet
// (same simplification as /consultations), so uploads go to the caller's first/default
// account.
export default async function DocumentsPage() {
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

  const [documents, accounts, matters, consultations] = await Promise.all([
    apiClient.get<DocumentListItemDto[]>("/documents"),
    apiClient.get<AccountDto[]>("/accounts"),
    apiClient.get<MatterListItemDto[]>("/matters"),
    apiClient.get<ConsultationListItemDto[]>("/consultations"),
  ]);
  const defaultAccount = accounts.find((a) => a.myRole === "owner") ?? accounts[0] ?? null;

  return (
    <DocumentsClient
      documents={documents}
      matters={matters}
      consultations={consultations}
      defaultAccountId={defaultAccount?.id ?? null}
      advocateMode={advocateMode}
    />
  );
}
