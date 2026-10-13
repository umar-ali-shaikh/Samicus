import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { apiClient } from "@/server/apiClient";
import type { AccountDto, PackCategoryDto, PackScanDto, RulesetDiffDto } from "@vidhira/contracts";
import { PackClient } from "./PackClient";

export const metadata: Metadata = {
  title: "Pack compliance — Vidhira",
  robots: { index: false, follow: false },
};

// Ported from frontend/src/screens/Pack.jsx.
export default async function PackCompliancePage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  const [categories, portfolio, drift, accounts] = await Promise.all([
    apiClient.get<PackCategoryDto[]>("/pack/categories"),
    apiClient.get<PackScanDto[]>("/pack/portfolio"),
    apiClient.get<RulesetDiffDto[]>("/pack/drift"),
    apiClient.get<AccountDto[]>("/accounts"),
  ]);
  const defaultAccount = accounts.find((a) => a.myRole === "owner") ?? accounts[0] ?? null;

  return <PackClient categories={categories} portfolio={portfolio} drift={drift} accountId={defaultAccount?.id ?? null} />;
}
