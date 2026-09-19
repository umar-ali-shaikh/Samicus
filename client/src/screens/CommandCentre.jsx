import { useState } from "react";
import { useAppState } from "../state/AppState";
import {
  SECTIONS, BRIEFING, ASK, KPI_GROUPS, DEMAND_DAILY, DEMAND_CHARTS, SERVICE_ROWS,
  FUNNEL_STAGES, REV_KPIS, REV_MONTHLY, CORP, ADV_ROWS, AI_KPIS, KNOWLEDGE_GAPS, CMP_KPIS, COMPLAINTS,
} from "../data/founderData";
import { Card, Badge, Button, Callout, Pill } from "../components/ui";

const BAND_TONE = { healthy: "success", watch: "warning", at_risk: "danger" };
const STATUS_TONE = { open: "warning", escalated: "danger", resolved: "success" };
const SEVERITY_COLOR = { low: "#8A8578", medium: "#B8863B", high: "#B23A22" };
const PRIORITY_TONE = { index_first: "danger", high: "warning", medium: "neutral" };

function Header({ tab }) {
  const [title, sub] = SECTIONS[tab];
  const { act } = useAppState();
  return (
    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 14, alignItems: "flex-end" }}>
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-label)" }}>Founder access · aggregated business data</div>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 26 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>{sub}</div>
      </div>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        {["Export to Excel", "Export to PDF", "Build management deck"].map((l) => (
          <button key={l} onClick={() => act.showToast(`${l} — generated.`)} style={{ background: "#fff", border: "1px solid var(--color-border)", borderRadius: 9, padding: "8px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{l}</button>
        ))}
      </div>
    </div>
  );
}

function FounderOverview() {
  const { act } = useAppState();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(null);

  function ask(q) {
    const qTokens = q.toLowerCase().split(/\s+/).filter((t) => t.length > 3);
    let best = null, bestScore = 0;
    for (const item of ASK) {
      const itemTokens = item.q.toLowerCase().split(/\s+/).filter((t) => t.length > 3);
      const overlap = qTokens.filter((t) => itemTokens.includes(t)).length;
      if (overlap > bestScore) { bestScore = overlap; best = item; }
    }
    setAnswer(bestScore > 0 ? { ok: true, ...best } : { ok: false });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card style={{ background: "var(--color-navy)", color: "#fff" }}>
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>{BRIEFING}</div>
        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {ASK.map((a) => <button key={a.q} onClick={() => { setQuestion(a.q); ask(a.q); }} style={{ padding: "6px 12px", borderRadius: 999, border: "1px solid #2A3854", background: "#182338", color: "#F6F1E8", fontSize: 11.5, cursor: "pointer" }}>{a.q}</button>)}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <input value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask(question)} placeholder="Ask the data…" style={{ flex: "1 1 160px", minWidth: 0, padding: 10, borderRadius: 9, border: "1px solid #2A3854", background: "#18233A", color: "#fff" }} />
          <Button onClick={() => ask(question)}>Ask</Button>
        </div>
        {answer && (
          <Callout tone={answer.ok ? "success" : "warning"} style={{ marginTop: 10 }}>
            {answer.ok ? answer.a : "This dashboard holds no figure for that. Rather than estimate, it says nothing."}
          </Callout>
        )}
      </Card>

      {KPI_GROUPS.map((g) => (
        <div key={g.group}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>{g.group}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            {g.metrics.map((m) => (
              <Card key={m.label}>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 19, color: m.invert ? "#B23A22" : "inherit" }}>{m.value}</div>
                <div style={{ fontSize: 10.5, color: "var(--color-text-muted)" }}>{m.label}</div>
              </Card>
            ))}
          </div>
        </div>
      ))}

      <Callout tone="info" title="Confidential matter contents">
        Privileged content is never exposed in analytics. Requesting access to a matter requires a stated reason and is always audit-logged, including denied attempts.
        <div style={{ marginTop: 8 }}>
          <Button variant="outline" onClick={() => { const reason = window.prompt("Reason for accessing this matter:"); act.showToast(reason ? "Access recorded and audit-logged." : "Empty reason — access denied and logged."); }}>Request access to a matter</Button>
        </div>
      </Callout>
    </div>
  );
}

