import { useAppState } from "../state/AppState";
import { SERVICES } from "../data/mockData";
import { ModalShell } from "../components/Modal";
import { Button, Card } from "../components/ui";

export function ServiceModal() {
  const { state, act } = useAppState();
  const service = SERVICES.find((s) => s.id === state.serviceId);
  if (!service) return null;

  return (
    <ModalShell kicker={service.cat} title={service.name} onClose={act.closeModal} width={560}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>{service.blurb}</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Card style={{ flex: "1 1 100px", textAlign: "center" }}><div style={{ fontSize: 10, color: "var(--color-label)" }}>PROFESSIONAL FEE</div><div style={{ fontFamily: "var(--font-serif)", fontSize: 20 }}>₹{service.fee}</div></Card>
          <Card style={{ flex: "1 1 100px", textAlign: "center" }}><div style={{ fontSize: 10, color: "var(--color-label)" }}>GOVERNMENT CHARGES</div><div style={{ fontFamily: "var(--font-serif)", fontSize: 20 }}>₹{service.gov}</div></Card>
          <Card style={{ flex: "1 1 100px", textAlign: "center" }}><div style={{ fontSize: 10, color: "var(--color-label)" }}>TIMELINE</div><div style={{ fontFamily: "var(--font-serif)", fontSize: 20 }}>{service.timeline}</div></Card>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, fontSize: 12.5 }}>
          <div><strong>Includes</strong><ul>{service.includes.map((i) => <li key={i}>{i}</li>)}</ul></div>
          <div><strong>Documents required</strong><ul>{service.docs.map((i) => <li key={i}>{i}</li>)}</ul></div>
          <div><strong>Deliverables</strong><ul>{service.deliverables.map((i) => <li key={i}>{i}</li>)}</ul></div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--color-navy)", color: "var(--color-gold)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-serif)", fontSize: 13 }}>{service.proInitials}</div>
          <div style={{ fontSize: 12.5 }}>{service.pro} · {service.proLine}</div>
        </div>
        <Button onClick={() => act.openPay(`₹${service.fee + service.gov}`)}>Start this service · ₹{service.fee}</Button>
      </div>
    </ModalShell>
  );
}
