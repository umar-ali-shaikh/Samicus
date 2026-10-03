import { useAppState } from "../state/AppState";
import { LAWYERS } from "../data/mockData";
import { ModalShell } from "../components/Modal";
import { Button, Callout, AvatarTile, VerifiedBadge } from "../components/ui";

export function LawyerProfileModal() {
  const { state, act } = useAppState();
  const advocate = LAWYERS.find((l) => l.id === state.lawyerModalId);
  if (!advocate) return null;

  return (
    <ModalShell kicker="Advocate profile" title={advocate.name} onClose={act.closeModal} width={620}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <AvatarTile initials={advocate.initials} size={56} />
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{advocate.name}</div>
              <VerifiedBadge />
            </div>
            <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>Bar enrolment {advocate.bar}</div>
            <div style={{ fontSize: 13, marginTop: 2 }}>₹{advocate.fee} per consultation</div>
          </div>
        </div>

        <Callout tone="neutral" title="Why this advocate matches your issue">{advocate.whyMatch}</Callout>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, fontSize: 13 }}>
          <div><strong>Practice areas</strong><div>{advocate.area} · {advocate.subs.join(", ")}</div></div>
          <div><strong>Courts & jurisdictions</strong><div>{advocate.courts}</div></div>
          <div><strong>Years of practice</strong><div>{advocate.years}</div></div>
          <div><strong>Languages</strong><div>{advocate.langs.join(", ")}</div></div>
          <div><strong>Consultation modes</strong><div>{advocate.modes.join(", ")}</div></div>
          <div><strong>Next available</strong><div>{advocate.nextSlot}</div></div>
          <div><strong>Education</strong><div>{advocate.education}</div></div>
        </div>

        <div>
          <strong style={{ fontSize: 13 }}>Relevant matter experience</strong>
          <ul style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 6 }}>{advocate.experience.map((e, i) => <li key={i}>{e}</li>)}</ul>
          <div style={{ fontSize: 11.5, color: "var(--color-label)" }}>Experience is self-declared and verified against filed matter records where available. Past outcomes do not predict future results.</div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Button onClick={() => act.openBooking(advocate.id)}>Book appointment</Button>
          <Button variant="outline" onClick={() => act.talkNowWith(advocate.id)}>Talk now</Button>
          <Button variant="outline" onClick={() => act.openQuote(advocate.id)}>Ask for fee proposal</Button>
        </div>
      </div>
    </ModalShell>
  );
}
