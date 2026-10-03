import { useState } from "react";
import { useGet, useMut } from "../api/hooks";
import { api } from "../lib/api";
import { Card, Badge, Button, Pill, QueryBoundary, EmptyState } from "../components/ui";
import { PageHeader } from "../components/PageHeader";
import { Select, TextInput, TextArea } from "../components/forms";
import { fmtDate } from "../lib/format";

const STATUS_TONE = { open: "warning", escalated: "danger", resolved: "success" };
const SEVERITY_COLOR = { low: "#8A8578", medium: "#B8863B", high: "#B23A22" };

function Complaint({ c }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ status: c.status, severity: c.severity, owner: c.owner || "", rootCause: c.root_cause || "", correctiveAction: c.corrective_action || "" });
  const save = useMut(() => api.patch(`/admin/complaints/${c.id}`, { ...f, owner: f.owner || undefined, rootCause: f.rootCause || undefined, correctiveAction: f.correctiveAction || undefined }), { invalidate: ["/admin"], success: "Updated." });
  return (
    <Card style={{ borderLeft: `4px solid ${SEVERITY_COLOR[c.severity]}`, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, cursor: "pointer" }} onClick={() => setOpen(!open)}>
        <div><div style={{ fontWeight: 700 }}>{c.title}</div><div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{c.ref} · {c.category?.replace(/_/g, " ")} · {fmtDate(c.created_at)}</div></div>
        <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
      </div>
      {open && (
        <>
          <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{c.description}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
            <Select label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} options={["open", "escalated", "resolved"]} />
            <Select label="Severity" value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })} options={["low", "medium", "high"]} />
            <TextInput label="Owner" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} />
          </div>
          <TextArea label="Root cause" rows={2} value={f.rootCause} onChange={(e) => setF({ ...f, rootCause: e.target.value })} />
          <TextArea label="Corrective action" rows={2} value={f.correctiveAction} onChange={(e) => setF({ ...f, correctiveAction: e.target.value })} />
          <Button onClick={() => save.mutate()} disabled={save.isPending} style={{ alignSelf: "flex-start" }}>Save</Button>
        </>
      )}
    </Card>
  );
}

export function ComplaintList({ embedded }) {
  const data = useGet("/admin/complaints", undefined, { refetchInterval: 30000 });
  const [filter, setFilter] = useState("All");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {data.data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          {data.data.kpis.map((k) => <Card key={k.label}><div style={{ fontFamily: "var(--font-serif)", fontSize: 17 }}>{k.value}</div><div style={{ fontSize: 10.5, color: "var(--color-text-muted)" }}>{k.label}</div></Card>)}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{["All", "Open", "Escalated", "Resolved", "High severity"].map((f) => <Pill key={f} active={filter === f} onClick={() => setFilter(f)}>{f}</Pill>)}</div>
      <QueryBoundary query={data} isEmpty={(d) => d.complaints.length === 0} empty={<EmptyState title="No complaints" body="Complaints filed by users appear here." />}>
        {(d) => d.complaints.filter((c) => filter === "All" || (filter === "High severity" ? c.severity === "high" : c.status === filter.toLowerCase())).map((c) => <Complaint key={c.id} c={c} />)}
      </QueryBoundary>
      {embedded ? null : <div style={{ fontSize: 11.5, color: "var(--color-label)" }}>Complaints are filed by users from Profile → Report a problem.</div>}
    </div>
  );
}

export function ComplaintsDesk() {
  return (
    <div style={{ maxWidth: 900, display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader title="Complaints" subtitle="Triage, own and close every complaint — with the root cause and the corrective action recorded." />
      <ComplaintList />
    </div>
  );
}
