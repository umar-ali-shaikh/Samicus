import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/server/supabase";
import { apiClient } from "@/server/apiClient";
import { getUsageAction } from "@/server/adminVerificationActions";
import type { GuideListItemDto, PackCategoryDto, ServiceListItemDto } from "@vidhira/contracts";
import { CatalogueClient } from "./CatalogueClient";

export const metadata: Metadata = {
  title: "Catalogue & rules — Vidhira",
  robots: { index: false, follow: false },
};

// Ported from frontend/src/screens/Catalogue.jsx.
export default async function AdminCataloguePage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  const [services, guides, categories, usage] = await Promise.all([
    apiClient.get<ServiceListItemDto[]>("/services"),
    apiClient.get<GuideListItemDto[]>("/guides"),
    apiClient.get<PackCategoryDto[]>("/pack/categories"),
    getUsageAction(),
  ]);

  return <CatalogueClient services={services} guides={guides} categories={categories} usage={usage} />;
}
