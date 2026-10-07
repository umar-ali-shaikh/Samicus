import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { AdvocateDto, SituationDto } from "@vidhira/contracts";
import { apiClient, ApiError } from "@/server/apiClient";
import { createServerSupabaseClient } from "@/server/supabase";
import { BookingWizard } from "@/components/booking/BookingWizard";

export async function generateMetadata({ params }: { params: Promise<{ advocateId: string }> }): Promise<Metadata> {
  const { advocateId } = await params;
  try {
    const advocate = await apiClient.get<AdvocateDto>(`/advocates/${advocateId}`);
    return { title: `Book Adv. ${advocate.user?.full_name ?? ""} — Vidhira`, robots: { index: false, follow: false } };
  } catch {
    return { title: "Book a consultation — Vidhira", robots: { index: false, follow: false } };
  }
}

// Ported from frontend/src/modals/BookingModal.jsx as a real route, per
// docs/MASTER-PROMPT.md's target_structure ("advocates/[advocateId]/book/"). Always has a
// preset advocate (this route requires one), so the original's step 6 "advocates matched to
// your issue" match-picking step is dropped -- see BookingWizard's own comment.
export default async function BookAdvocatePage({ params }: { params: Promise<{ advocateId: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  const { advocateId } = await params;
  let advocate: AdvocateDto;
  try {
    advocate = await apiClient.get<AdvocateDto>(`/advocates/${advocateId}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const situations = await apiClient.get<SituationDto[]>("/situations");

  return <BookingWizard advocate={advocate} situations={situations} />;
}
