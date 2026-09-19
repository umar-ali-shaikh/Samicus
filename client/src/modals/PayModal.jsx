import { useAppState } from "../state/AppState";
import { ModalShell } from "../components/Modal";
import { Button, RadioCard, Callout } from "../components/ui";

export function PayModal() {
  const { state, act } = useAppState();
  return (
    <ModalShell kicker="Payment" title="Complete payment" onClose={act.closeModal} width={480}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 26 }}>{state.payAmount}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[["upi", "UPI"], ["card", "Card"], ["net_banking", "Net banking"]].map(([v, l]) => (
            <RadioCard key={v} selected={state.payMethod === v} onClick={() => act.setPayMethod(v)} title={l} />
          ))}
        </div>
        <Button onClick={() => { act.showToast(`Payment of ${state.payAmount} received via ${state.payMethod.replace("_", " ")}.`); act.closeModal(); }}>Pay {state.payAmount}</Button>
        <Callout tone="neutral">Held in escrow and itemized on your invoice — professional fee, government fee and platform fee are always shown separately.</Callout>
      </div>
    </ModalShell>
  );
}
