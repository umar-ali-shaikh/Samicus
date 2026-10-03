import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useUI } from "../state/UIState";
import { useConfig, useGet, useMut } from "../api/hooks";
import { api } from "../lib/api";
import { payFor } from "../lib/payments";
import { inr, initials } from "../lib/format";
import { Button, Callout, AvatarTile, Spinner } from "./ui";

const WAIT_LIMIT_MS = 10 * 60 * 1000;

/** Follows an instant/urgent request: waits for an advocate, then handles payment and the call room. */
export function LiveConsult({ intakeId, startedAt, tone = "navy", onCancelled, onGone }) {
  const { user } = useAuth();
  const { go, showToast, closeModal } = useUI();
  const config = useConfig();
  const [room, setRoom] = useState(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const status = useGet(`/intake-requests/${intakeId}`, undefined, { refetchInterval: (q) => (q.state.data?.consultation ? 15000 : 4000), staleTime: 0 });
  const intake = status.data?.intake;
  const consultation = status.data?.consultation;
  const elapsed = Math.floor((now - startedAt) / 1000);
  const timedOut = !consultation && now - startedAt > WAIT_LIMIT_MS;

  const cancel = useMut(() => api.post(`/intake-requests/${intakeId}/cancel`), { invalidate: ["/intake-requests"], onSuccess: () => onCancelled?.() });
  const pay = useMut(() => payFor("consultation", consultation.id, { user, description: "Instant consultation" }), { invalidate: [`/intake-requests/${intakeId}`, "/consultations"] });
  const join = useMut(() => api.post(`/consultations/${consultation.id}/room`), { onSuccess: (r) => setRoom(r) });

  const dark = tone === "navy";
  const wrap = { background: dark ? "var(--color-navy)" : "#fff", color: dark ? "#fff" : "var(--color-ink)", borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", gap: 12, border: dark ? "none" : "1px solid var(--color-border)" };

  if (intake?.status === "declined") {
    return <div style={wrap}><div>This request was cancelled.</div><Button variant="outline" onClick={() => onGone?.()}>Start over</Button></div>;
  }
  if (intake?.status === "none_available") {
    return (
      <div style={wrap}>
        <Callout tone="warning">No advocate is available for this right now.</Callout>
        <div style={{ fontSize: 13 }}>Free legal aid: National Legal Services Authority helpline <strong>15100</strong>. You can also book the next open slot with any verified advocate.</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Button onClick={() => { closeModal(); go("find"); }}>Book a scheduled consultation</Button><Button variant="outline" onClick={() => onGone?.()}>Try again</Button></div>
      </div>
    );
  }

  if (!consultation) {
    return (
      <div style={wrap}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}><Spinner /> {timedOut ? "Still waiting…" : "Waiting for an advocate to accept…"}</div>
        <div style={{ fontSize: 12, color: dark ? "#9AA5BC" : "var(--color-text-muted)" }}>
          Your request went to the best-matched verified advocates. The first to clear their conflict check and accept gets it. Waiting {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}.
        </div>
        {timedOut && <Callout tone="warning">No advocate has accepted yet. You can keep waiting, cancel, or book a scheduled slot instead.</Callout>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="outline" onClick={() => cancel.mutate()} disabled={cancel.isPending}>Cancel request</Button>
          {timedOut && <Button onClick={() => { closeModal(); go("find"); }}>Book a scheduled slot</Button>}
        </div>
      </div>
    );
  }

  const advocateName = consultation.advocate?.user?.full_name;
  const payNeeded = config.data?.payments?.enabled && !consultation.paid_at;
  return (
    <div style={{ ...wrap, gap: 14 }}>
      <Callout tone="success">Advocate matched · conflict check cleared</Callout>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <AvatarTile initials={initials(advocateName)} />
        <div><div style={{ fontWeight: 700 }}>Adv. {advocateName?.replace(/^Adv\.?\s*/i, "")}</div><div style={{ fontSize: 12, color: dark ? "#9AA5BC" : "var(--color-text-muted)" }}>{consultation.mode.replace("_", " ")} consultation · {inr(consultation.fee_total)} incl. fees & GST</div></div>
      </div>

      {payNeeded && <Button onClick={() => pay.mutate()} disabled={pay.isPending}>{pay.isPending ? "Opening payment…" : `Pay ${inr(consultation.fee_total)}`}</Button>}
      {!config.data?.payments?.enabled && !config.isPending && <div style={{ fontSize: 11.5, color: dark ? "#9AA5BC" : "var(--color-label)" }}>Online payment isn't enabled — the fee is settled directly with the advocate.</div>}

      {consultation.mode === "chat" ? (
        <Button onClick={() => { closeModal(); go("messages"); }}>Open secure chat</Button>
      ) : consultation.mode === "in_person" ? (
        <Callout tone="neutral">Your advocate will contact you in Messages to agree the place and time.</Callout>
      ) : !room ? (
        <Button variant={payNeeded ? "outline" : "primary"} onClick={() => join.mutate()} disabled={join.isPending || payNeeded} style={dark ? { background: payNeeded ? "transparent" : "var(--color-gold)", color: payNeeded ? "#fff" : "var(--color-navy)" } : undefined}>
          {join.isPending ? "Opening room…" : "Join call"}
        </Button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <iframe title="Consultation room" src={room.roomUrl} allow="camera; microphone; fullscreen; display-capture; autoplay" style={{ width: "100%", height: 360, border: 0, borderRadius: 12, background: "#000" }} />
          <div style={{ fontSize: 11.5, color: dark ? "#9AA5BC" : "var(--color-text-muted)" }}>Recording is off. <a href={room.roomUrl} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>Open in a new tab</a> if your browser blocks the camera here.</div>
        </div>
      )}
      <Button variant="outline" onClick={() => { showToast("Your consultation and any matter appear under Matters."); closeModal(); go("matters"); }}>Go to my matters</Button>
    </div>
  );
}