function FounderDemand() {
  const max = Math.max(...DEMAND_DAILY, 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Daily requests — last 30 days</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 140 }}>
          {DEMAND_DAILY.map((v, i) => <div key={i} title={String(v)} style={{ flex: 1, height: `${(v / max) * 100}%`, background: "#4B3F86", borderRadius: 2 }} />)}
        </div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
        {DEMAND_CHARTS.map((c) => {
          const cmax = Math.max(...c.rows.map((r) => r[1]));
          return (
            <Card key={c.title}>
              <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 10 }}>{c.title}</div>
              {c.rows.map(([label, v]) => (
                <div key={label} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}><span>{label}</span><span>{v}</span></div>
                  <div style={{ height: 6, background: "#F1EFE6", borderRadius: 999 }}><div style={{ height: "100%", width: `${(v / cmax) * 100}%`, background: "#4B3F86", borderRadius: 999 }} /></div>
                </div>
              ))}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function FounderServices() {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, fontFamily: "var(--font-mono)" }}>
        <thead><tr style={{ background: "#F1EFE6" }}>{["Service", "Enquiries", "Started", "Completed", "Abandoned", "Conversion", "Revenue", "ASP", "Avg time", "CSAT"].map((c) => <th key={c} style={{ textAlign: "left", padding: 8, border: "1px solid #EDE5D8" }}>{c}</th>)}</tr></thead>
        <tbody>
          {SERVICE_ROWS.map((r) => (
            <tr key={r.service}>
              <td style={{ padding: 8, border: "1px solid #EDE5D8", fontFamily: "var(--font-sans)" }}>{r.service}</td>
              <td style={{ padding: 8, border: "1px solid #EDE5D8" }}>{r.enquiries}</td>
              <td style={{ padding: 8, border: "1px solid #EDE5D8" }}>{r.started}</td>
              <td style={{ padding: 8, border: "1px solid #EDE5D8" }}>{r.completed}</td>
              <td style={{ padding: 8, border: "1px solid #EDE5D8" }}>{r.abandoned}</td>
              <td style={{ padding: 8, border: "1px solid #EDE5D8" }}>{r.conv}%</td>
              <td style={{ padding: 8, border: "1px solid #EDE5D8" }}>{r.revenue ? `₹${r.revenue.toLocaleString()}` : "—"}</td>
              <td style={{ padding: 8, border: "1px solid #EDE5D8" }}>{r.asp ? `₹${r.asp}` : "—"}</td>
              <td style={{ padding: 8, border: "1px solid #EDE5D8" }}>{r.time}</td>
              <td style={{ padding: 8, border: "1px solid #EDE5D8" }}>{r.csat}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 8 }}>"Abandoned" = selected but unpaid after 7 days. "Avg time" = payment to delivery, excluding client waits.</div>
    </div>
  );
}

function FounderFunnel() {
  const [selected, setSelected] = useState(0);
  const max = FUNNEL_STAGES[0].count;
  const active = FUNNEL_STAGES[selected];
  return (
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 300, display: "flex", flexDirection: "column", gap: 8 }}>
        {FUNNEL_STAGES.map((s, i) => (
          <button key={s.stage} onClick={() => setSelected(i)} style={{ textAlign: "left", padding: 12, borderRadius: 10, border: `1px solid ${selected === i ? "#4B3F86" : "var(--color-border)"}`, background: "#fff", cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}><span>{s.stage}</span><span>{s.count.toLocaleString()}</span></div>
            <div style={{ height: 8, background: "#F1EFE6", borderRadius: 999, marginTop: 6 }}><div style={{ height: "100%", width: `${(s.count / max) * 100}%`, background: "#4B3F86", borderRadius: 999 }} /></div>
          </button>
        ))}
      </div>
      <div style={{ flex: "1 1 280px", minWidth: 0 }}>
        <Card>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>{active.stage}</div>
          {active.reasons.length ? active.reasons.map((r, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 600 }}><span>{r.reason}</span><span>{r.share}%</span></div>
              <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{r.evidence}</div>
            </div>
          )) : <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>No drop-off breakdown recorded for this stage.</div>}
        </Card>
      </div>
    </div>
  );
}

function FounderRevenue() {
  const max = Math.max(...REV_MONTHLY);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        {REV_KPIS.map(([l, v]) => <Card key={l}><div style={{ fontFamily: "var(--font-serif)", fontSize: 18 }}>{v}</div><div style={{ fontSize: 10.5, color: "var(--color-text-muted)" }}>{l}</div></Card>)}
      </div>
      <Card>
        <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 12.5 }}>Monthly platform revenue (₹ lakh)</div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", height: 120 }}>
          {REV_MONTHLY.map((v, i) => <div key={i} style={{ flex: 1, textAlign: "center" }}><div style={{ height: `${(v / max) * 100}px`, background: "#4B3F86", borderRadius: 4 }} /><div style={{ fontSize: 10, marginTop: 4 }}>{v}</div></div>)}
        </div>
      </Card>
    </div>
  );
}

function FounderCorporate() {
  const [openId, setOpenId] = useState(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {CORP.map((a) => (
        <Card key={a.name} style={{ cursor: "pointer" }} onClick={() => setOpenId(openId === a.name ? null : a.name)}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div><div style={{ fontWeight: 700 }}>{a.name}</div><div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{a.plan} · {a.seats} seats · renews {a.renewal}</div></div>
            <Badge tone={BAND_TONE[a.band]}>{a.band.replace("_", " ").toUpperCase()} · {a.score}</Badge>
          </div>
          {openId === a.name && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginTop: 12, fontSize: 12 }}>
                {Object.entries(a.metrics).map(([k, v]) => <div key={k} style={{ background: "#FBF8F2", borderRadius: 8, padding: 8 }}><div style={{ fontWeight: 700 }}>{v}</div><div style={{ color: "var(--color-text-muted)" }}>{k}</div></div>)}
              </div>
              <div style={{ fontSize: 12.5, marginTop: 10, color: "var(--color-text-muted)" }}>{a.risk}</div>
            </>
          )}
        </Card>
      ))}
    </div>
  );
}

