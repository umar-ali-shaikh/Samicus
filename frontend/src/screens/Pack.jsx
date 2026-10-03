import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useGet, useMut } from "../api/hooks";
import { api } from "../lib/api";
import { Card, Pill, Badge, Button, Callout, QueryBoundary, EmptyState } from "../components/ui";
import { PageHeader } from "../components/PageHeader";
import { TextInput, TextArea } from "../components/forms";
import { fmtDate } from "../lib/format";

const STATUS_TONE = { pass: "success", non_compliant: "danger", incomplete: "warning", fail: "danger", warn: "warning" };
const VERDICT_TONE = { defensible: "success", needs_substantiation: "warning", high_risk: "danger" };

function ScanResult({ scan, onNew }) {
  const [tab, setTab] = useState("Declarations");
  const approve = useMut(() => api.post(`/pack/scans/${scan.id}/approve`), { invalidate: ["/pack"], success: "Approved and pinned to this ruleset version." });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div><div style={{ fontWeight: 700 }}>{scan.product_name || scan.sku} · {scan.sku}</div><div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Ruleset v{scan.ruleset_version} · {fmtDate(scan.created_at)}</div></div>
        <Badge tone={STATUS_TONE[scan.status]}>{scan.status.toUpperCase()}</Badge>
      </Card>
      {scan.recheck_required && <Callout tone="warning" title="Re-check needed">{scan.recheck_reason}</Callout>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{["Declarations", "Claims"].map((t) => <Pill key={t} active={tab === t} onClick={() => setTab(t)}>{t}</Pill>)}</div>

      {tab === "Declarations" && scan.declaration_results.map((d) => (
        <Card key={d.key} style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontWeight: 600 }}>{d.label || d.key}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{d.extractedValue ? `“${d.extractedValue}” · ` : ""}{d.ruleRef}</div>
            {d.note && <div style={{ fontSize: 11.5, color: "var(--color-rust)" }}>{d.note}</div>}
          </div>
          <Badge tone={STATUS_TONE[d.status]}>{d.status.replace("_", " ").toUpperCase()}</Badge>
        </Card>
      ))}
      {tab === "Claims" && (scan.claim_results.length === 0 ? <EmptyState title="No claims entered" body="Add the marketing claims on the pack to check them." /> : scan.claim_results.map((c, i) => (
        <Card key={i}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}><div style={{ fontStyle: "italic" }}>“{c.text}”</div><Badge tone={VERDICT_TONE[c.verdict]}>{c.verdict.replace(/_/g, " ").toUpperCase()}</Badge></div>
          <div style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginTop: 6 }}>{c.why}{c.ruleRef ? ` (${c.ruleRef})` : ""}</div>
          {c.saferPhrasing && <Callout tone="success" style={{ marginTop: 8 }} title="Safer phrasing">{c.saferPhrasing}{c.saferRationale ? ` — ${c.saferRationale}` : ""}</Callout>}
        </Card>
      )))}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {scan.approved_at ? <Badge tone="success">Approved by {scan.approved_by} · {fmtDate(scan.approved_at)}</Badge> : <Button onClick={() => approve.mutate()} disabled={scan.status === "fail" || approve.isPending}>Approve for sign-off</Button>}
        {scan.status === "fail" && !scan.approved_at && <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Correct the failing declarations and scan again to approve.</span>}
        <Button variant="outline" onClick={onNew}>Scan another pack</Button>
      </div>
    </div>
  );
}

