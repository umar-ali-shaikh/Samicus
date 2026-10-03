import { useAppState } from "../state/AppState";
import { REVIEW_DOC } from "../data/mockData";
import { Card, Pill, Badge, Button, Callout, EmptyState } from "../components/ui";

const FAVOR_TONE = { drafter: "success", counterparty: "danger", balanced: "neutral" };

export function Review() {
  const { state, act } = useAppState();
  const d = REVIEW_DOC;
  const findings = state.revFilter === "All" ? d.findings : d.findings.filter((f) => (state.revFilter === "Favours you" ? f.favors === "drafter" : state.revFilter === "Favours them" ? f.favors === "counterparty" : f.favors === "balanced"));

  return (
    <div style={{ maxWidth: 800, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 22 }}>Contract review</div>
          <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>Comparison against a balanced baseline — not a legal opinion.</div>
        </div>
        <Button variant="outline" onClick={() => act.go("draft")}>Switch to Draft mode</Button>
      </div>

      <Card style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 700 }}>{d.name}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{d.type} vs {d.counterparty} · {d.pages} pages · scanned {d.scanned}</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Badge tone="danger">{d.findings.filter((f) => f.favors === "counterparty").length} favours them</Badge>
          <Badge tone="neutral">{d.findings.filter((f) => f.favors === "balanced").length} balanced</Badge>
          <Badge tone="success">{d.findings.filter((f) => f.favors === "drafter").length} favours you</Badge>
        </div>
      </Card>

      {state.revStage === "scanning" && <Card>Scanning contract…</Card>}

      {state.revStage === "done" && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["All", "Favours them", "Balanced", "Favours you"].map((f) => <Pill key={f} active={state.revFilter === f} onClick={() => act.setRevFilter(f)}>{f}</Pill>)}
          </div>
          {findings.length === 0 && <EmptyState title="No findings in this filter" body="Try a different filter." />}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {findings.map((f) => (
              <Card key={f.id}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 700 }}>{f.clause} <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>{f.ref}</span></div>
                  <Badge tone={FAVOR_TONE[f.favors]}>{f.favors}</Badge>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginTop: 6 }}>{f.found}</div>
                <Callout tone="neutral" style={{ marginTop: 8 }} title="Balanced baseline">{f.baseline}</Callout>
                {f.why && <Callout tone="warning" style={{ marginTop: 8 }} title="Why it matters">{f.why}</Callout>}
                {f.ask && <Callout tone="success" style={{ marginTop: 8 }} title="What to ask for">{f.ask}</Callout>}
              </Card>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Button onClick={act.exportRedline}>Export redline & negotiation note</Button>
            <Button variant="outline" onClick={act.reviewWithAdvocate}>Have an advocate review the redline</Button>
            <Button variant="ghost" onClick={act.rescanContract}>Re-scan</Button>
          </div>
        </>
      )}
    </div>
  );
}
