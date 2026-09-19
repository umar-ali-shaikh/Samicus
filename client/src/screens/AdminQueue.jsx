import { useAppState } from "../state/AppState";
import { VERIF_QUEUE } from "../data/mockData";
import { Card, Badge, Button, EmptyState } from "../components/ui";

export function AdminQueue() {
  const { state, act } = useAppState();
  const pending = VERIF_QUEUE.filter((v) => !state.approved[v.id]);

  return (
    <div style={{ maxWidth: 900, display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 22 }}>Verification & trust operations</div>
        <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>Admins never see matter contents.</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        {[["Pending verification", pending.length], ["Verified advocates", 148], ["Conflict flags (30d)", 3], ["Disputes open", 1]].map(([l, v]) => (
          <Card key={l}><div style={{ fontFamily: "var(--font-serif)", fontSize: 20 }}>{v}</div><div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{l}</div></Card>
        ))}
      </div>

      {pending.length === 0 && <EmptyState title="Queue is empty" body="No advocates are currently pending verification." />}
      {pending.map((c) => (
        <Card key={c.id}>
          <div style={{ fontWeight: 700 }}>{c.name}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 8 }}>{c.detail}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {c.checks.map((chk, i) => <Badge key={i} tone={chk.ok ? "success" : "danger"}>{chk.label}: {chk.ok ? "pass" : "fail"}</Badge>)}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Button onClick={() => act.approveAdvocate(c.id)}>Approve listing</Button>
            <Button variant="outline" onClick={() => act.showToast("Sent back to the advocate for more information.")}>Send back</Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