export function Pack() {
  const { activeAccount } = useAuth();
  const categories = useGet("/pack/categories");
  const portfolio = useGet("/pack/portfolio");
  const drift = useGet("/pack/drift");
  const [tab, setTab] = useState("Scan");
  const [categoryId, setCategoryId] = useState("");
  const [sku, setSku] = useState("");
  const [product, setProduct] = useState("");
  const [values, setValues] = useState({});
  const [claims, setClaims] = useState("");
  const [result, setResult] = useState(null);

  const category = (categories.data || []).find((c) => c.categoryId === categoryId);
  const scan = useMut(() => api.post("/pack/scans", {
    accountId: activeAccount?.id, sku, productName: product || undefined, categoryId, declarations: values, claims: claims.split("\n").map((s) => s.trim()).filter(Boolean),
  }), { invalidate: ["/pack"], onSuccess: setResult });

  return (
    <div style={{ maxWidth: 820, display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader title="Pack compliance" subtitle="PackCheck is compliance QA on what you declare from a pack — not legal representation. Rules are curated by our trust team and versioned." />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{["Scan", "Portfolio", "Rule drift"].map((t) => <Pill key={t} active={tab === t} onClick={() => { setTab(t); setResult(null); }}>{t}</Pill>)}</div>

      {tab === "Scan" && (result ? <ScanResult scan={result} onNew={() => { setResult(null); setValues({}); setClaims(""); }} /> : (
        <QueryBoundary query={categories} empty={<EmptyState title="No rulesets published yet" body="Compliance rulesets are added by the trust team. Check back soon." />}>
          {(list) => (
            <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{list.map((c) => <Pill key={c.categoryId} active={categoryId === c.categoryId} onClick={() => { setCategoryId(c.categoryId); setValues({}); }}>{c.categoryName} · v{c.currentVersion}</Pill>)}</div>
              {category && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
                    <TextInput label="SKU" value={sku} onChange={(e) => setSku(e.target.value)} />
                    <TextInput label="Product name (optional)" value={product} onChange={(e) => setProduct(e.target.value)} />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>Declarations as printed on the pack</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                    {category.declarations.map((d) => <TextInput key={d.key} label={`${d.label || d.key}${d.required === false ? "" : " *"}`} value={values[d.key] || ""} onChange={(e) => setValues({ ...values, [d.key]: e.target.value })} hint={d.ruleRef} />)}
                  </div>
                  <TextArea label="Marketing claims on the pack (one per line)" rows={3} value={claims} onChange={(e) => setClaims(e.target.value)} />
                  <Button onClick={() => scan.mutate()} disabled={!sku.trim() || scan.isPending} style={{ alignSelf: "flex-start" }}>{scan.isPending ? "Checking…" : "Check compliance"}</Button>
                </>
              )}
            </Card>
          )}
        </QueryBoundary>
      ))}

      {tab === "Portfolio" && (
        <QueryBoundary query={portfolio} empty={<EmptyState title="No scans yet" body="Packs you check appear here with the ruleset version they were checked against." />}>
          {(list) => list.map((p) => (
            <Card key={p.id} style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, cursor: "pointer" }} onClick={() => { setResult(p); setTab("Scan"); }}>
              <div><div style={{ fontWeight: 600 }}>{p.product_name || p.sku} · {p.sku}</div><div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>Ruleset v{p.ruleset_version}{p.approved_at ? " · approved" : ""}{p.recheck_required ? ` · ${p.recheck_reason}` : ""}</div></div>
              <Badge tone={STATUS_TONE[p.status]}>{p.status.toUpperCase()}</Badge>
            </Card>
          ))}
        </QueryBoundary>
      )}

      {tab === "Rule drift" && (
        <QueryBoundary query={drift} empty={<EmptyState title="No rule changes" body="When a ruleset changes, approved packs pinned to the old version are flagged here." />}>
          {(list) => (
            <>
              <Callout tone="warning">Approved packs can go non-compliant when rules change. Each approval is pinned to the ruleset version it was checked against and re-flagged automatically.</Callout>
              {list.map((d) => (
                <Card key={d.id}>
                  <div style={{ fontWeight: 600 }}>{d.category_id} · v{d.from_version} → v{d.to_version} · {fmtDate(d.effective_from)}</div>
                  {d.changes.map((c, i) => <div key={i} style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>{c.summary}</div>)}
                  {d.affectedProducts.length > 0 && <div style={{ fontSize: 12, marginTop: 6 }}>Affects your products: {d.affectedProducts.map((p) => p.product_name || p.sku).join(", ")}</div>}
                </Card>
              ))}
            </>
          )}
        </QueryBoundary>
      )}
    </div>
  );
}
