"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FeeProposalDto, InvoiceDto } from "@vidhira/contracts";
import { Card, Button, Badge, Callout, EmptyState, Select } from "@/components/ui";
import { TextInput, TextArea } from "@/components/forms";
import { fmtDate, inr } from "@/lib/format";
import { acceptFeeProposalAction, raiseInvoiceAction, settleInvoiceOfflineAction, sendFeeProposalAction } from "@/server/mattersActions";

function ProposalForm({ matterId }: { matterId: string }) {
  const router = useRouter();
  const [scope, setScope] = useState("");
  const [rows, setRows] = useState([{ label: "", amount: "" }]);
  const [exclusions, setExclusions] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const valid = scope.trim().length >= 10 && rows.every((r) => r.label.trim().length >= 2 && Number(r.amount) >= 0 && r.amount !== "");

  function submit() {
    setError(undefined);
    startTransition(async () => {
      const result = await sendFeeProposalAction(matterId, {
        scopeText: scope.trim(),
        milestones: rows.map((r) => ({ label: r.label.trim(), amount: Number(r.amount) })),
        exclusions: exclusions.split(",").map((s) => s.trim()).filter(Boolean),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setScope("");
      setRows([{ label: "", amount: "" }]);
      setExclusions("");
      router.refresh();
    });
  }

  return (
    <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>Send a fee proposal</div>
      <TextArea label="Scope of work" rows={3} value={scope} onChange={(e) => setScope(e.target.value)} />
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", gap: 8 }}>
          <TextInput
            label={i === 0 ? "Milestone" : undefined}
            value={r.label}
            onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
            placeholder="e.g. Demand notice"
          />
          <TextInput
            label={i === 0 ? "Amount (₹)" : undefined}
            type="number"
            min="0"
            value={r.amount}
            onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
          />
        </div>
      ))}
      <button
        onClick={() => setRows([...rows, { label: "", amount: "" }])}
        type="button"
        style={{ alignSelf: "flex-start", background: "none", border: "none", color: "var(--color-rust)", cursor: "pointer", fontSize: 12.5 }}
      >
        + Add milestone
      </button>
      <TextInput label="Exclusions (comma-separated)" value={exclusions} onChange={(e) => setExclusions(e.target.value)} placeholder="e.g. Appeal or execution proceedings" />
      {error && <Callout tone="danger">{error}</Callout>}
      <Button onClick={submit} disabled={!valid || isPending} style={{ alignSelf: "flex-start", width: "auto" }}>
        Send proposal
      </Button>
    </Card>
  );
}

function InvoiceForm({ matterId }: { matterId: string }) {
  const router = useRouter();
  const [items, setItems] = useState([{ label: "", amount: "", category: "professional" as "professional" | "government" }]);
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const valid = items.every((i) => i.label.trim().length >= 2 && Number(i.amount) > 0);

  function submit() {
    setError(undefined);
    startTransition(async () => {
      const result = await raiseInvoiceAction(matterId, { items: items.map((i) => ({ label: i.label.trim(), amount: Number(i.amount), category: i.category })) });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setItems([{ label: "", amount: "", category: "professional" }]);
      router.refresh();
    });
  }

  return (
    <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>Raise an invoice</div>
      {items.map((it, i) => (
        <div key={i} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <TextInput label={i === 0 ? "Item" : undefined} value={it.label} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} style={{ flex: "2 1 160px" }} />
          <Select
            label={i === 0 ? "Type" : undefined}
            value={it.category}
            onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, category: e.target.value as "professional" | "government" } : x)))}
            options={[["professional", "Professional fee"], ["government", "Government / court fee"]] as const}
          />
          <TextInput label={i === 0 ? "Amount (₹)" : undefined} type="number" min="1" value={it.amount} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
        </div>
      ))}
      <button
        onClick={() => setItems([...items, { label: "", amount: "", category: "professional" }])}
        type="button"
        style={{ alignSelf: "flex-start", background: "none", border: "none", color: "var(--color-rust)", cursor: "pointer", fontSize: 12.5 }}
      >
        + Add line
      </button>
      <div style={{ fontSize: 11.5, color: "var(--color-label)" }}>The platform fee and 18% GST are added automatically and itemised separately.</div>
      {error && <Callout tone="danger">{error}</Callout>}
      <Button onClick={submit} disabled={!valid || isPending} style={{ alignSelf: "flex-start", width: "auto" }}>
        Raise invoice
      </Button>
    </Card>
  );
}

