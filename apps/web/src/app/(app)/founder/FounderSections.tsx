import type { CSSProperties } from "react";
import type {
  AdvocatePerformanceDto,
  AiPerformanceDto,
  CorporateDto,
  DemandDto,
  FunnelDto,
  OverviewDto,
  RevenueDto,
  ServicePerformanceDto,
} from "@vidhira/contracts";
import { Card, Badge, Callout } from "@/components/ui";
import { inr } from "@/lib/format";

// Ported from frontend/src/screens/CommandCentre.jsx. Purely presentational (no mutations on
// this whole surface except fcomplaints, which reuses ComplaintsListClient directly) so none
// of this needs "use client".

type Metric = { label: string; value: number | string | null; money?: boolean; invert?: boolean; suffix?: string; note?: string | null };

function MetricTile({ m }: { m: Metric }) {
  const v = m.value === null || m.value === undefined ? "—" : m.money ? inr(Number(m.value)) : `${typeof m.value === "number" ? m.value.toLocaleString("en-IN") : m.value}${m.suffix || ""}`;
  return (
    <Card style={{ padding: 14 }}>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 19, color: m.invert && Number(m.value) > 0 ? "#B23A22" : "inherit" }}>{v}</div>
      <div style={{ fontSize: 10.5, color: "var(--color-text-muted)" }}>
        {m.label}
        {m.note ? ` · ${m.note}` : ""}
      </div>
    </Card>
  );
}

function Bars({ rows, color = "#4B3F86" }: { rows: Array<[string, number]>; color?: string }) {
  const max = Math.max(...rows.map((r) => r[1]), 1);
  return (
    <>
      {rows.map(([label, v]) => (
        <div key={label} style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
            <span>{label}</span>
            <span>{v}</span>
          </div>
          <div style={{ height: 6, background: "#F1EFE6", borderRadius: 999 }}>
            <div style={{ height: "100%", width: `${(v / max) * 100}%`, background: color, borderRadius: 999 }} />
          </div>
        </div>
      ))}
    </>
  );
}

