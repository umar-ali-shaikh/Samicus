"use client";

import { useState } from "react";
import type { ContractReviewDetailDto } from "@vidhira/contracts";
import { Card, Pill, Badge, Callout, EmptyState } from "@/components/ui";
import { fmtDate } from "@/lib/format";

const FAVOR_TONE: Record<string, "success" | "danger" | "neutral"> = { drafter: "success", counterparty: "danger", balanced: "neutral" };
const FAVOR_LABEL: Record<string, string> = { drafter: "Favours you", counterparty: "Favours them", balanced: "Balanced" };
const FILTERS = ["All", "Favours them", "Balanced", "Favours you", "Not assessed"] as const;

// Ported from frontend/src/screens/Review.jsx's Findings component.
export function FindingsClient({ review }: { review: ContractReviewDetailDto }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const findings = review.findings.filter((f) => {
    if (filter === "All") return true;
    if (filter === "Favours them") return f.favors === "counterparty";
    if (filter === "Balanced") return f.favors === "balanced";
    if (filter === "Favours you") return f.favors === "drafter";
    return !f.favors;
  });
  const count = (k: string) => review.findings.filter((f) => f.favors === k).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card style={{ padding: 16, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700 }}>{review.document?.filename}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            {review.contract_type}
            {review.counterparty_name ? ` vs ${review.counterparty_name}` : ""} · {review.clauses_identified} clauses read · {fmtDate(review.created_at)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-start" }}>
          <Badge tone="danger">{count("counterparty")} favours them</Badge>
          <Badge>{count("balanced")} balanced</Badge>
          <Badge tone="success">{count("drafter")} favours you</Badge>
        </div>
      </Card>
      {review.notes && <Callout tone="neutral">{review.notes}</Callout>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {FILTERS.map((f) => (
          <Pill key={f} active={filter === f} onClick={() => setFilter(f)}>
            {f}
          </Pill>
        ))}
      </div>
      {findings.length === 0 && <EmptyState title="No findings in this filter" body="Try a different filter." />}
      {findings.map((f) => (
        <Card key={f.id} style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
            <div style={{ fontWeight: 700 }}>
              {f.clause_type} <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>{f.clause_ref}</span>
            </div>
            {f.favors ? <Badge tone={FAVOR_TONE[f.favors]}>{FAVOR_LABEL[f.favors]}</Badge> : <Badge>Not assessed</Badge>}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginTop: 6, whiteSpace: "pre-wrap" }}>{f.extracted_text}</div>
          <Callout tone="neutral" style={{ marginTop: 8 }}>
            <strong>
              Compared with baseline &ldquo;{f.library_entry?.title || f.clause_type}&rdquo;
              {f.similarity ? ` (similarity ${Math.round(f.similarity * 100)}%)` : ""}.
            </strong>{" "}
            {f.deviation_note}
          </Callout>
          {f.why_it_matters && (
            <Callout tone="warning" style={{ marginTop: 8 }}>
              <strong>Why it matters:</strong> {f.why_it_matters}
            </Callout>
          )}
          {f.recommended_ask && (
            <Callout tone="success" style={{ marginTop: 8 }}>
              <strong>What to ask for:</strong> {f.recommended_ask}
            </Callout>
          )}
        </Card>
      ))}
      <div style={{ fontSize: 11.5, color: "var(--color-label)" }}>
        An automated comparison against a balanced baseline — not a legal opinion. Clauses with no close baseline are not assessed.
      </div>
    </div>
  );
}
