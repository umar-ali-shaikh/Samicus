"use client";

import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import Link from "next/link";
import type { IntakeStatusDto } from "@vidhira/contracts";
import { Button, Callout, Spinner } from "@/components/ui";
import { inr, modeName } from "@/lib/format";
import { cancelIntakeAction, getIntakeStatusAction, joinConsultationRoomAction } from "@/server/intakeActions";

const WAIT_LIMIT_MS = 10 * 60 * 1000;
const POLL_WAITING_MS = 4000;
const POLL_MATCHED_MS = 15000;

/**
 * Follows an instant/urgent request: waits for an advocate, then hands off to the call room.
 * Ported from frontend/src/components/LiveConsult.jsx. Payment is deferred here -- the
 * payments domain (Razorpay) is a later Phase 3 slice -- so a matched consultation always
 * shows the "settled directly with the advocate" copy, same as when payments are disabled.
 */
export function LiveConsult({ intakeId, onCancelled, onGone }: { intakeId: string; onCancelled?: () => void; onGone?: () => void }) {
  const [status, setStatus] = useState<IntakeStatusDto | null>(null);
  const [room, setRoom] = useState<{ roomUrl: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [startedAt] = useState(() => Date.now());
  const [isPending, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const result = await getIntakeStatusAction(intakeId);
      if (!cancelled) setStatus(result);
      const delay = result.consultation ? POLL_MATCHED_MS : POLL_WAITING_MS;
      timerRef.current = setTimeout(poll, delay);
    }
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timerRef.current);
    };
  }, [intakeId]);

  const intake = status?.intake;
  const consultation = status?.consultation;
  const elapsed = Math.floor((now - startedAt) / 1000);
  const timedOut = !consultation && now - startedAt > WAIT_LIMIT_MS;

  function cancel() {
    startTransition(async () => {
      await cancelIntakeAction(intakeId);
      onCancelled?.();
    });
  }

  function join() {
    if (!consultation) return;
    startTransition(async () => {
      const r = await joinConsultationRoomAction(consultation.id);
      setRoom(r);
    });
  }

  const wrap: CSSProperties = {
    background: "var(--color-navy)",
    color: "#fff",
    borderRadius: 16,
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  };

  if (!status) {
    return (
      <div style={wrap}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Spinner /> Loading…
        </div>
      </div>
    );
  }

  if (intake?.status === "declined") {
    return (
      <div style={wrap}>
        <div>This request was cancelled.</div>
        <Button variant="outline" onClick={() => onGone?.()} style={{ width: "auto" }}>
          Start over
        </Button>
      </div>
    );
  }

  if (intake?.status === "none_available") {
    return (
      <div style={wrap}>
        <Callout tone="warning">No advocate is available for this right now.</Callout>
        <div style={{ fontSize: 13 }}>
          Free legal aid: National Legal Services Authority helpline <strong>15100</strong>. You can also book the next open slot with any verified advocate.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/advocates">
            <Button style={{ width: "auto" }}>Book a scheduled consultation</Button>
          </Link>
          <Button variant="outline" onClick={() => onGone?.()} style={{ width: "auto" }}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (!consultation) {
    return (
      <div style={wrap}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Spinner /> {timedOut ? "Still waiting…" : "Waiting for an advocate to accept…"}
        </div>
        <div style={{ fontSize: 12, color: "#9AA5BC" }}>
          Your request went to the best-matched verified advocates. The first to clear their conflict check and accept gets it. Waiting {Math.floor(elapsed / 60)}:
          {String(elapsed % 60).padStart(2, "0")}.
        </div>
        {timedOut && <Callout tone="warning">No advocate has accepted yet. You can keep waiting, cancel, or book a scheduled slot instead.</Callout>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="outline" onClick={cancel} disabled={isPending} style={{ width: "auto" }}>
            Cancel request
          </Button>
          {timedOut && (
            <Link href="/advocates">
              <Button style={{ width: "auto" }}>Book a scheduled slot</Button>
            </Link>
          )}
        </div>
      </div>
    );
  }

  const advocateName = consultation.advocate?.user?.full_name;

  return (
    <div style={{ ...wrap, gap: 14 }}>
      <Callout tone="success">Advocate matched · conflict check cleared</Callout>
      <div>
        <div style={{ fontWeight: 700 }}>Adv. {advocateName?.replace(/^Adv\.?\s*/i, "")}</div>
        <div style={{ fontSize: 12, color: "#9AA5BC" }}>
          {modeName(consultation.mode)} consultation · {inr(consultation.fee_total)} incl. fees &amp; GST
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: "#9AA5BC" }}>Online payment isn&apos;t enabled yet -- the fee is settled directly with the advocate.</div>

      {consultation.mode === "chat" ? (
        <Link href="/consultations">
          <Button style={{ width: "auto" }}>Open in Consultations</Button>
        </Link>
      ) : consultation.mode === "in_person" ? (
        <Callout tone="neutral">Your advocate will contact you to agree the place and time.</Callout>
      ) : !room ? (
        <Button variant="primary" onClick={join} disabled={isPending} style={{ width: "auto", background: "var(--color-gold)", color: "var(--color-navy)" }}>
          {isPending ? "Opening room…" : "Join call"}
        </Button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <iframe
            title="Consultation room"
            src={room.roomUrl}
            allow="camera; microphone; fullscreen; display-capture; autoplay"
            style={{ width: "100%", height: 360, border: 0, borderRadius: 12, background: "#000" }}
          />
          <div style={{ fontSize: 11.5, color: "#9AA5BC" }}>
            Recording is off.{" "}
            <a href={room.roomUrl} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
              Open in a new tab
            </a>{" "}
            if your browser blocks the camera here.
          </div>
        </div>
      )}
      <Link href="/consultations">
        <Button variant="outline" style={{ width: "auto" }}>
          Go to my consultations
        </Button>
      </Link>
    </div>
  );
}
