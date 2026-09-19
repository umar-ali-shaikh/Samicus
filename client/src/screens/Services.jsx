import { useAppState } from "../state/AppState";
import { SERVICES } from "../data/mockData";
import { Card, Badge } from "../components/ui";

export function Services() {
  const { act } = useAppState();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 22 }}>Fixed-fee legal services</div>
        <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>Professional fee and government charges are always disclosed separately. No outcome guarantees.</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        {SERVICES.map((s) => (
          <Card key={s.id} style={{ cursor: "pointer", display: "flex", flexDirection: "column", gap: 8 }} onClick={() => act.openService(s.id)}>
            <Badge>{s.cat}</Badge>
            <div style={{ fontWeight: 700 }}>{s.name}</div>
            <div style={{ fontSize: 12.5, color: "var(--color-text-muted)", flex: 1 }}>{s.blurb}</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span>₹{s.fee}{s.gov ? ` + ₹${s.gov} govt` : ""}</span>
              <span style={{ color: "var(--color-text-muted)" }}>{s.timeline}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
