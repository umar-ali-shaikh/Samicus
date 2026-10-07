import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { AdvocateDto, AvailabilityDayDto } from "@vidhira/contracts";
import { apiClient, ApiError } from "@/server/apiClient";
import { AvatarTile, VerifiedBadge, Callout, Button } from "@/components/ui";
import { inr, initials, languageName, modeName, fmtDateTime } from "@/lib/format";

/** Ported from frontend/src/modals/LawyerProfileModal.jsx as a real page, per
 * docs/MASTER-PROMPT.md's target_structure ("advocates/[advocateId]/"). "Book appointment"
 * links to the booking wizard route ("advocates/[advocateId]/book/"). */
export async function generateMetadata({ params }: { params: Promise<{ advocateId: string }> }): Promise<Metadata> {
  const { advocateId } = await params;
  try {
    const advocate = await apiClient.get<AdvocateDto>(`/advocates/${advocateId}`);
    return { title: `Adv. ${advocate.user?.full_name ?? "Profile"} — Vidhira`, robots: { index: false, follow: false } };
  } catch {
    return { title: "Advocate — Vidhira", robots: { index: false, follow: false } };
  }
}

export default async function AdvocateProfilePage({ params }: { params: Promise<{ advocateId: string }> }) {
  const { advocateId } = await params;

  let advocate: AdvocateDto;
  try {
    advocate = await apiClient.get<AdvocateDto>(`/advocates/${advocateId}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const slots = await apiClient.get<AvailabilityDayDto[]>(`/advocates/${advocateId}/slots`);
  const next = slots.flatMap((d) => d.slots).find((s) => !s.full);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 24, maxWidth: 620 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        {advocate.user?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={advocate.user.avatar_url} alt="" width={56} height={56} referrerPolicy="no-referrer" style={{ borderRadius: 18 }} />
        ) : (
          <AvatarTile initials={initials(advocate.user?.full_name)} size={56} />
        )}
        <div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 22 }}>Adv. {advocate.user?.full_name?.replace(/^Adv\.?\s*/i, "")}</div>
          <div style={{ marginTop: 4 }}>
            <VerifiedBadge />
          </div>
          <div style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginTop: 4 }}>
            {advocate.bar_council} · enrolment {advocate.enrolment_number}
          </div>
          <div style={{ fontSize: 13, marginTop: 2 }}>{advocate.scheduled_fee != null ? `${inr(advocate.scheduled_fee)} per consultation` : "Fee on request"}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, fontSize: 13 }}>
        <div>
          <strong>Practice areas</strong>
          <div>
            {advocate.practice_areas.map((p) => p.name).join(", ") || "—"}
            {advocate.sub_specialisations.length ? ` · ${advocate.sub_specialisations.join(", ")}` : ""}
          </div>
        </div>
        <div>
          <strong>Courts &amp; jurisdictions</strong>
          <div>{advocate.jurisdictions.map((j) => `${j.forum}, ${j.state}`).join("; ") || "—"}</div>
        </div>
        <div>
          <strong>Years of practice</strong>
          <div>{advocate.years_of_practice ?? "—"}</div>
        </div>
        <div>
          <strong>City</strong>
          <div>{advocate.city || "—"}</div>
        </div>
        <div>
          <strong>Languages</strong>
          <div>{advocate.languages.map(languageName).join(", ") || "—"}</div>
        </div>
        <div>
          <strong>Consultation modes</strong>
          <div>{advocate.consultation_modes.map(modeName).join(", ") || "—"}</div>
        </div>
        <div>
          <strong>Next available</strong>
          <div>{next ? fmtDateTime(next.startsAt) : "No open slots this week"}</div>
        </div>
        {advocate.education.length > 0 && (
          <div>
            <strong>Education</strong>
            <div>{advocate.education.join("; ")}</div>
          </div>
        )}
      </div>

      {advocate.relevant_experience.length > 0 && (
        <div>
          <strong style={{ fontSize: 13 }}>Relevant matter experience</strong>
          <ul style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 6 }}>
            {advocate.relevant_experience.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          <div style={{ fontSize: 11.5, color: "var(--color-label)" }}>Experience is declared by the advocate. Past outcomes do not predict future results.</div>
        </div>
      )}

      <Callout tone="neutral">Enrolment details were checked by Vidhira&apos;s trust team before this profile was listed.</Callout>

      <Link href={`/advocates/${advocate.id}/book`}>
        <Button style={{ width: "auto" }}>Book appointment</Button>
      </Link>
    </div>
  );
}
