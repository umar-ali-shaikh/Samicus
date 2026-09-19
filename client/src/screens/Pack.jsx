import { useAppState } from "../state/AppState";
import { PACK_CATEGORIES, PACK_SCAN } from "../data/mockData";
import { Card, Pill, Badge, Button, Callout } from "../components/ui";

const STATUS_TONE = { pass: "success", non_compliant: "danger", incomplete: "warning" };
const VERDICT_TONE = { defensible: "success", needs_substantiation: "warning", high_risk: "danger" };

export function Pack() {
  const { state, act } = useAppState();
  const scan = PACK_SCAN;

  return (
    <div style={{ maxWidth: 800, display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 22 }}>Pack compliance</div>
        <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>PackCheck is compliance QA on a document — not legal representation.</div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {PACK_CATEGORIES.map((c) => (
          <Pill key={c.id} active={state.packCat === c.id} onClick={() => act.setPackCat(c.id)}>{c.label}</Pill>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>Adds: {PACK_CATEGORIES.find((c) => c.id === state.packCat)?.extra}</div>

      {state.packStage === "scanning" && <Card>Extracting text and panel geometry…</Card>}

      {state.packStage === "done" && (
        <>
          <Card style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 700 }}>{scan.product} · {scan.sku}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{scan.ruleset}</div>
            </div>
            <Badge tone="danger">1 FAIL</Badge>
          </Card>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["Declarations", "Claims", "Rule drift", "Portfolio"].map((t) => <Pill key={t} active={state.packTab === t} onClick={() => act.setPackTab(t)}>{t}</Pill>)}
          </div>

          {state.packTab === "Declarations" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {scan.declarations.map((d, i) => {
                const fixed = state.packFixed[d.k];
                const status = fixed ? "pass" : d.status;
                return (
                  <Card key={i} style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{d.k}</div>
                      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{d.found} · {d.rule}</div>
                      {d.note && !fixed && <div style={{ fontSize: 11.5, color: "var(--color-rust)" }}>{d.note}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <Badge tone={STATUS_TONE[status]}>{status.replace("_", " ").toUpperCase()}</Badge>
                      {d.status === "non_compliant" && !fixed && <Button variant="outline" onClick={() => act.markFixed(d.k)}>Mark as corrected</Button>}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {state.packTab === "Claims" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {scan.claims.map((c, i) => (
                <Card key={i}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap" }}>
                    <div style={{ fontStyle: "italic" }}>"{c.text}"</div>
                    <Badge tone={VERDICT_TONE[c.verdict]}>{c.verdict.replace(/_/g, " ").toUpperCase()}</Badge>
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginTop: 6 }}>{c.body}</div>
                  {c.safer && <Callout tone="success" style={{ marginTop: 8 }} title="Safer phrasing">{c.safer}</Callout>}
                </Card>
              ))}
              <div>
                <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 6 }}>What happened to comparable claims</div>
                {scan.precedent.map((p, i) => (
                  <div key={i} style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{p.who} ({p.year}): {p.what} → {p.outcome}</div>
                ))}
              </div>
            </div>
          )}

          {state.packTab === "Rule drift" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Callout tone="warning">Approved packs can go non-compliant when rules change. Your approval is pinned to the ruleset version it was checked against, and re-flagged automatically.</Callout>
              {scan.drift.map((d, i) => (
                <Card key={i}><div style={{ fontWeight: 600 }}>{d.date}</div><div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>{d.change} · Affects: {d.affects}</div></Card>
              ))}
            </div>
          )}

          {state.packTab === "Portfolio" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {scan.portfolio.map((p, i) => (
                <Card key={i} style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap" }}>
                  <div><div style={{ fontWeight: 600 }}>{p.name} · {p.sku}</div><div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>Pinned ruleset {p.pinned}{p.recheck && ` · ${p.recheck}`}</div></div>
                  <Badge tone={STATUS_TONE[p.status] || "neutral"}>{p.status.toUpperCase()}</Badge>
                </Card>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <Button onClick={act.exportPackReport}>Export compliance report for sign-off</Button>
            <Button variant="outline" onClick={act.rescanPack}>Scan new artwork</Button>
          </div>
        </>
      )}
    </div>
  );
}
