import { useAppState } from "../state/AppState";
import { ModalShell } from "../components/Modal";
import { Button, Callout } from "../components/ui";

export function QuoteModal() {
  const { act } = useAppState();
  return (
    <ModalShell kicker="Fee proposal" title="Vendor recovery — sample engagement scope" onClose={act.closeModal} width={560}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 13 }}>Scope: recovery of outstanding dues from a vendor, including a demand notice, negotiation, and (if required) filing before the Commercial Court.</div>
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <tbody>
            <tr><td style={{ padding: "6px 0" }}>Milestone 1 — Demand notice</td><td style={{ textAlign: "right" }}>₹15,000</td></tr>
            <tr><td style={{ padding: "6px 0" }}>Milestone 2 — Filing & first hearing</td><td style={{ textAlign: "right" }}>₹45,000</td></tr>
            <tr><td style={{ padding: "6px 0" }}>Milestone 3 — Through to judgment</td><td style={{ textAlign: "right" }}>₹52,000 – 86,000</td></tr>
            <tr><td style={{ padding: "6px 0" }}>Court fee (estimated)</td><td style={{ textAlign: "right" }}>₹8,000</td></tr>
          </tbody>
        </table>
        <div style={{ fontWeight: 700 }}>Estimated total: ₹1,12,000 – ₹1,46,000</div>
        <Callout tone="warning">Contingency: appeal or execution proceedings are not included. The advocate makes no representation about the outcome.</Callout>
        <div style={{ display: "flex", gap: 10 }}>
          <Button onClick={() => { act.showToast("Engagement confirmed. A matter has been created."); act.closeModal(); act.go("matters"); }}>Accept & confirm engagement</Button>
          <Button variant="outline" onClick={act.closeModal}>Keep reviewing</Button>
        </div>
      </div>
    </ModalShell>
  );
}