export function Overview({ p }: { p: OverviewDto }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card style={{ padding: 16, background: "var(--color-navy)", color: "#fff" }}>
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>{p.briefing}</div>
      </Card>
      {p.groups.map((g) => (
        <div key={g.group}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>{g.group}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            {g.metrics.map((m) => (
              <MetricTile key={m.label} m={m} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Demand({ p }: { p: DemandDto }) {
  const max = Math.max(...p.daily, 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card style={{ padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Daily requests — last 30 days</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 140 }}>
          {p.daily.map((v, i) => (
            <div key={i} title={`${p.dailyLabels[i]}: ${v}`} style={{ flex: 1, height: `${Math.max((v / max) * 100, v ? 3 : 0)}%`, background: "#4B3F86", borderRadius: 2 }} />
          ))}
        </div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
        {p.charts.map((c) => (
          <Card key={c.title} style={{ padding: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 10 }}>{c.title}</div>
            {c.rows.length ? <Bars rows={c.rows} /> : <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>No data yet.</div>}
          </Card>
        ))}
      </div>
    </div>
  );
}

const th: CSSProperties = { textAlign: "left", padding: 8, border: "1px solid #EDE5D8", fontSize: 12 };
const td: CSSProperties = { padding: 8, border: "1px solid #EDE5D8", fontFamily: "var(--font-mono)", fontSize: 12.5 };

export function Services({ p }: { p: ServicePerformanceDto }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#F1EFE6" }}>
            {["Service", "Enquiries", "Started", "Completed", "Abandoned", "Conversion", "Revenue", "ASP", "CSAT"].map((c) => (
              <th key={c} style={th}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {p.rows.map((r) => (
            <tr key={r.service}>
              <td style={{ ...td, fontFamily: "var(--font-sans)" }}>{r.service}</td>
              <td style={td}>{r.enquiries}</td>
              <td style={td}>{r.started}</td>
              <td style={td}>{r.completed}</td>
              <td style={td}>{r.abandoned}</td>
              <td style={td}>{r.conversion === null ? "—" : `${r.conversion}%`}</td>
              <td style={td}>{r.revenue ? inr(r.revenue) : "—"}</td>
              <td style={td}>{r.asp ? inr(r.asp) : "—"}</td>
              <td style={td}>{r.csat ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 8 }}>
        Abandoned = cancelled consultations, drafts never issued, or orders unpaid after 7 days. Revenue is gross fees from paid items.
      </div>
    </div>
  );
}

export function Funnel({ p }: { p: FunnelDto }) {
  const max = Math.max(p.stages[0]?.count || 0, 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 640 }}>
      {p.stages.map((s, i) => (
        <Card key={s.stage} style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
            <span>{s.stage}</span>
            <span>
              {s.count.toLocaleString("en-IN")}
              {i > 0 && p.stages[i - 1]!.count ? ` · ${Math.round((s.count / p.stages[i - 1]!.count) * 100)}% of previous` : ""}
            </span>
          </div>
          <div style={{ height: 8, background: "#F1EFE6", borderRadius: 999, marginTop: 6 }}>
            <div style={{ height: "100%", width: `${(s.count / max) * 100}%`, background: "#4B3F86", borderRadius: 999 }} />
          </div>
        </Card>
      ))}
      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
        {p.delivered} consultations/orders delivered. {p.note}
      </div>
    </div>
  );
}

export function Revenue({ p }: { p: RevenueDto }) {
  const max = Math.max(...p.monthly.map((m) => m.gmv), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        {p.kpis.map((k) => (
          <MetricTile key={k.label} m={k} />
        ))}
      </div>
      <Card style={{ padding: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 12.5 }}>Gross transaction value by month (₹)</div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", height: 130 }}>
          {p.monthly.map((m) => (
            <div key={m.month} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ height: `${(m.gmv / max) * 100}px`, minHeight: m.gmv ? 3 : 0, background: "#4B3F86", borderRadius: 4 }} />
              <div style={{ fontSize: 10, marginTop: 4 }}>
                {m.month.slice(2)}
                <br />
                {m.gmv ? inr(m.gmv) : "—"}
              </div>
            </div>
          ))}
        </div>
      </Card>
      {p.byKind.length > 0 && (
        <Card style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 10 }}>By type</div>
          <Bars rows={p.byKind.map((k) => [k.kind.replace("_", " "), k.amount])} />
        </Card>
      )}
    </div>
  );
}

export function Corporate({ p }: { p: CorporateDto }) {
  if (!p.accounts.length) {
    return (
      <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--color-text-muted)" }}>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 17, color: "var(--color-ink)", marginBottom: 6 }}>No business accounts yet</div>
        <div style={{ fontSize: 13 }}>Business accounts created from Profile appear here.</div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {p.accounts.map((a) => (
        <Card key={a.name} style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontWeight: 700 }}>{a.name.replace(/\s*\([0-9a-f]{6}\)$/, "")}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                {a.plan || "No plan"} · {a.seats}/{a.seatLimit} seats · last activity {a.lastActivity ? fmtDateShort(a.lastActivity) : "—"}
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginTop: 10, fontSize: 12 }}>
            {([
              ["Open matters", a.openMatters],
              ["Total matters", a.totalMatters],
              ["Legal spend", inr(a.legalSpend)],
              ["Outstanding", inr(a.outstanding)],
            ] as const).map(([k, v]) => (
              <div key={k} style={{ background: "#FBF8F2", borderRadius: 8, padding: 8 }}>
                <div style={{ fontWeight: 700 }}>{v}</div>
                <div style={{ color: "var(--color-text-muted)" }}>{k}</div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN");
}

export function Advocates({ p }: { p: AdvocatePerformanceDto }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Callout tone="info">Internal only. None of these figures are shown to clients or to the advocates themselves.</Callout>
      {p.rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--color-text-muted)" }}>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 17, color: "var(--color-ink)", marginBottom: 6 }}>No verified advocates yet</div>
          <div style={{ fontSize: 13 }}>Figures appear once advocates are verified and receive requests.</div>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F1EFE6" }}>
                {["Advocate", "Status", "Received", "Accepted", "Declined", "Completed", "Converted", "Fees billed", "CSAT"].map((c) => (
                  <th key={c} style={th}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {p.rows.map((r) => (
                <tr key={r.id} style={{ color: r.csat !== null && r.csat < 4.3 ? "#B23A22" : "inherit" }}>
                  <td style={{ ...td, fontFamily: "var(--font-sans)" }}>{r.name}</td>
                  <td style={td}>{r.status}</td>
                  <td style={td}>{r.received}</td>
                  <td style={td}>{r.accepted}</td>
                  <td style={td}>{r.declined}</td>
                  <td style={td}>{r.completed}</td>
                  <td style={td}>{r.converted}</td>
                  <td style={td}>{inr(r.feesBilled)}</td>
                  <td style={td}>{r.csat === null ? "—" : `${r.csat} (${r.ratings})`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function Ai({ p }: { p: AiPerformanceDto }) {
  const kbEnabled = (p.knowledgeBase as { enabled?: boolean })?.enabled;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        {p.kpis.map((k) => (
          <MetricTile key={k.label} m={k} />
        ))}
      </div>
      {!kbEnabled && <Callout tone="warning">The knowledge base is not configured (QDRANT_URL / OPENROUTER_API_KEY).</Callout>}
      <div>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Legal knowledge gaps</div>
        {p.gaps.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>No unanswered topics in the last 90 days.</div>
        ) : (
          p.gaps.map((g) => (
            <Card key={g.topic} style={{ padding: 16, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 600 }}>
                  {g.topic} · {g.asked} asked
                </div>
                <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>e.g. &ldquo;{g.example}&rdquo;</div>
              </div>
              <Badge tone={g.asked >= 5 ? "danger" : g.asked >= 2 ? "warning" : "neutral"}>{g.asked >= 5 ? "INDEX FIRST" : g.asked >= 2 ? "HIGH" : "MEDIUM"}</Badge>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
