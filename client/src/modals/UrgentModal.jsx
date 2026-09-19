import { useEffect, useRef, useState } from "react";
import { useAppState } from "../state/AppState";
import { ModalShell } from "../components/Modal";
import { Button, Callout, ProgressBar, AvatarTile } from "../components/ui";

const CATEGORIES = ["Police / detention", "Arrest / search", "Domestic violence", "Accident", "Airport / immigration", "Court deadline", "Urgent business injunction", "Other"];

export function UrgentModal() {
  const { act } = useAppState();
  const [phase, setPhase] = useState("danger");
  const [category, setCategory] = useState("");
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function startMatch(cat) {
    setCategory(cat);
    setPhase("matching1");
    timers.current.push(setTimeout(() => setPhase("matching2"), 2000));
    timers.current.push(setTimeout(() => setPhase(Math.random() > 0.15 ? "matched" : "none"), 4200));
  }

  return (
    <ModalShell kicker="Urgent help" title={{ danger: "Is anyone in immediate danger?", category: "What's happening?", matching1: "Finding an advocate", matching2: "Finding an advocate", matched: "Advocate matched", none: "No advocate immediately available" }[phase]} onClose={act.closeModal} width={520}>
      {phase === "danger" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Callout tone="danger">If anyone is in immediate physical danger, call emergency services now.</Callout>
          <a href="tel:112" style={{ display: "block", textAlign: "center", background: "#DB4F35", color: "#fff", padding: 14, borderRadius: 10, fontWeight: 700, textDecoration: "none" }}>Call 112 now</a>
          <Button onClick={() => setPhase("category")}>No immediate danger — continue</Button>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>You have the right to inform someone of your choice and to consult a lawyer.</div>
        </div>
      )}
      {phase === "category" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          {CATEGORIES.map((c) => <button key={c} onClick={() => startMatch(c)} style={{ padding: 14, borderRadius: 10, border: "1px solid var(--color-border)", background: "#fff", cursor: "pointer", textAlign: "left", fontSize: 13 }}>{c}</button>)}
        </div>
      )}
      {(phase === "matching1" || phase === "matching2") && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 13 }}>{phase === "matching1" ? "Searching now…" : "Advocate reviewing your request (running conflict check)…"}</div>
          <ProgressBar pct={phase === "matching1" ? 30 : 68} tone="coral" />
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Category: {category} · Response target under 4 minutes</div>
          <Callout tone="neutral" title="While you wait">You may remain silent beyond identifying yourself. Ask for a copy of any document you're asked to sign. Note the time, place and names of anyone present.</Callout>
        </div>
      )}
      {phase === "matched" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <AvatarTile initials="AK" />
            <div><div style={{ fontWeight: 700 }}>Adv. Aparna Kulkarni</div><div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Criminal defence · Mumbai</div></div>
          </div>
          <Callout tone="success">Conflict check clear. Matched on urgent category and availability.</Callout>
          <div style={{ fontWeight: 700 }}>₹3,540 incl. fees & GST</div>
          <Button variant="danger" onClick={() => { act.closeModal(); act.talkNowWith("aparna"); act.showToast("Connected. Recording is off by default."); }}>Start secure call now</Button>
        </div>
      )}
      {phase === "none" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Callout tone="warning">No advocate is immediately available for this category.</Callout>
          <Button onClick={() => { act.closeModal(); act.showToast("Duty advocate callback scheduled — approximately 9 minutes."); }}>Connect duty advocate · ~9 min</Button>
          <Button variant="outline" onClick={() => setPhase("category")}>Search again</Button>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Free legal aid: State Legal Services Authority helpline · 15100</div>
        </div>
      )}
    </ModalShell>
  );
}
