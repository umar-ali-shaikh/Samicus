"use client";

import { useState, useTransition } from "react";
import type { ClaimResultDto, DeclarationResultDto, PackCategoryDto, PackScanDto, RulesetDiffDto } from "@vidhira/contracts";
import { Card, Pill, Badge, Button, Callout, EmptyState } from "@/components/ui";
import { TextInput, TextArea } from "@/components/forms";
import { fmtDate } from "@/lib/format";
import { createPackScanAction, approvePackScanAction } from "@/server/packActions";

const STATUS_TONE: Record<string, "success" | "danger" | "warning"> = { pass: "success", non_compliant: "danger", incomplete: "warning", fail: "danger", warn: "warning" };
const VERDICT_TONE: Record<string, "success" | "danger" | "warning"> = { defensible: "success", needs_substantiation: "warning", high_risk: "danger" };

function ScanResult({ scan, onNew }: { scan: PackScanDto; onNew: () => void }) {
  const [tab, setTab] = useState<"Declarations" | "Claims">("Declarations");
  const [current, setCurrent] = useState(scan);
  const [isPending, startTransition] = useTransition();

  function approve() {
    startTransition(async () => {
      const result = await approvePackScanAction(current.id);
      if (result.ok) setCurrent(result.scan);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card style={{ padding: 16, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700 }}>
            {current.product_name || current.sku} · {current.sku}
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Ruleset v{current.ruleset_version} · {fmtDate(current.created_at)}
          </div>
        </div>
        <Badge tone={STATUS_TONE[current.status]}>{current.status.toUpperCase()}</Badge>
      </Card>
      {current.recheck_required && (
        <Callout tone="warning">
          <strong>Re-check needed.</strong> {current.recheck_reason}
        </Callout>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(["Declarations", "Claims"] as const).map((t) => (
          <Pill key={t} active={tab === t} onClick={() => setTab(t)}>
            {t}
          </Pill>
        ))}
      </div>

      {tab === "Declarations" &&
        current.declaration_results.map((d: DeclarationResultDto) => (
          <Card key={d.key} style={{ padding: 16, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontWeight: 600 }}>{d.label || d.key}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                {d.extractedValue ? `"${d.extractedValue}" · ` : ""}
                {d.ruleRef}
              </div>
              {d.note && <div style={{ fontSize: 11.5, color: "var(--color-rust)" }}>{d.note}</div>}
            </div>
            <Badge tone={STATUS_TONE[d.status]}>{d.status.replace("_", " ").toUpperCase()}</Badge>
          </Card>
        ))}
      {tab === "Claims" &&
        (current.claim_results.length === 0 ? (
          <EmptyState title="No claims entered" body="Add the marketing claims on the pack to check them." />
        ) : (
          current.claim_results.map((c: ClaimResultDto, i: number) => (
            <Card key={i} style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontStyle: "italic" }}>&ldquo;{c.text}&rdquo;</div>
                <Badge tone={VERDICT_TONE[c.verdict]}>{c.verdict.replace(/_/g, " ").toUpperCase()}</Badge>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginTop: 6 }}>
                {c.why}
                {c.ruleRef ? ` (${c.ruleRef})` : ""}
              </div>
              {c.saferPhrasing && (
                <Callout tone="success" style={{ marginTop: 8 }}>
                  <strong>Safer phrasing:</strong> {c.saferPhrasing}
                  {c.saferRationale ? ` — ${c.saferRationale}` : ""}
                </Callout>
              )}
            </Card>
          ))
        ))}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {current.approved_at ? (
          <Badge tone="success">
            Approved by {current.approved_by} · {fmtDate(current.approved_at)}
          </Badge>
        ) : (
          <Button onClick={approve} disabled={current.status === "fail" || isPending} style={{ width: "auto" }}>
            Approve for sign-off
          </Button>
        )}
        {current.status === "fail" && !current.approved_at && (
          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Correct the failing declarations and scan again to approve.</span>
        )}
        <Button variant="outline" onClick={onNew} style={{ width: "auto" }}>
          Scan another pack
        </Button>
      </div>
    </div>
  );
}

