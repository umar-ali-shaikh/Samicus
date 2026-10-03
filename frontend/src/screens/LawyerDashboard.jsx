import { useAppState } from "../state/AppState";
import { MATTERS } from "../data/mockData";
import { Card, Button, Badge, Callout } from "../components/ui";

export function LawyerDashboard() {
  const { state, act } = useAppState();
  const matters = MATTERS.filter((m) => m.lawyerId === "rohan");

  return (
    <div style={{ maxWidth: 1000, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 22 }}>Adv. Rohan Iyer</div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Bar Council of Karnataka · BE/1000/2010 · Contract & commercial recovery</div>
        </div>
        <Button variant={state.online ? "primary" : "outline"} onClick={() => act.set({ online: !state.online })}>{state.online ? "Accepting requests" : "Not accepting requests"}</Button>
      </div>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700 }}>Incoming request · Contract & commercial recovery · ₹3,200</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Facts withheld until conflict check clears. Expires in 3:42.</div>
          </div>
          <Badge tone={state.conflictRun ? "success" : "neutral"}>{state.conflictRun ? "Conflict check: clear" : "Conflict check: pending"}</Badge>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {!state.conflictRun && <Button variant="outline" onClick={act.runConflict}>Run conflict check</Button>}
          <Button onClick={act.acceptRequest} disabled={!state.conflictRun} style={{ opacity: state.conflictRun ? 1 : 0.5 }}>Accept request</Button>
          <Button variant="ghost" onClick={() => act.showToast("Declined. No reason recorded.")}>Decline without reason</Button>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <Card><div style={{ fontWeight: 700, marginBottom: 6 }}>Today</div><div style={{ fontSize: 12 }}>4 consultations scheduled</div><div style={{ fontSize: 12 }}>85% accepted</div><div style={{ fontSize: 12 }}>Avg response 6 min</div></Card>
        <Card><div style={{ fontWeight: 700, marginBottom: 6 }}>Active matters</div>{matters.map((m) => <div key={m.id} style={{ fontSize: 12 }}>{m.short}: {m.nextAction}</div>)}</Card>
        <Card><div style={{ fontWeight: 700, marginBottom: 6 }}>Needs review</div><div style={{ fontSize: 12 }}>2 documents</div><div style={{ fontSize: 12 }}>1 fee proposal pending</div><div style={{ fontSize: 12 }}>3 unread messages</div></Card>
        <Card><div style={{ fontWeight: 700, marginBottom: 6 }}>Payouts</div><div style={{ fontSize: 12 }}>₹1,84,000 cleared this month</div><div style={{ fontSize: 12 }}>₹42,000 in escrow</div><div style={{ fontSize: 12 }}>Next settlement 25 Sep</div></Card>
      </div>

      <Callout tone="neutral">Payouts, response time and conversion rate are tracked internally and never shown as a public ranking.</Callout>
    </div>
  );
}
