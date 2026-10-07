import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/server/supabase";
import { apiClient, ApiError } from "@/server/apiClient";
import type { AdvocateDto } from "@vidhira/contracts";
import { Card, Callout } from "@/components/ui";
import { VerificationStatusCard } from "@/components/advocates/VerificationStatusCard";
import { AvailabilityToggle } from "@/components/advocates/AvailabilityToggle";
import { RequestCard } from "@/components/advocates/RequestCard";
import { listMyRequestsAction } from "@/server/advocatesActions";

export const metadata: Metadata = {
  title: "Dashboard — Vidhira",
  robots: { index: false, follow: false },
};

/**
 * Ported from frontend/src/screens/LawyerDashboard.jsx -- scoped to this slice's domain
 * (advocate verification, availability, incoming requests). The "Upcoming consultations",
 * "Active matters" and "Needs attention" summary cards (and their underlying GET /consultations,
 * /matters, /tasks/mine, /advocate/draft-reviews, /threads calls) are deferred to those domains'
 * own Phase 3 slices, same reasoning as AdvocateRow's deferred "Book consultation" button.
 *
 * Role gating: proxy.ts's route-manifest role gate is a documented no-op until a route actually
 * needs it (see that file's comment) -- rather than solve that architecture question here, this
 * page relies on Express's own requireRole("advocate") (GET /advocate/profile, /advocate/requests)
 * and falls back to an inline message, matching the legacy screen's `if (!advocate) return ...`.
 */
export default async function LawyerDashboardPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!data.user.email_confirmed_at) redirect("/verify-email");

  let advocate: AdvocateDto | null = null;
  try {
    advocate = await apiClient.get<AdvocateDto>("/advocate/profile");
  } catch (err) {
    // 404: role is "advocate" but no profile row exists yet. 403: requireRole("advocate")
    // itself rejected -- the caller's role isn't "advocate" at all. Both mean "show the
    // apply-to-list message" here, not an error page.
    if (!(err instanceof ApiError) || (err.status !== 404 && err.status !== 403)) throw err;
  }

  if (!advocate) {
    return (
      <div style={{ padding: 24, maxWidth: 700 }}>
        <Callout tone="warning">
          No advocate profile yet. <Link href="/profile#advocate">Apply to list</Link>.
        </Callout>
      </div>
    );
  }

  const verified = advocate.verification_status === "verified";
  const requests = verified ? await listMyRequestsAction() : [];

  return (
    <div style={{ maxWidth: 1000, display: "flex", flexDirection: "column", gap: 20, padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-serif)", margin: 0 }}>Adv. {advocate.user?.full_name?.replace(/^Adv\.?\s*/i, "")}</h1>
          <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
            {advocate.bar_council} · {advocate.enrolment_number}
          </div>
        </div>
        {verified && <AvailabilityToggle advocate={advocate} />}
      </div>

      {!verified && <VerificationStatusCard advocate={advocate} />}

      {verified && (
        <div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 17, marginBottom: 10 }}>Incoming requests</div>
          {requests.length === 0 ? (
            <Card style={{ padding: 16 }}>
              <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                {advocate.availability_state === "available"
                  ? "No open requests right now. They appear here the moment a client is matched to you."
                  : "You're not accepting requests. Switch on “Accepting requests” to receive new clients."}
              </div>
            </Card>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {requests.map((r) => (
                <RequestCard key={r.id} r={r} />
              ))}
            </div>
          )}
        </div>
      )}

      <Callout tone="neutral">Response time, acceptance rate and conversion are tracked internally for quality and are never shown to clients as a ranking.</Callout>
    </div>
  );
}