// Ported from frontend/src/screens/matter/MatterTabs.jsx's Fees. Online payment ("Pay now") is
// deferred -- the payments domain isn't converted yet -- so every unpaid invoice shows the
// "settle directly" copy regardless of the deployment's actual payments.enabled flag.
export function Fees({ matterId, side, feeProposals, invoices }: { matterId: string; side: "client" | "advocate" | "viewer"; feeProposals: FeeProposalDto[]; invoices: InvoiceDto[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  function accept(proposalId: string) {
    setError(undefined);
    startTransition(async () => {
      const result = await acceptFeeProposalAction(matterId, proposalId);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  function settle(invoiceId: string) {
    setError(undefined);
    startTransition(async () => {
      const result = await settleInvoiceOfflineAction(matterId, invoiceId);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {feeProposals.length === 0 && invoices.length === 0 && (
        <EmptyState title="No fees yet" body={side === "advocate" ? "Send a fee proposal to confirm the engagement." : "Your advocate's fee proposal and invoices will appear here."} />
      )}

      {feeProposals.map((p) => {
        const expired = Boolean(p.valid_until && new Date(p.valid_until) < new Date());
        return (
          <Card key={p.id} style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontWeight: 700 }}>Fee proposal · {fmtDate(p.created_at)}</div>
              <Badge tone={p.accepted_at ? "success" : expired ? "danger" : "warning"}>{p.accepted_at ? "Accepted" : expired ? "Expired" : "Awaiting acceptance"}</Badge>
            </div>
            <div style={{ fontSize: 13 }}>{p.scope_text}</div>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <tbody>
                {p.milestones.map((m, i) => (
                  <tr key={i}>
                    <td style={{ padding: "4px 0" }}>{m.label}</td>
                    <td style={{ textAlign: "right" }}>{inr(m.amount)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: "1px solid var(--color-border)", fontWeight: 700 }}>
                  <td style={{ padding: "6px 0" }}>Total professional fees</td>
                  <td style={{ textAlign: "right" }}>{inr(p.milestones.reduce((s, m) => s + Number(m.amount), 0))}</td>
                </tr>
              </tbody>
            </table>
            {p.statutory_estimate && <div style={{ fontSize: 12 }}>Statutory/court charges: {p.statutory_estimate}</div>}
            {p.exclusions.length > 0 && <Callout tone="warning">Not included: {p.exclusions.join("; ")}. The advocate makes no representation about the outcome.</Callout>}
            {side === "client" && !p.accepted_at && !expired && (
              <Button onClick={() => accept(p.id)} disabled={isPending} style={{ alignSelf: "flex-start", width: "auto" }}>
                Accept &amp; confirm engagement
              </Button>
            )}
          </Card>
        );
      })}

      {invoices.map((inv) => (
        <Card key={inv.id} style={{ padding: 16, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontWeight: 700 }}>Invoice · {fmtDate(inv.created_at)}</div>
            <Badge tone={inv.status === "paid" ? "success" : "warning"}>{inv.status}</Badge>
          </div>
          {[...(inv.invoice_line_items || [])]
            .sort((a, b) => a.position - b.position)
            .map((li) => (
              <div key={li.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0", borderBottom: "1px solid var(--color-border)" }}>
                <span>
                  {li.label} <Badge tone={li.category === "government" ? "warning" : "neutral"}>{li.category}</Badge>
                </span>
                <span>{inr(li.amount)}</span>
              </div>
            ))}
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13 }}>
            <span>Total incl. GST</span>
            <span>{inr(inv.total)}</span>
          </div>
          {inv.status !== "paid" && side === "client" && <div style={{ fontSize: 11.5, color: "var(--color-label)" }}>Online payment isn&apos;t enabled yet — settle this directly with your advocate.</div>}
          {inv.status !== "paid" && side === "advocate" && (
            <Button variant="outline" onClick={() => settle(inv.id)} disabled={isPending} style={{ alignSelf: "flex-start", width: "auto" }}>
              Mark as paid (received directly)
            </Button>
          )}
        </Card>
      ))}
      <div style={{ fontSize: 11.5, color: "var(--color-label)" }}>Court fees, professional fees and the platform fee are always itemised separately.</div>
      {error && <Callout tone="danger">{error}</Callout>}

      {side === "advocate" && (
        <>
          <ProposalForm matterId={matterId} />
          <InvoiceForm matterId={matterId} />
        </>
      )}
    </div>
  );
}