function FounderAdvocates() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Callout tone="info">Internal only. None of these figures are shown to clients or to the advocates themselves.</Callout>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead><tr style={{ background: "#F1EFE6" }}>{["Advocate", "Status", "Received", "Accepted", "Declined", "Response", "Completed", "Converted", "Fees billed", "CSAT"].map((c) => <th key={c} style={{ textAlign: "left", padding: 8, border: "1px solid #EDE5D8" }}>{c}</th>)}</tr></thead>
          <tbody>
            {ADV_ROWS.map((r) => (
              <tr key={r.name} style={{ color: r.csat < 4.3 ? "#B23A22" : "inherit" }}>
                <td style={{ padding: 8, border: "1px solid #EDE5D8" }}>{r.name}</td>
                <td style={{ padding: 8, border: "1px solid #EDE5D8" }}>{r.status}</td>
                <td style={{ padding: 8, border: "1px solid #EDE5D8", fontFamily: "var(--font-mono)" }}>{r.received}</td>
                <td style={{ padding: 8, border: "1px solid #EDE5D8", fontFamily: "var(--font-mono)" }}>{r.accepted}</td>
                <td style={{ padding: 8, border: "1px solid #EDE5D8", fontFamily: "var(--font-mono)" }}>{r.declined}</td>
                <td style={{ padding: 8, border: "1px solid #EDE5D8", fontFamily: "var(--font-mono)" }}>{r.response}</td>
                <td style={{ padding: 8, border: "1px solid #EDE5D8", fontFamily: "var(--font-mono)" }}>{r.completed}</td>
                <td style={{ padding: 8, border: "1px solid #EDE5D8", fontFamily: "var(--font-mono)" }}>{r.converted}</td>
                <td style={{ padding: 8, border: "1px solid #EDE5D8", fontFamily: "var(--font-mono)" }}>{r.fees}</td>
                <td style={{ padding: 8, border: "1px solid #EDE5D8", fontFamily: "var(--font-mono)" }}>{r.csat}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FounderAi() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        {AI_KPIS.map(([l, v]) => <Card key={l}><div style={{ fontFamily: "var(--font-serif)", fontSize: 17 }}>{v}</div><div style={{ fontSize: 10.5, color: "var(--color-text-muted)" }}>{l}</div></Card>)}
      </div>
      <div>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Legal knowledge gap report</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {KNOWLEDGE_GAPS.map((g) => (
            <Card key={g.topic} style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div><div style={{ fontWeight: 600 }}>{g.topic} · {g.asked} asked</div><div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>Missing: {g.missing} · Source: {g.source}</div></div>
              <Badge tone={PRIORITY_TONE[g.priority]}>{g.priority.replace("_", " ").toUpperCase()}</Badge>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function FounderComplaints() {
  const [filter, setFilter] = useState("All");
  const filtered = COMPLAINTS.filter((c) => filter === "All" || (filter === "High severity" ? c.severity === "high" : c.status === filter.toLowerCase()));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        {CMP_KPIS.map(([l, v]) => <Card key={l}><div style={{ fontFamily: "var(--font-serif)", fontSize: 17 }}>{v}</div><div style={{ fontSize: 10.5, color: "var(--color-text-muted)" }}>{l}</div></Card>)}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{["All", "Open", "Escalated", "Resolved", "High severity"].map((f) => <Pill key={f} active={filter === f} onClick={() => setFilter(f)}>{f}</Pill>)}</div>
      {filtered.map((c) => (
        <Card key={c.ref} style={{ borderLeft: `4px solid ${SEVERITY_COLOR[c.severity]}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div><div style={{ fontWeight: 700 }}>{c.title}</div><div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{c.ref} · {c.category}</div></div>
            <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 6, fontSize: 12, marginTop: 10 }}>
            <div><strong>Service:</strong> {c.service}</div><div><strong>Owner:</strong> {c.owner}</div>
            <div><strong>Root cause:</strong> {c.cause}</div><div><strong>Corrective action:</strong> {c.action}</div>
          </div>
        </Card>
      ))}
    </div>
  );
}

export function CommandCentre({ tab }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Header tab={tab} />
      {tab === "founder" && <FounderOverview />}
      {tab === "fdemand" && <FounderDemand />}
      {tab === "fservices" && <FounderServices />}
      {tab === "ffunnel" && <FounderFunnel />}
      {tab === "frevenue" && <FounderRevenue />}
      {tab === "fcorp" && <FounderCorporate />}
      {tab === "fadv" && <FounderAdvocates />}
      {tab === "fai" && <FounderAi />}
      {tab === "fcomplaints" && <FounderComplaints />}
    </div>
  );
}
