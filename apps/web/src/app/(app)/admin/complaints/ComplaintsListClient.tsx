"use client";

import { useState, useTransition } from "react";
import type { ComplaintDto } from "@vidhira/contracts";
import { Card, Badge, Pill, Button, Callout, Select } from "@/components/ui";
import { TextInput, TextArea } from "@/components/forms";
import { fmtDate } from "@/lib/format";
import { updateComplaintAction } from "@/server/complaintsActions";

const STATUS_TONE: Record<string, "warning" | "danger" | "success"> = { open: "warning", escalated: "danger", resolved: "success" };
const SEVERITY_COLOR: Record<string, string> = { low: "#8A8578", medium: "#B8863B", high: "#B23A22" };
const FILTERS = ["All", "Open", "Escalated", "Resolved", "High severity"] as const;

function ComplaintCard({ c, onSaved }: { c: ComplaintDto; onSaved: (updated: ComplaintDto) => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ status: c.status, severity: c.severity, owner: c.owner || "", rootCause: c.root_cause || "", correctiveAction: c.corrective_action || "" });
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(undefined);
    startTransition(async () => {
      const result = await updateComplaintAction(c.id, {
        status: f.status,
        severity: f.severity,
        owner: f.owner || undefined,
        rootCause: f.rootCause || undefined,
        correctiveAction: f.correctiveAction || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved(result.complaint);
    });
  }

  return (
    <Card style={{ padding: 16, borderLeft: `4px solid ${SEVERITY_COLOR[c.severity]}`, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, cursor: "pointer" }} onClick={() => setOpen(!open)}>
        <div>
          <div style={{ fontWeight: 700 }}>{c.title}</div>
          <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>
            {c.ref} · {c.category?.replace(/_/g, " ")} · {fmtDate(c.created_at)}
          </div>
        </div>
        <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
      </div>
      {open && (
        <>
          <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{c.description}</div>
          {error && <Callout tone="danger">{error}</Callout>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
            <Select label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as ComplaintDto["status"] })} options={["open", "escalated", "resolved"]} />
            <Select label="Severity" value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value as ComplaintDto["severity"] })} options={["low", "medium", "high"]} />
            <TextInput label="Owner" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} />
          </div>
          <TextArea label="Root cause" rows={2} value={f.rootCause} onChange={(e) => setF({ ...f, rootCause: e.target.value })} />
          <TextArea label="Corrective action" rows={2} value={f.correctiveAction} onChange={(e) => setF({ ...f, correctiveAction: e.target.value })} />
          <Button onClick={save} disabled={isPending} style={{ alignSelf: "flex-start", width: "auto" }}>
            Save
          </Button>
        </>
      )}
    </Card>
  );
}

// Ported from frontend/src/screens/ComplaintsDesk.jsx's ComplaintList.
export function ComplaintsListClient({ initialComplaints, kpis }: { initialComplaints: ComplaintDto[]; kpis: Array<{ label: string; value: number }> }) {
  const [complaints, setComplaints] = useState(initialComplaints);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const filtered = complaints.filter((c) => filter === "All" || (filter === "High severity" ? c.severity === "high" : c.status === filter.toLowerCase()));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        {kpis.map((k) => (
          <Card key={k.label} style={{ padding: 14 }}>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 17 }}>{k.value}</div>
            <div style={{ fontSize: 10.5, color: "var(--color-text-muted)" }}>{k.label}</div>
          </Card>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {FILTERS.map((f) => (
          <Pill key={f} active={filter === f} onClick={() => setFilter(f)}>
            {f}
          </Pill>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--color-text-muted)" }}>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 17, color: "var(--color-ink)", marginBottom: 6 }}>No complaints</div>
          <div style={{ fontSize: 13 }}>Complaints filed by users appear here.</div>
        </div>
      ) : (
        filtered.map((c) => (
          <ComplaintCard key={c.id} c={c} onSaved={(updated) => setComplaints((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))} />
        ))
      )}
      <div style={{ fontSize: 11.5, color: "var(--color-label)" }}>Complaints are filed by users from Profile → Report a problem.</div>
    </div>
  );
}
