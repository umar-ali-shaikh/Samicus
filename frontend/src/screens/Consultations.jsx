import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useUI } from "../state/UIState";
import { useConfig, useGet, useMut } from "../api/hooks";
import { api } from "../lib/api";
import { payFor } from "../lib/payments";
import { Card, Badge, Button, Callout, QueryBoundary, EmptyState, Pill } from "../components/ui";
import { PageHeader } from "../components/PageHeader";
import { TextArea } from "../components/forms";
import { fmtDateTime, inr, modeName } from "../lib/format";

const STATE_TONE = { scheduled: "info", reminder_sent: "info", in_progress: "success", completed: "success", notes_published: "success", rescheduled: "warning", cancelled: "danger" };
const OPEN = ["scheduled", "reminder_sent", "in_progress"];

function Rating({ consultation }) {
  const [rating, setRating] = useState(0);
  const send = useMut((r) => api.post(`/consultations/${consultation.id}/feedback`, { rating: r }), { invalidate: ["/consultations"], success: "Thanks for the feedback." });
  if (consultation.csat_rating) return <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>You rated this {consultation.csat_rating}/5</span>;
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 12 }}>
      Rate:
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} onClick={() => { setRating(n); send.mutate(n); }} aria-label={`${n} stars`} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 17, color: n <= rating ? "#E8B356" : "#C9C1B2" }}>★</button>
      ))}
    </span>
  );
}

function Row({ c, side }) {
  const { user } = useAuth();
  const { openModal, go } = useUI();
  const config = useConfig();
  const [room, setRoom] = useState(null);
  const [notes, setNotes] = useState(c.notes || "");
  const [showNotes, setShowNotes] = useState(false);
  const paymentsOn = config.data?.payments?.enabled;
  const start = new Date(c.scheduled_start).getTime();
  const canJoin = OPEN.includes(c.state) && !["chat", "in_person"].includes(c.mode) && Date.now() > start - 15 * 60 * 1000 && Date.now() < start + 3 * 3600 * 1000;
  const canCancel = side === "client" && OPEN.includes(c.state) && Date.now() < start - 4 * 3600 * 1000;

  const join = useMut(() => api.post(`/consultations/${c.id}/room`), { invalidate: ["/consultations"], onSuccess: (r) => setRoom(r) });
  const patch = useMut((b) => api.patch(`/consultations/${c.id}`, b), { invalidate: ["/consultations"], success: "Updated." });
  const convert = useMut(() => api.post(`/consultations/${c.id}/convert-to-matter`, {}), { invalidate: ["/consultations", "/matters"], success: "Matter opened.", onSuccess: (r) => go("matters", r.matter.id) });
  const pay = useMut(() => payFor("consultation", c.id, { user, description: "Consultation" }), { invalidate: ["/consultations"], success: (ok) => (ok ? "Payment received." : "") });

  const who = side === "advocate" ? c.account?.display_name?.replace(/\s*\([0-9a-f]{6}\)$/, "") : `Adv. ${c.advocate?.user?.full_name?.replace(/^Adv\.?\s*/i, "")}`;

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700 }}>{who}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{modeName(c.mode)} · {fmtDateTime(c.scheduled_start)} IST · {c.intake?.practice_area?.name || ""}</div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "flex-start", flexWrap: "wrap" }}>
          <Badge tone={STATE_TONE[c.state]}>{c.state.replace("_", " ")}</Badge>
          {c.paid_at ? <Badge tone="success">paid {inr(c.fee_total)}</Badge> : <Badge tone="warning">{inr(c.fee_total)} {paymentsOn ? "unpaid" : "due directly"}</Badge>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {canJoin && <Button onClick={() => join.mutate()} disabled={join.isPending}>{join.isPending ? "Opening…" : "Join call"}</Button>}
        {side === "client" && !c.paid_at && paymentsOn && c.state !== "cancelled" && <Button variant="outline" onClick={() => pay.mutate()} disabled={pay.isPending}>Pay now</Button>}
        {c.mode === "chat" && OPEN.includes(c.state) && <Button variant="outline" onClick={() => go("messages")}>Open chat</Button>}
        {canCancel && <Button variant="ghost" onClick={() => window.confirm("Cancel this consultation?") && patch.mutate({ state: "cancelled" })}>Cancel</Button>}
        {side === "client" && ["completed", "notes_published"].includes(c.state) && <Rating consultation={c} />}
        {side === "client" && <Button variant="ghost" onClick={() => openModal("lawyer", { advocateId: c.advocate?.id })}>Advocate profile</Button>}
        {side === "advocate" && OPEN.includes(c.state) && <Button variant="outline" onClick={() => patch.mutate({ state: "completed" })}>Mark completed</Button>}
        {side === "advocate" && ["completed", "notes_published"].includes(c.state) && !c.converted_matter_id && <Button onClick={() => convert.mutate()} disabled={convert.isPending}>Convert to matter</Button>}
        {side === "advocate" && <Button variant="ghost" onClick={() => setShowNotes(!showNotes)}>{showNotes ? "Hide notes" : "Notes"}</Button>}
      </div>

      {side === "advocate" && showNotes && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <TextArea label="Consultation notes (visible to you only)" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
          <Button variant="outline" onClick={() => patch.mutate({ notes })} disabled={patch.isPending} style={{ alignSelf: "flex-start" }}>Save notes</Button>
        </div>
      )}

      {room && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <iframe title="Consultation room" src={room.roomUrl} allow="camera; microphone; fullscreen; display-capture; autoplay" style={{ width: "100%", height: 380, border: 0, borderRadius: 12, background: "#000" }} />
          <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>Recording is off. <a href={room.roomUrl} target="_blank" rel="noreferrer">Open in a new tab</a> if the camera is blocked here.</div>
        </div>
      )}
    </Card>
  );
}

