import { useAppState, computeFees } from "../state/AppState";
import { LAWYERS } from "../data/mockData";
import { Card, Button, Callout, ProgressBar, AvatarTile } from "../components/ui";

export function TalkNow() {
  const { state, act } = useAppState();
  const { stage, fields, lawyerId } = state.talkNow;
  const lawyer = LAWYERS.find((l) => l.id === lawyerId) || LAWYERS[0];
  const fees = computeFees(lawyer.fee);

  return (
    <div>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, marginBottom: 4 }}>Talk now</div>
      <div style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginBottom: 16 }}>Only category and city are shared before the conflict check clears.</div>

      {stage === "setup" && (
        <Card style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 12 }}>
          <textarea value={fields.situation || ""} onChange={(e) => act.setTalkField("situation", e.target.value)} rows={3} placeholder="What's going on?" style={{ padding: 12, borderRadius: 10, border: "1px solid var(--color-border)" }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
            <select value={fields.urgency || "today"} onChange={(e) => act.setTalkField("urgency", e.target.value)} style={{ padding: 10, borderRadius: 9, border: "1px solid var(--color-border)" }}>
              <option value="today">Today</option><option value="48h">Within 48h</option>
            </select>
            <select value={fields.mode || "video"} onChange={(e) => act.setTalkField("mode", e.target.value)} style={{ padding: 10, borderRadius: 9, border: "1px solid var(--color-border)" }}>
              <option value="video">Video</option><option value="phone">Phone</option><option value="chat">Chat</option>
            </select>
          </div>
          <div style={{ fontSize: 13 }}>Estimated fee: ₹{fees.total}</div>
          <Button onClick={act.startMatch}>Find an available advocate</Button>
          <div style={{ fontSize: 11.5, color: "var(--color-label)" }}>Only category and city are shared pre-conflict-check.</div>
        </Card>
      )}

      {stage === "searching" && (
        <Card style={{ maxWidth: 560, background: "var(--color-navy)", color: "#fff", display: "flex", flexDirection: "column", gap: 12 }}>
          <div>Searching for an available advocate…</div>
          <ProgressBar pct={34} tone="mint" />
          <div style={{ fontSize: 12, color: "#9AA5BC" }}>Request created → Available advocates identified</div>
          <Button variant="outline" onClick={act.cancelMatch}>Cancel request</Button>
        </Card>
      )}

      {stage === "reviewing" && (
        <Card style={{ maxWidth: 560, background: "var(--color-navy)", color: "#fff", display: "flex", flexDirection: "column", gap: 12 }}>
          <div>Advocate reviewing your request (running conflict check)…</div>
          <ProgressBar pct={72} tone="mint" />
          <div style={{ fontSize: 12, color: "#9AA5BC" }}>Conflict check → Advocate accepted</div>
          <Button variant="outline" onClick={act.cancelMatch}>Cancel request</Button>
        </Card>
      )}

      {stage === "matched" && (
        <Card style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 12 }}>
          <Callout tone="success">Advocate matched · conflict check cleared</Callout>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <AvatarTile initials={lawyer.initials} />
            <div><div style={{ fontWeight: 700 }}>{lawyer.name}</div><div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{lawyer.whyMatch}</div></div>
          </div>
          <div style={{ fontWeight: 700 }}>₹{fees.total} total (incl. platform fee & GST)</div>
          <div style={{ display: "flex", gap: 10 }}>
            <Button onClick={act.connectNow}>Pay & start</Button>
            <Button variant="outline" onClick={() => act.openLawyer(lawyer.id)}>View profile</Button>
            <Button variant="ghost" onClick={act.cancelMatch}>Not now</Button>
          </div>
        </Card>
      )}

      {stage === "live" && (
        <Card style={{ maxWidth: 560, background: "var(--color-navy)", color: "#fff", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap" }}>
            <div style={{ background: "#182338", borderRadius: 10, height: 140, flex: 1, marginRight: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>You</div>
            <div style={{ background: "#182338", borderRadius: 10, height: 140, flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>{lawyer.name}</div>
          </div>
          <div style={{ textAlign: "center", fontFamily: "var(--font-mono)" }}>Recording is off by default</div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <Button variant="outline" onClick={act.convertMatter}>End & convert to tracked matter</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
