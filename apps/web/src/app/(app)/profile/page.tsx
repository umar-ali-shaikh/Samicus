import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { apiClient } from "@/server/apiClient";
import type { AccountDto, AccountMemberDto, PlanDto } from "@vidhira/contracts";
import { ProfileClient } from "./ProfileClient";

export const metadata: Metadata = {
  title: "Profile & settings — Vidhira",
  robots: { index: false, follow: false },
};

/**
 * Ported from frontend/src/screens/Profile.jsx -- scoped to this slice's domain (accounts,
 * members, plans). The other sections that screen has (personal details, advocate
 * forms/verification, payments, complaints, privacy) get added here as their own domains are
 * converted in later Phase 3 slices -- this page grows incrementally, it isn't yet "done".
 */
export default async function ProfilePage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  const [accounts, plans] = await Promise.all([apiClient.get<AccountDto[]>("/accounts"), apiClient.get<PlanDto[]>("/plans")]);

  const defaultAccount = accounts.find((a) => a.myRole === "owner") ?? accounts[0] ?? null;
  const initialMembers = defaultAccount ? await apiClient.get<AccountMemberDto[]>(`/accounts/${defaultAccount.id}/members`) : [];

  return <ProfileClient accounts={accounts} plans={plans} initialAccountId={defaultAccount?.id ?? null} initialMembers={initialMembers} />;
}
