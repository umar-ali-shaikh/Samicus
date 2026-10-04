import { useGet } from "../api/hooks";
import { Card, Badge, Callout, QueryBoundary, EmptyState } from "../components/ui";
import { ComplaintList } from "./ComplaintsDesk";
import { inr, fmtDate } from "../lib/format";

const SECTIONS = {
  founder: ["Business Command Centre", "Every figure is aggregated from live data. Matter contents and privileged messages are never exposed here."],
  fdemand: ["Demand", "Where requests come from, when they arrive, and which services carry them."],
  fservices: ["Service performance", "Each service measured the same way: started, completed, abandoned, and what it earns."],
  ffunnel: ["User funnel", "From registration through to repeat payers."],
  frevenue: ["Revenue", "Gross transaction value and what the platform keeps."],
  fcorp: ["Corporate accounts", "Usage and spend for every business account."],
  fadv: ["Advocate performance", "Internal quality and responsiveness. Never a ranking, never shown to clients."],
  fai: ["AI performance", "How often the assistant answered, how often it said it lacked sources, and what it could not answer."],
  fcomplaints: ["Complaints", "Every complaint with its root cause and corrective action."],
};

const th = { textAlign: "left", padding: 8, border: "1px solid #EDE5D8", fontSize: 12 };
const td = { padding: 8, border: "1px solid #EDE5D8", fontFamily: "var(--font-mono)", fontSize: 12.5 };

function Metric({ m }) {
  const v = m.value === null || m.value === undefined ? "—" : m.money ? inr(m.value) : `${typeof m.value === "number" ? m.value.toLocaleString("en-IN") : m.value}${m.suffix || ""}`;
  return (
    <Card>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 19, color: m.invert && Number(m.value) > 0 ? "#B23A22" : "inherit" }}>{v}</div>
      <div style={{ fontSize: 10.5, color: "var(--color-text-muted)" }}>{m.label}{m.note ? ` · ${m.note}` : ""}</div>
    </Card>
  );
}

function Bars({ rows, color = "#4B3F86" }) {
  const max = Math.max(...rows.map((r) => r[1]), 1);
  return rows.map(([label, v]) => (
    <div key={label} style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}><span>{label}</span><span>{v}</span></div>
      <div style={{ height: 6, background: "#F1EFE6", borderRadius: 999 }}><div style={{ height: "100%", width: `${(v / max) * 100}%`, background: color, borderRadius: 999 }} /></div>
    </div>
  ));
}

function Overview({ p }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card style={{ background: "var(--color-navy)", color: "#fff" }}><div style={{ fontSize: 13, lineHeight: 1.6 }}>{p.briefing}</div></Card>
      {p.groups.map((g) => (
        <div key={g.group}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>{g.group}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>{g.metrics.map((m) => <Metric key={m.label} m={m} />)}</div>
        </div>
      ))}
    </div>
  );
}

function Demand({ p }) {
  const max = Math.max(...p.daily, 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Daily requests — last 30 days</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 140 }}>{p.daily.map((v, i) => <div key={i} title={`${p.dailyLabels[i]}: ${v}`} style={{ flex: 1, height: `${Math.max((v / max) * 100, v ? 3 : 0)}%`, background: "#4B3F86", borderRadius: 2 }} />)}</div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
        {p.charts.map((c) => <Card key={c.title}><div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 10 }}>{c.title}</div>{c.rows.length ? <Bars rows={c.rows} /> : <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>No data yet.</div>}</Card>)}
      </div>
    </div>
  );
}

function Services({ p }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ background: "#F1EFE6" }}>{["Service", "Enquiries", "Started", "Completed", "Abandoned", "Conversion", "Revenue", "ASP", "CSAT"].map((c) => <th key={c} style={th}>{c}</th>)}</tr></thead>
        <tbody>{p.rows.map((r) => (
          <tr key={r.service}>
            <td style={{ ...td, fontFamily: "var(--font-sans)" }}>{r.service}</td><td style={td}>{r.enquiries}</td><td style={td}>{r.started}</td><td style={td}>{r.completed}</td><td style={td}>{r.abandoned}</td>
            <td style={td}>{r.conversion === null ? "—" : `${r.conversion}%`}</td><td style={td}>{r.revenue ? inr(r.revenue) : "—"}</td><td style={td}>{r.asp ? inr(r.asp) : "—"}</td><td style={td}>{r.csat ?? "—"}</td>
          </tr>
        ))}</tbody>
      </table>
      <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 8 }}>Abandoned = cancelled consultations, drafts never issued, or orders unpaid after 7 days. Revenue is gross fees from paid items.</div>
    </div>
  );
}

function Funnel({ p }) {
  const max = Math.max(p.stages[0]?.count || 0, 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 640 }}>
      {p.stages.map((s, i) => (
        <Card key={s.stage}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}><span>{s.stage}</span><span>{s.count.toLocaleString("en-IN")}{i > 0 && p.stages[i - 1].count ? ` · ${Math.round((s.count / p.stages[i - 1].count) * 100)}% of previous` : ""}</span></div>
          <div style={{ height: 8, background: "#F1EFE6", borderRadius: 999, marginTop: 6 }}><div style={{ height: "100%", width: `${(s.count / max) * 100}%`, background: "#4B3F86", borderRadius: 999 }} /></div>
        </Card>
      ))}
      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{p.delivered} consultations/orders delivered. {p.note}</div>
    </div>
  );
}

