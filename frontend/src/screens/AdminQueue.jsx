import { useState } from "react";
import { useGet, useMut } from "../api/hooks";
import { api } from "../lib/api";
import { Card, Badge, Button, EmptyState, QueryBoundary } from "../components/ui";
import { PageHeader } from "../components/PageHeader";
import { TextInput } from "../components/forms";
import { fmtDate } from "../lib/format";

function CaseCard({ c }) {
  const [note, setNote] = useState("");
  const decide = useMut((decision) => api.post(`/admin/verification-cases/${c.id}/decide`, { decision, note: note.trim() || undefined }), {
    invalidate: ["/admin"], success: (_, d) => (d === "approved" ? "Advocate approved and listed. Decision audit-logged." : "Sent back to the advocate for more information."),
  });
  const a = c.advocate;
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700 }}>{a.user?.full_name} <span style={{ fontWeight: 400, color: "var(--color-text-muted)" }}>· {a.user?.email}</span></div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{a.bar_council} · {a.enrolment_number}{a.enrolment_year ? ` (${a.enrolment_year})` : ""} · {a.city} · {a.years_of_practice ?? "—"} yrs</div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{(a.advocate_practice_areas || []).map((p) => p.practice_area?.name).join(", ")}{a.education?.length ? ` · ${a.education.join("; ")}` : ""}</div>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--color-label)" }}>Submitted {fmtDate(c.created_at)}</div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(c.checks || []).map((chk, i) => <Badge key={i} tone={chk.status === "pass" ? "success" : chk.status === "needs_info" ? "danger" : "warning"}>{chk.type.replace(/_/g, " ")}: {chk.status.replace("_", " ")}</Badge>)}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--color-label)" }}>Verify the enrolment number against the Bar Council's roll before approving — the system records your decision but cannot check the register itself.</div>
      <TextInput label="Note to advocate (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div style={{ display: "flex", gap: 10 }}>
        <Button onClick={() => decide.mutate("approved")} disabled={decide.isPending}>Approve listing</Button>
        <Button variant="outline" onClick={() => decide.mutate("sent_back")} disabled={decide.isPending}>Send back</Button>
      </div>
    </Card>
  );
}

export function AdminQueue() {
  const stats = useGet("/admin/stats", undefined, { refetchInterval: 30000 });
  const cases = useGet("/admin/verification-cases");
  const s = stats.data;
  return (
    <div style={{ maxWidth: 900, display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader title="Verification & trust operations" subtitle="Admins never see matter contents." />
      {s && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          {[["Pending verification", s.pendingVerification], ["Verified advocates", s.verifiedAdvocates], ["Awaiting moderation", s.pendingModeration], ["Conflict flags (30d)", s.conflictFlags30d], ["Open complaints", s.openComplaints], ["Unassigned paid orders", s.unassignedServiceOrders]].map(([l, v]) => (
            <Card key={l}><div style={{ fontFamily: "var(--font-serif)", fontSize: 20 }}>{v}</div><div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{l}</div></Card>
          ))}
        </div>
      )}
      <QueryBoundary query={cases} empty={<EmptyState title="Queue is empty" body="No advocates are currently pending verification." />}>
        {(list) => list.map((c) => <CaseCard key={c.id} c={c} />)}
      </QueryBoundary>
    </div>
  );
}
