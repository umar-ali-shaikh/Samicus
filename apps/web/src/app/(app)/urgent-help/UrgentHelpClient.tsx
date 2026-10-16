"use client";

import { useState, useTransition } from "react";
import { Card, Button, Callout } from "@/components/ui";
import { LiveConsult } from "@/components/intake/LiveConsult";
import { NoAdvocatesFallback } from "@/components/advocates/NoAdvocatesFallback";
import { startUrgentRequestAction } from "@/server/intakeActions";

// Each urgent category maps to a seeded practice area by name -- same table as the legacy
// UrgentModal.jsx. "General advisory" is the fallback when a name isn't in the catalogue.
const CATEGORIES: Array<[label: string, practiceArea: string]> = [
  ["Police / detention", "Criminal defence"],
  ["Arrest / search", "Criminal defence"],
  ["Domestic violence", "Family"],
  ["Accident", "Motor accident & insurance"],
  ["Airport / immigration", "Immigration"],
  ["Court deadline", "Litigation & notices"],
  ["Urgent business injunction", "Contract & commercial recovery"],
  ["Other", "General advisory"],
];

type Phase = "danger" | "category" | "live" | "none";

export function UrgentHelpClient({
  areas,
  paymentsEnabled,
  user,
}: {
  areas: Array<{ id: string; name: string }>;
  paymentsEnabled: boolean;
  user: { full_name?: string; email?: string };
}) {
  const [phase, setPhase] = useState<Phase>("danger");
  const [category, setCategory] = useState("");
  const [consent, setConsent] = useState(false);
  const [intakeId, setIntakeId] = useState<string | null>(null);
  const [helpline, setHelpline] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const areaFor = (c: string) => {
    const name = CATEGORIES.find(([label]) => label === c)?.[1];
    return areas.find((a) => a.name === name) ?? areas.find((a) => a.name === "General advisory");
  };

  function start() {
    if (!category) return setError("Choose what's happening first.");
    if (!consent) return setError("Please tick the consent box so an advocate can review your category.");
    const area = areaFor(category);
    if (!area) return setError("Practice areas aren't set up yet — please try Talk now instead.");
    setError("");
    startTransition(async () => {
      const result = await startUrgentRequestAction({ routedPracticeAreaId: area.id, description: `Urgent: ${category}`, urgency: "today", mode: "phone", language: "en" });
      if (!result.ok) return setError(result.error);
      if (result.status === "none_available") {
        setHelpline(result.helpline);
        setPhase("none");
        return;
      }
      setIntakeId(result.intakeId);
      setPhase("live");
    });
  }

  const title = { danger: "Is anyone in immediate danger?", category: "What's happening?", live: "Finding an advocate", none: "No advocate immediately available" }[phase];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 24, maxWidth: 560 }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-rust)" }}>Urgent help</div>
        <h1 style={{ fontFamily: "var(--font-serif)", margin: 0 }}>{title}</h1>
      </div>

      {phase === "danger" && (
        <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <Callout tone="danger">If anyone is in immediate physical danger, call emergency services now.</Callout>
          <a
            href="tel:112"
            style={{ display: "block", textAlign: "center", background: "var(--color-rust)", color: "#fff", padding: 14, borderRadius: 10, fontWeight: 700, textDecoration: "none" }}
          >
            Call 112 now
          </a>
          <Button onClick={() => setPhase("category")}>No immediate danger — continue</Button>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>You have the right to inform someone of your choice and to consult a lawyer.</div>
        </Card>
      )}

      {phase === "category" && (
        <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div role="radiogroup" aria-label="What's happening?" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            {CATEGORIES.map(([c]) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={category === c}
                onClick={() => {
                  setCategory(c);
                  setError("");
                }}
                style={{
                  padding: 14,
                  borderRadius: 10,
                  border: `1.5px solid ${category === c ? "var(--color-navy)" : "var(--color-border)"}`,
                  background: category === c ? "#F1EFE6" : "#fff",
                  color: "var(--color-ink)",
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: 13,
                }}
              >
                {c}
              </button>
            ))}
          </div>
          <label style={{ display: "flex", gap: 8, fontSize: 12.5, alignItems: "flex-start" }}>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                setError("");
              }}
              style={{ marginTop: 3 }}
            />
            I consent to sharing this category with an available advocate after their conflict check clears.
          </label>
          {error && <Callout tone="danger">{error}</Callout>}
          <Button variant="danger" onClick={start} disabled={isPending}>
            {isPending ? "Searching…" : "Find an advocate now"}
          </Button>
        </Card>
      )}

      {phase === "live" && intakeId && (
        <>
          <LiveConsult intakeId={intakeId} onCancelled={() => setPhase("category")} onGone={() => setPhase("category")} paymentsEnabled={paymentsEnabled} user={user} />
          <Callout tone="neutral">
            While you wait: you may remain silent beyond identifying yourself. Ask for a copy of any document you&apos;re asked to sign. Note the time, place and names of anyone
            present.
          </Callout>
        </>
      )}

      {phase === "none" && (
        <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <NoAdvocatesFallback practiceAreaId={areaFor(category)?.id} title="No advocate who accepts urgent requests is available for this category right now" />
          {helpline && <Callout tone="warning">Free legal aid: {helpline}</Callout>}
          <Button variant="outline" onClick={() => setPhase("category")}>
            Search again
          </Button>
        </Card>
      )}
    </div>
  );
}