function Revenue({ p }) {
  const max = Math.max(...p.monthly.map((m) => m.gmv), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>{p.kpis.map((k) => <Metric key={k.label} m={k} />)}</div>
      <Card>
        <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 12.5 }}>Gross transaction value by month (₹)</div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", height: 130 }}>{p.monthly.map((m) => <div key={m.month} style={{ flex: 1, textAlign: "center" }}><div style={{ height: `${(m.gmv / max) * 100}px`, minHeight: m.gmv ? 3 : 0, background: "#4B3F86", borderRadius: 4 }} /><div style={{ fontSize: 10, marginTop: 4 }}>{m.month.slice(2)}<br />{m.gmv ? inr(m.gmv) : "—"}</div></div>)}</div>
      </Card>
      {p.byKind.length > 0 && <Card><div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 10 }}>By type</div><Bars rows={p.byKind.map((k) => [k.kind.replace("_", " "), k.amount])} /></Card>}
    </div>
  );
}

function Corporate({ p }) {
  if (!p.accounts.length) return <EmptyState title="No business accounts yet" body="Business accounts created from Profile appear here." />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {p.accounts.map((a) => (
        <Card key={a.name}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}><div><div style={{ fontWeight: 700 }}>{a.name.replace(/\s*\([0-9a-f]{6}\)$/, "")}</div><div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{a.plan || "No plan"} · {a.seats}/{a.seatLimit} seats · last activity {a.lastActivity ? fmtDate(a.lastActivity) : "—"}</div></div></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginTop: 10, fontSize: 12 }}>
            {[["Open matters", a.openMatters], ["Total matters", a.totalMatters], ["Legal spend", inr(a.legalSpend)], ["Outstanding", inr(a.outstanding)]].map(([k, v]) => <div key={k} style={{ background: "#FBF8F2", borderRadius: 8, padding: 8 }}><div style={{ fontWeight: 700 }}>{v}</div><div style={{ color: "var(--color-text-muted)" }}>{k}</div></div>)}
          </div>
        </Card>
      ))}
    </div>
  );
}

function Advocates({ p }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Callout tone="info">Internal only. None of these figures are shown to clients or to the advocates themselves.</Callout>
      {p.rows.length === 0 ? <EmptyState title="No verified advocates yet" body="Figures appear once advocates are verified and receive requests." /> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#F1EFE6" }}>{["Advocate", "Status", "Received", "Accepted", "Declined", "Completed", "Converted", "Fees billed", "CSAT"].map((c) => <th key={c} style={th}>{c}</th>)}</tr></thead>
            <tbody>{p.rows.map((r) => (
              <tr key={r.name} style={{ color: r.csat !== null && r.csat < 4.3 ? "#B23A22" : "inherit" }}>
                <td style={{ ...td, fontFamily: "var(--font-sans)" }}>{r.name}</td><td style={td}>{r.status}</td><td style={td}>{r.received}</td><td style={td}>{r.accepted}</td><td style={td}>{r.declined}</td><td style={td}>{r.completed}</td><td style={td}>{r.converted}</td><td style={td}>{inr(r.feesBilled)}</td><td style={td}>{r.csat === null ? "—" : `${r.csat} (${r.ratings})`}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Ai({ p }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>{p.kpis.map((k) => <Metric key={k.label} m={k} />)}</div>
      {p.knowledgeBase && !p.knowledgeBase.enabled && <Callout tone="warning">The knowledge base is not configured (QDRANT_URL / OPENROUTER_API_KEY).</Callout>}
      <div>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Legal knowledge gaps</div>
        {p.gaps.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>No unanswered topics in the last 90 days.</div> : p.gaps.map((g) => (
          <Card key={g.topic} style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            <div><div style={{ fontWeight: 600 }}>{g.topic} · {g.asked} asked</div><div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>e.g. “{g.example}”</div></div>
            <Badge tone={g.asked >= 5 ? "danger" : g.asked >= 2 ? "warning" : "neutral"}>{g.asked >= 5 ? "INDEX FIRST" : g.asked >= 2 ? "HIGH" : "MEDIUM"}</Badge>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function CommandCentre({ tab }) {
  const data = useGet(`/admin/analytics/${tab}`, undefined, { refetchInterval: 60000 });
  const [title, sub] = SECTIONS[tab];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-label)" }}>Founder access · aggregated business data</div>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 26 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>{sub}</div>
        {data.data && <div style={{ fontSize: 11, color: "var(--color-label)", marginTop: 4 }}>Computed live · {new Date(data.data.refreshedAt).toLocaleTimeString("en-IN")}</div>}
      </div>
      {tab === "fcomplaints" ? <ComplaintList embedded /> : (
        <QueryBoundary query={data}>
          {(d) => {
            const p = d.payload;
            return { founder: <Overview p={p} />, fdemand: <Demand p={p} />, fservices: <Services p={p} />, ffunnel: <Funnel p={p} />, frevenue: <Revenue p={p} />, fcorp: <Corporate p={p} />, fadv: <Advocates p={p} />, fai: <Ai p={p} /> }[tab];
          }}
        </QueryBoundary>
      )}
    </div>
  );
}
