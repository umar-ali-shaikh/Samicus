import { useAppState } from "../state/AppState";
import { NOTIFICATIONS } from "../data/mockData";
import { Card, Button, Callout } from "../components/ui";

const PLANS = [
  { name: "Instant consultation", price: "₹1,500 – 3,500", note: "Pay per consultation" },
  { name: "Scheduled consultation", price: "₹1,200 – 4,000", note: "Pay per consultation" },
  { name: "Family legal plan", price: "₹499/mo", note: "2 consults + unlimited doc review + 4 members" },
  { name: "Business retainer", price: "₹35,000/mo", note: "Current plan", current: true },
];

export function Profile() {
  const { state, act } = useAppState();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 22 }}>Profile & settings</div>

      <div>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Active account</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[["individual", "Meera Raghavan"], ["business", "Verdanta Foods"]].map(([id, name]) => (
            <Card key={id} onClick={() => act.setAccount(id)} style={{ cursor: "pointer", flex: "1 1 160px", border: `1.5px solid ${state.account === id ? "var(--color-navy)" : "var(--color-border)"}` }}>
              <div style={{ fontWeight: 700 }}>{name}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)", textTransform: "capitalize" }}>{id}</div>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Plans & pricing</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {PLANS.map((p) => (
            <Card key={p.name} style={{ border: p.current ? "1.5px solid var(--color-navy)" : undefined }}>
              <div style={{ fontWeight: 700 }}>{p.name}</div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 18 }}>{p.price}</div>
              <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{p.note}</div>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Notifications</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {NOTIFICATIONS.map((n) => {
            const on = state.notif[n.id] !== undefined ? state.notif[n.id] : n.on;
            return (
              <Card key={n.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div><div style={{ fontWeight: 600, fontSize: 13 }}>{n.label}</div><div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{n.sub}</div></div>
                <button onClick={() => act.toggleNotif(n.id, !on)} style={{ width: 44, height: 25, borderRadius: 999, border: "none", background: on ? "#159C6E" : "#E4DCCE", position: "relative", cursor: "pointer" }}>
                  <span style={{ position: "absolute", top: 3, left: on ? 22 : 3, width: 19, height: 19, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
                </button>
              </Card>
            );
          })}
        </div>
      </div>

      <Callout tone="neutral" title="Trust, privacy & ethics">
        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
          <li>Every advocate is Bar Council enrolment-verified before being listed.</li>
          <li>A conflict check clears before your facts are shared with a matched advocate.</li>
          <li>Match ordering is neutral — never influenced by payment or advertising.</li>
          <li>Matter contents are encrypted; platform staff see metadata and billing only.</li>
          <li>Engagement terms are always confirmed in writing before work begins.</li>
          <li>In an emergency, call 112 — Samicus does not replace emergency services.</li>
        </ul>
      </Callout>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Button variant="outline" onClick={() => act.showToast("Export ready — check your downloads.")}>Download my data</Button>
        <Button variant="danger" onClick={() => act.showToast("Account deletion requires closing all open matters first.")}>Delete account</Button>
      </div>
    </div>
  );
}
