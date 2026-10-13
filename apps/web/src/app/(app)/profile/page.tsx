import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { apiClient, ApiError } from "@/server/apiClient";
import type { AccountDto, AccountMemberDto, AdvocateDto, MyComplaintDto, PlanDto, SpecialisationDto } from "@vidhira/contracts";
import { ProfileClient } from "./ProfileClient";

export const metadata: Metadata = {
  title: "Profile & settings — Vidhira",
  robots: { index: false, follow: false },
};

/**
 * Ported from frontend/src/screens/Profile.jsx -- scoped to this slice's domain (accounts,
 * members, plans, advocate onboarding/listing) plus complaints and privacy, added as those
 * domains were converted in their own Phase 3 slices. The one remaining section that screen
 * has (personal details/payments) is still pending its own domain slice -- this page grows
 * incrementally, it isn't yet "done".
 */
export default async function ProfilePage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  const [accounts, plans, myComplaints] = await Promise.all([
    apiClient.get<AccountDto[]>("/accounts"),
    apiClient.get<PlanDto[]>("/plans"),
    apiClient.get<MyComplaintDto[]>("/complaints/mine"),
  ]);

  const defaultAccount = accounts.find((a) => a.myRole === "owner") ?? accounts[0] ?? null;
  const initialMembers = defaultAccount ? await apiClient.get<AccountMemberDto[]>(`/accounts/${defaultAccount.id}/members`) : [];

  let advocate: AdvocateDto | null = null;
  try {
    advocate = await apiClient.get<AdvocateDto>("/advocate/profile");
  } catch (err) {
    // 404: role is "advocate" but no profile row exists yet. 403: requireRole("advocate")
    // itself rejected -- the caller's role isn't "advocate" at all (the common case here,
    // a plain client who has never applied). Both mean "show the apply form", not an error.
    if (!(err instanceof ApiError) || (err.status !== 404 && err.status !== 403)) throw err;
  }

  const practiceAreas = advocate ? [] : await apiClient.get<SpecialisationDto[]>("/specialisations");

  return (
    <ProfileClient
      accounts={accounts}
      plans={plans}
      initialAccountId={defaultAccount?.id ?? null}
      initialMembers={initialMembers}
      advocate={advocate}
      practiceAreas={practiceAreas}
      myComplaints={myComplaints}
    />
  );
}
