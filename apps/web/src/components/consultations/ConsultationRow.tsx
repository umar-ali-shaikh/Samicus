"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ConsultationListItemDto } from "@vidhira/contracts";
import { Card, Badge, Button, Callout } from "@/components/ui";
import { TextArea } from "@/components/forms";
import { fmtDateTime, inr, modeName } from "@/lib/format";
import { joinConsultationRoomAction } from "@/server/intakeActions";
import { cancelConsultationAction, convertToMatterAction, markCompletedAction, saveNotesAction, submitFeedbackAction } from "@/server/consultationsActions";
import { payFor } from "@/lib/payments";

type Tone = "neutral" | "success" | "danger" | "warning" | "info";
const STATE_TONE: Record<string, Tone> = {
  scheduled: "info",
  reminder_sent: "info",
  in_progress: "success",
  completed: "success",
  notes_published: "success",
  rescheduled: "warning",
  cancelled: "danger",
};
const OPEN = ["scheduled", "reminder_sent", "in_progress"];

function Rating({ consultation }: { consultation: ConsultationListItemDto }) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [isPending, startTransition] = useTransition();
  if (consultation.csat_rating) return <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>You rated this {consultation.csat_rating}/5</span>;
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 12 }}>
      Rate:
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          disabled={isPending}
          onClick={() => {
            setRating(n);
            startTransition(async () => {
              await submitFeedbackAction(consultation.id, n);
              router.refresh();
            });
          }}
          aria-label={`${n} stars`}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 17, color: n <= rating ? "#E8B356" : "#C9C1B2" }}
        >
          ★
        </button>
      ))}
    </span>
  );
}

// Ported from frontend/src/screens/Consultations.jsx's Row. "Open chat" stays deferred -- the
// messaging domain's thread-by-matter model doesn't map onto a bare consultation. "Pay now"
// only renders when GET /config reports payments.enabled -- off by default until real
// Razorpay keys are configured (see apps/api/src/services/razorpay.js's paymentsEnabled()).
export function ConsultationRow({
  c,
  side,
  paymentsEnabled,
  user,
}: {
  c: ConsultationListItemDto;
  side: "client" | "advocate";
  paymentsEnabled: boolean;
  user: { full_name?: string; email?: string };
}) {
  const router = useRouter();
  const [room, setRoom] = useState<{ roomUrl: string } | null>(null);
  const [notes, setNotes] = useState(c.notes || "");
  const [showNotes, setShowNotes] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const [now] = useState(() => Date.now());

  const start = c.scheduled_start ? new Date(c.scheduled_start).getTime() : 0;
  const canJoin = OPEN.includes(c.state) && !["chat", "in_person"].includes(c.mode) && now > start - 15 * 60 * 1000 && now < start + 3 * 3600 * 1000;
  const canCancel = side === "client" && OPEN.includes(c.state) && now < start - 4 * 3600 * 1000;

  const who = side === "advocate" ? c.account?.display_name?.replace(/\s*\([0-9a-f]{6}\)$/, "") : `Adv. ${c.advocate?.user?.full_name?.replace(/^Adv\.?\s*/i, "")}`;

  function pay() {
    setError(undefined);
    startTransition(async () => {
      try {
        const paid = await payFor("consultation", c.id, { user, description: "Consultation" });
        if (paid) router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Payment failed.");
      }
    });
  }

  function join() {
    setError(undefined);
    startTransition(async () => {
      const r = await joinConsultationRoomAction(c.id);
      setRoom(r);
    });
  }

  function cancel() {
    if (!window.confirm("Cancel this consultation?")) return;
    setError(undefined);
    startTransition(async () => {
      const result = await cancelConsultationAction(c.id);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  function markCompleted() {
    setError(undefined);
    startTransition(async () => {
      const result = await markCompletedAction(c.id);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  function saveNotes() {
    setError(undefined);
    startTransition(async () => {
      const result = await saveNotesAction(c.id, notes);
      if (!result.ok) setError(result.error);
    });
  }

  function convert() {
    setError(undefined);
    setNotice(undefined);
    startTransition(async () => {
      const result = await convertToMatterAction(c.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(`Matter opened: ${(result.result.matter as { reference?: string }).reference ?? "see Matters"}.`);
      router.refresh();
    });
  }

  return (
    <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700 }}>{who}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            {modeName(c.mode)} · {fmtDateTime(c.scheduled_start)} IST · {c.intake?.practice_area?.name || ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "flex-start", flexWrap: "wrap" }}>
          <Badge tone={STATE_TONE[c.state]}>{c.state.replace("_", " ")}</Badge>
          {c.paid_at ? <Badge tone="success">paid {inr(c.fee_total)}</Badge> : <Badge tone="warning">{inr(c.fee_total)} {paymentsEnabled ? "unpaid" : "due directly"}</Badge>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {canJoin && (
          <Button onClick={join} disabled={isPending} style={{ width: "auto" }}>
            {isPending ? "Opening…" : "Join call"}
          </Button>
        )}
        {canCancel && (
          <Button variant="ghost" onClick={cancel} style={{ width: "auto" }}>
            Cancel
          </Button>
        )}
        {side === "client" && !c.paid_at && paymentsEnabled && c.state !== "cancelled" && (
          <Button variant="outline" onClick={pay} disabled={isPending} style={{ width: "auto" }}>
            Pay {inr(c.fee_total)}
          </Button>
        )}
        {side === "client" && ["completed", "notes_published"].includes(c.state) && <Rating consultation={c} />}
        {side === "client" && c.advocate && (
          <Link href={`/advocates/${c.advocate.id}`}>
            <Button variant="ghost" style={{ width: "auto" }}>
              Advocate profile
            </Button>
          </Link>
        )}
        {side === "advocate" && OPEN.includes(c.state) && (
          <Button variant="outline" onClick={markCompleted} disabled={isPending} style={{ width: "auto" }}>
            Mark completed
          </Button>
        )}
        {side === "advocate" && ["completed", "notes_published"].includes(c.state) && !c.converted_matter_id && (
          <Button onClick={convert} disabled={isPending} style={{ width: "auto" }}>
            Convert to matter
          </Button>
        )}
        {side === "advocate" && (
          <Button variant="ghost" onClick={() => setShowNotes(!showNotes)} style={{ width: "auto" }}>
            {showNotes ? "Hide notes" : "Notes"}
          </Button>
        )}
      </div>

      {side === "advocate" && showNotes && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <TextArea label="Consultation notes (visible to you only)" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
          <Button variant="outline" onClick={saveNotes} disabled={isPending} style={{ alignSelf: "flex-start", width: "auto" }}>
            Save notes
          </Button>
        </div>
      )}

      {notice && <Callout tone="success">{notice}</Callout>}
      {error && <Callout tone="danger">{error}</Callout>}

      {room && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <iframe
            title="Consultation room"
            src={room.roomUrl}
            allow="camera; microphone; fullscreen; display-capture; autoplay"
            style={{ width: "100%", height: 380, border: 0, borderRadius: 12, background: "#000" }}
          />
          <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>
            Recording is off.{" "}
            <a href={room.roomUrl} target="_blank" rel="noreferrer">
              Open in a new tab
            </a>{" "}
            if the camera is blocked here.
          </div>
        </div>
      )}
    </Card>
  );
}
