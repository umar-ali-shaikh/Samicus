import { useGet } from "../api/hooks";
import { useUI } from "../state/UIState";
import { useAuth } from "../auth/AuthProvider";
import { ModalShell } from "../components/Modal";
import { Button, Callout, AvatarTile, VerifiedBadge, QueryBoundary } from "../components/ui";
import { inr, initials, languageName, modeName, fmtDateTime } from "../lib/format";

export function LawyerProfileModal({ advocateId }) {
  const { user } = useAuth();
  const { closeModal, openModal } = useUI();
  const advocate = useGet(`/advocates/${advocateId}`);
  const slots = useGet(`/advocates/${advocateId}/slots`);
  const next = (slots.data || []).flatMap((d) => d.slots).find((s) => !s.full);
  const canBook = user?.role !== "admin" && user?.role !== "founder";

  return (
    <ModalShell kicker="Advocate profile" title={advocate.data ? `Adv. ${advocate.data.user?.full_name?.replace(/^Adv\.?\s*/i, "")}` : "Advocate"} onClose={closeModal} width={620}>
      <QueryBoundary query={advocate}>
        {(a) => (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              {a.user?.avatar_url ? <img src={a.user.avatar_url} alt="" width={56} height={56} referrerPolicy="no-referrer" style={{ borderRadius: 18 }} /> : <AvatarTile initials={initials(a.user?.full_name)} size={56} />}
              <div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><VerifiedBadge /></div>
                <div style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginTop: 4 }}>{a.bar_council} · enrolment {a.enrolment_number}</div>
                <div style={{ fontSize: 13, marginTop: 2 }}>{a.scheduled_fee != null ? `${inr(a.scheduled_fee)} per consultation` : "Fee on request"}</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, fontSize: 13 }}>
              <div><strong>Practice areas</strong><div>{(a.practice_areas || []).map((p) => p.name).join(", ") || "—"}{a.sub_specialisations?.length ? ` · ${a.sub_specialisations.join(", ")}` : ""}</div></div>
              <div><strong>Courts & jurisdictions</strong><div>{(a.jurisdictions || []).map((j) => `${j.forum}, ${j.state}`).join("; ") || "—"}</div></div>
              <div><strong>Years of practice</strong><div>{a.years_of_practice ?? "—"}</div></div>
              <div><strong>City</strong><div>{a.city || "—"}</div></div>
              <div><strong>Languages</strong><div>{(a.languages || []).map(languageName).join(", ") || "—"}</div></div>
              <div><strong>Consultation modes</strong><div>{(a.consultation_modes || []).map(modeName).join(", ") || "—"}</div></div>
              <div><strong>Next available</strong><div>{next ? fmtDateTime(next.startsAt) : slots.isPending ? "Checking…" : "No open slots this week"}</div></div>
              {a.education?.length > 0 && <div><strong>Education</strong><div>{a.education.join("; ")}</div></div>}
            </div>

            {a.relevant_experience?.length > 0 && (
              <div>
                <strong style={{ fontSize: 13 }}>Relevant matter experience</strong>
                <ul style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 6 }}>{a.relevant_experience.map((e, i) => <li key={i}>{e}</li>)}</ul>
                <div style={{ fontSize: 11.5, color: "var(--color-label)" }}>Experience is declared by the advocate. Past outcomes do not predict future results.</div>
              </div>
            )}

            <Callout tone="neutral">Enrolment details were checked by Vidhira's trust team before this profile was listed.</Callout>
            {canBook && <Button onClick={() => openModal("booking", { advocateId: a.id })}>Book appointment</Button>}
          </div>
        )}
      </QueryBoundary>
    </ModalShell>
  );
}
