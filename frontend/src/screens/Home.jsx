import { useAppState } from "../state/AppState";
import { SITUATIONS, MATTERS, TASKS } from "../data/mockData";
import { Card, Callout, ProgressBar, Badge } from "../components/ui";
import { STAGES } from "../data/mockData";

const TILES = [
  { tab: "talknow", label: "Talk now", sub: "Instant consultation" },
  { tab: "find", label: "Book", sub: "Schedule an advocate" },
  { tab: "documents", label: "Documents", sub: "Your document library" },
  { tab: "services", label: "Services", sub: "Fixed-fee legal work" },
  { tab: "draft", label: "Draft", sub: "Generate a document" },
];

export function Home() {
  const { state, act } = useAppState();
  const isBusiness = state.account === "business";
  const matters = MATTERS.filter((m) => m.forBusiness === isBusiness);
  const tasks = TASKS.filter((t) => matters.some((m) => m.id === t.matter)).slice(0, 3);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 24 }}>Hello, {isBusiness ? "Verdanta Foods" : "Meera Raghavan"}</div>
        <Badge tone="info">Secure & confidential intake</Badge>
      </div>

      <Card style={{ background: "var(--color-navy)", color: "#F6F1E8", border: "none" }}>
        <div style={{ fontSize: 13, marginBottom: 8 }}>What's going on? Describe it in your own words.</div>
        <textarea
          value={state.intake}
          onChange={(e) => act.setIntake(e.target.value)}
          rows={3}
          placeholder="e.g. My landlord is refusing to return my security deposit…"
          style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #2A3854", background: "#18233A", color: "#fff", resize: "vertical" }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={act.voice} style={{ background: "#182338", border: "1px solid #2A3854", color: "#F6F1E8", borderRadius: 9, padding: "8px 12px", fontSize: 12, cursor: "pointer" }}>🎙 Voice</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          {SITUATIONS.slice(0, 8).map((s) => (
            <button key={s.id} onClick={() => act.routeSituation(s)} style={{ padding: "6px 12px", borderRadius: 999, border: "1px solid #2A3854", background: "#182338", color: "#F6F1E8", fontSize: 12, cursor: "pointer" }}>
              {state.lang === "hi" ? s.hi : s.en}
            </button>
          ))}
        </div>
        <button onClick={() => act.openBooking()} style={{ marginTop: 12, background: "var(--color-gold)", color: "var(--color-navy)", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 700, cursor: "pointer" }}>
          Get matched with an advocate
        </button>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        {TILES.map((t) => (
          <button key={t.tab} onClick={() => act.go(t.tab)} style={{ textAlign: "left", padding: 14, borderRadius: 12, border: "1px solid var(--color-border)", background: "#fff", cursor: "pointer" }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{t.label}</div>
            <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{t.sub}</div>
          </button>
        ))}
      </div>

      <Callout tone="danger">
        Time-critical matter? <button onClick={act.openUrgent} style={{ background: "none", border: "none", color: "#8E2C18", fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>Get urgent help now</button>
      </Callout>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <div style={{ flex: 2, minWidth: 280 }}>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 17, marginBottom: 10 }}>Active matters</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {matters.map((m) => (
              <Card key={m.id} style={{ cursor: "pointer" }} onClick={() => act.openMatter(m.id)}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 700 }}>{m.title}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{m.ref}</div>
                </div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "6px 0" }}>{STAGES[m.stage - 1]} · {m.nextAction}</div>
                <ProgressBar pct={(m.stage / STAGES.length) * 100} />
              </Card>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 17, marginBottom: 10 }}>Tasks</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {tasks.map((t) => (
              <Card key={t.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={!!state.tasksDone[t.id]} onChange={() => act.toggleTask(t.id)} />
                <div style={{ fontSize: 12.5, textDecoration: state.tasksDone[t.id] ? "line-through" : "none" }}>{t.label}</div>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {isBusiness && (
        <Card>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 16, marginBottom: 8 }}>Business Legal Desk</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, fontSize: 12.5, marginBottom: 12 }}>
            {["Contract review", "Trademark & IP", "Employment law", "Vendor disputes", "Notices & recoveries", "Compliance desk"].map((l) => (
              <div key={l} style={{ padding: 10, border: "1px solid var(--color-border)", borderRadius: 9 }}>{l}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
            {[["Legal spend FY", "₹6.2L"], ["Retainer", "₹35,000/mo"], ["Open matters", "3"], ["Avg. response", "8 min"]].map(([l, v]) => (
              <div key={l} style={{ background: "#FBF8F2", border: "1px solid var(--color-border)", borderRadius: 9, padding: 10, textAlign: "center" }}>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 17 }}>{v}</div>
                <div style={{ fontSize: 10.5, color: "var(--color-label)" }}>{l}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <Card style={{ cursor: "pointer" }} onClick={() => act.go("research")}><div style={{ fontWeight: 700 }}>Research</div><div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Free, cited legal answers</div></Card>
        <Card style={{ cursor: "pointer" }} onClick={() => act.go("draft")}><div style={{ fontWeight: 700 }}>Draft / review agreement</div><div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Generate a document</div></Card>
        <Card style={{ cursor: "pointer" }} onClick={() => act.go("learn")}><div style={{ fontWeight: 700 }}>Ask anonymously</div><div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Post a public question</div></Card>
      </div>

      <Callout tone="neutral" title="Legal aid">You may be eligible for free legal aid under the Legal Services Authorities Act 1987. <button onClick={() => act.showToast("Eligibility check opened.")} style={{ background: "none", border: "none", color: "var(--color-rust)", cursor: "pointer", textDecoration: "underline" }}>Check eligibility</button></Callout>
    </div>
  );
}
