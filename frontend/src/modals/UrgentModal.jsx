import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useUI } from "../state/UIState";
import { useGet, useMut } from "../api/hooks";
import { api } from "../lib/api";
import { ModalShell } from "../components/Modal";
import { Button, Callout, QueryBoundary } from "../components/ui";
import { LiveConsult } from "../components/LiveConsult";
import { NoAdvocatesFallback } from "../components/NoAdvocatesFallback";

// Each urgent category maps to a practice area by name (the practice-area catalogue is seeded).
const CATEGORIES = [
  ["Police / detention", "Criminal defence"], ["Arrest / search", "Criminal defence"], ["Domestic violence", "Family"],
  ["Accident", "Motor accident & insurance"], ["Airport / immigration", "Immigration"], ["Court deadline", "Litigation & notices"],
  ["Urgent business injunction", "Contract & commercial recovery"], ["Other", "General advisory"],
];

export function UrgentModal() {
  const { activeAccount } = useAuth();
  const { closeModal } = useUI();
  const areas = useGet("/specialisations", undefined, { staleTime: 600000 });
  const [phase, setPhase] = useState("danger");
  const [category, setCategory] = useState("");
  const [consent, setConsent] = useState(false);
  const [live, setLive] = useState(null);
  const [validationError, setValidationError] = useState("");

  const matchedArea = (areas.data || []).find((a) => a.name === CATEGORIES.find(([c]) => c === category)?.[1]);

  const start = useMut(async () => {
    const areaName = CATEGORIES.find(([c]) => c === category)?.[1];
    const area = (areas.data || []).find((a) => a.name === areaName) || (areas.data || []).find((a) => a.name === "General advisory");
    if (!area) throw new Error("Practice areas aren't set up yet.");
    const res = await api.post("/urgent-requests", { accountId: activeAccount?.id, routedPracticeAreaId: area.id, description: `Urgent: ${category}`, urgency: "today", mode: "phone", language: "en" });
    if (res.status !== "none_available") await api.post(`/intake-requests/${res.intake.id}/consent`);
    return res;
  }, { onSuccess: (res) => { if (res.status === "none_available") setPhase("none"); else { setLive({ intakeId: res.intake.id, startedAt: Date.now() }); setPhase("live"); } } });

  const title = { danger: "Is anyone in immediate danger?", category: "What's happening?", live: "Finding an advocate", none: "No advocate immediately available" }[phase];

  return (
    <ModalShell kicker="Urgent help" title={title} onClose={closeModal} width={520}>
      {phase === "danger" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Callout tone="danger">If anyone is in immediate physical danger, call emergency services now.</Callout>
          <a href="tel:112" style={{ display: "block", textAlign: "center", background: "#DB4F35", color: "#fff", padding: 14, borderRadius: 10, fontWeight: 700, textDecoration: "none" }}>Call 112 now</a>
          <Button onClick={() => setPhase("category")}>No immediate danger — continue</Button>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>You have the right to inform someone of your choice and to consult a lawyer.</div>
        </div>
      )}
      {phase === "category" && (
        <QueryBoundary query={areas}>
          {() => (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                {CATEGORIES.map(([c]) => (
                  <button key={c} onClick={() => setCategory(c)} style={{ padding: 14, borderRadius: 10, border: `1.5px solid ${category === c ? "var(--color-navy)" : "var(--color-border)"}`, background: category === c ? "#F1EFE6" : "#fff", cursor: "pointer", textAlign: "left", fontSize: 13 }}>{c}</button>
                ))}
              </div>
              <label style={{ display: "flex", gap: 8, fontSize: 12.5, alignItems: "flex-start" }}>
                <input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); setValidationError(""); }} style={{ marginTop: 3 }} />
                I consent to sharing this category with an available advocate after their conflict check clears.
              </label>
              {validationError && <Callout tone="danger">{validationError}</Callout>}
              <Button
                variant="danger"
                onClick={() => {
                  if (!category) return setValidationError("Choose what's happening first.");
                  if (!consent) return setValidationError("Please tick the consent box so an advocate can review your category.");
                  setValidationError("");
                  start.mutate();
                }}
                disabled={start.isPending}
              >
                {start.isPending ? "Searching…" : "Find an advocate now"}
              </Button>
            </div>
          )}
        </QueryBoundary>
      )}
      {phase === "live" && live && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <LiveConsult intakeId={live.intakeId} startedAt={live.startedAt} tone="light" onCancelled={closeModal} onGone={() => setPhase("category")} />
          <Callout tone="neutral" title="While you wait">You may remain silent beyond identifying yourself. Ask for a copy of any document you're asked to sign. Note the time, place and names of anyone present.</Callout>
        </div>
      )}
      {phase === "none" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <NoAdvocatesFallback accountId={activeAccount?.id} practiceAreaId={matchedArea?.id} title="No advocate who accepts urgent requests is available for this category right now" />
          <Button variant="outline" onClick={() => setPhase("category")}>Search again</Button>
        </div>
      )}
    </ModalShell>
  );
}