// Ported from frontend/src/screens/Pack.jsx.
export function PackClient({
  categories,
  portfolio,
  drift,
  accountId,
}: {
  categories: PackCategoryDto[];
  portfolio: PackScanDto[];
  drift: RulesetDiffDto[];
  accountId: string | null;
}) {
  const [tab, setTab] = useState<"Scan" | "Portfolio" | "Rule drift">("Scan");
  const [categoryId, setCategoryId] = useState("");
  const [sku, setSku] = useState("");
  const [product, setProduct] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [claims, setClaims] = useState("");
  const [result, setResult] = useState<PackScanDto | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  const category = categories.find((c) => c.categoryId === categoryId);

  function submitScan() {
    setError(undefined);
    startTransition(async () => {
      const scanResult = await createPackScanAction({
        accountId: accountId ?? undefined,
        sku,
        productName: product || undefined,
        categoryId,
        declarations: values,
        claims: claims
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      if (!scanResult.ok) {
        setError(scanResult.error);
        return;
      }
      setResult(scanResult.scan);
    });
  }

  return (
    <div style={{ maxWidth: 820, display: "flex", flexDirection: "column", gap: 16, padding: 24 }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-serif)", margin: 0 }}>Pack compliance</h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
          PackCheck is compliance QA on what you declare from a pack — not legal representation. Rules are curated by our trust team and versioned.
        </p>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(["Scan", "Portfolio", "Rule drift"] as const).map((t) => (
          <Pill
            key={t}
            active={tab === t}
            onClick={() => {
              setTab(t);
              setResult(null);
            }}
          >
            {t}
          </Pill>
        ))}
      </div>

      {tab === "Scan" &&
        (result ? (
          <ScanResult
            scan={result}
            onNew={() => {
              setResult(null);
              setValues({});
              setClaims("");
            }}
          />
        ) : categories.length === 0 ? (
          <EmptyState title="No rulesets published yet" body="Compliance rulesets are added by the trust team. Check back soon." />
        ) : (
          <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            {error && <Callout tone="danger">{error}</Callout>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {categories.map((c) => (
                <Pill
                  key={c.categoryId}
                  active={categoryId === c.categoryId}
                  onClick={() => {
                    setCategoryId(c.categoryId);
                    setValues({});
                  }}
                >
                  {c.categoryName} · v{c.currentVersion}
                </Pill>
              ))}
            </div>
            {category && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
                  <TextInput label="SKU" value={sku} onChange={(e) => setSku(e.target.value)} />
                  <TextInput label="Product name (optional)" value={product} onChange={(e) => setProduct(e.target.value)} />
                </div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Declarations as printed on the pack</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                  {category.declarations.map((d) => (
                    <TextInput
                      key={d.key}
                      label={`${d.label || d.key}${d.required === false ? "" : " *"}`}
                      value={values[d.key] || ""}
                      onChange={(e) => setValues({ ...values, [d.key]: e.target.value })}
                      hint={d.ruleRef}
                    />
                  ))}
                </div>
                <TextArea label="Marketing claims on the pack (one per line)" rows={3} value={claims} onChange={(e) => setClaims(e.target.value)} />
                <Button onClick={submitScan} disabled={!sku.trim() || isPending} style={{ alignSelf: "flex-start", width: "auto" }}>
                  {isPending ? "Checking…" : "Check compliance"}
                </Button>
              </>
            )}
          </Card>
        ))}

      {tab === "Portfolio" &&
        (portfolio.length === 0 ? (
          <EmptyState title="No scans yet" body="Packs you check appear here with the ruleset version they were checked against." />
        ) : (
          portfolio.map((p) => (
            <div
              key={p.id}
              onClick={() => {
                setResult(p);
                setTab("Scan");
              }}
              style={{ cursor: "pointer" }}
            >
              <Card style={{ padding: 16, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {p.product_name || p.sku} · {p.sku}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>
                    Ruleset v{p.ruleset_version}
                    {p.approved_at ? " · approved" : ""}
                    {p.recheck_required ? ` · ${p.recheck_reason}` : ""}
                  </div>
                </div>
                <Badge tone={STATUS_TONE[p.status]}>{p.status.toUpperCase()}</Badge>
              </Card>
            </div>
          ))
        ))}

      {tab === "Rule drift" &&
        (drift.length === 0 ? (
          <EmptyState title="No rule changes" body="When a ruleset changes, approved packs pinned to the old version are flagged here." />
        ) : (
          <>
            <Callout tone="warning">
              Approved packs can go non-compliant when rules change. Each approval is pinned to the ruleset version it was checked against and re-flagged
              automatically.
            </Callout>
            {drift.map((d) => (
              <Card key={d.id} style={{ padding: 16 }}>
                <div style={{ fontWeight: 600 }}>
                  {d.category_id} · v{d.from_version} → v{d.to_version} · {d.effective_from ? fmtDate(d.effective_from) : ""}
                </div>
                {d.changes.map((c, i) => (
                  <div key={i} style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
                    {c.summary}
                  </div>
                ))}
                {d.affectedProducts.length > 0 && (
                  <div style={{ fontSize: 12, marginTop: 6 }}>Affects your products: {d.affectedProducts.map((p) => p.product_name || p.sku).join(", ")}</div>
                )}
              </Card>
            ))}
          </>
        ))}
    </div>
  );
}