export function Consultations() {
  const { user, activeAccount } = useAuth();
  const { actAsClient } = useUI();
  const advocateMode = user?.role === "advocate" && !actAsClient;
  const [filter, setFilter] = useState("Upcoming");
  const consultations = useGet("/consultations", undefined, { refetchInterval: 30000 });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader title="Consultations" subtitle="Rooms open 15 minutes before the scheduled time. Video and phone calls run on Jitsi Meet; recording is off." />
      <div style={{ display: "flex", gap: 8 }}>{["Upcoming", "Past"].map((f) => <Pill key={f} active={filter === f} onClick={() => setFilter(f)}>{f}</Pill>)}</div>
      <QueryBoundary
        query={consultations}
        isEmpty={(d) => scope(d, advocateMode, activeAccount, filter).length === 0}
        empty={<EmptyState title={`No ${filter.toLowerCase()} consultations`} body={advocateMode ? "Booked consultations appear here." : "Book an advocate from Find a lawyer or use Talk now."} />}
      >
        {(d) => <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{scope(d, advocateMode, activeAccount, filter).map((c) => <Row key={c.id} c={c} side={advocateMode ? "advocate" : "client"} />)}</div>}
      </QueryBoundary>
      {!advocateMode && <Callout tone="neutral">Cancelling or rescheduling is possible until 4 hours before the start time.</Callout>}
    </div>
  );
}

function scope(list, advocateMode, activeAccount, filter) {
  const mine = list.filter((c) => (advocateMode ? true : c.account_id === activeAccount?.id));
  const open = (c) => OPEN.includes(c.state) && new Date(c.scheduled_start).getTime() > Date.now() - 3 * 3600 * 1000;
  const rows = mine.filter((c) => (filter === "Upcoming" ? open(c) : !open(c)));
  return rows.sort((a, b) => (filter === "Upcoming" ? new Date(a.scheduled_start) - new Date(b.scheduled_start) : new Date(b.scheduled_start) - new Date(a.scheduled_start)));
}
