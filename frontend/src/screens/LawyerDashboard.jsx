import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useUI } from "../state/UIState";
import { useGet, useMut } from "../api/hooks";
import { api } from "../lib/api";
import { Card, Button, Badge, Callout, QueryBoundary, Loading } from "../components/ui";
import { PageHeader } from "../components/PageHeader";
import { VerificationStatus } from "./profile/AdvocateForms";
import { fmtDateTime, modeName, STAGE_LABEL } from "../lib/format";

const URGENCY = { today: "Today", "48h": "Within 48h", week: "This week", deadline: "Has a deadline" };

function RequestCard({ r }) {
  const { showToast } = useUI();
  const [facts, setFacts] = useState(null);
  const conflict = useMut(() => api.post(`/advocate/requests/${r.id}/conflict-check`), { invalidate: ["/advocate/requests"], onSuccess: (c) => showToast(c.status === "clear" ? "Conflict check clear. Facts can now be disclosed once the client has consented." : "Conflict found — you cannot take this request.") });
  const accept = useMut(() => api.post(`/advocate/requests/${r.id}/accept`), { invalidate: ["/advocate/requests", "/matters", "/consultations"], success: "Accepted. A matter has been opened and a secure conversation started." });
  const decline = useMut(() => api.post(`/advocate/requests/${r.id}/decline`), { invalidate: ["/advocate/requests"], success: "Declined. No reason is recorded or shown." });
  const view = useMut(() => api.get(`/advocate/requests/${r.id}`), { onSuccess: setFacts });
  const cleared = r.conflict_status === "clear";

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700 }}>{r.practice_area?.name || "New request"} · {r.kind}{r.kind !== "scheduled" ? " ⚡" : ""}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{URGENCY[r.urgency]} · {modeName(r.mode)} · {r.language.toUpperCase()}{r.city ? ` · ${r.city}` : ""}{r.state ? `, ${r.state}` : ""} · received {fmtDateTime(r.created_at)}</div>
        </div>
        <Badge tone={cleared ? "success" : r.conflict_status === "conflict" ? "danger" : "neutral"}>Conflict check: {r.conflict_status}</Badge>
      </div>
      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>The client's facts are withheld until your conflict check clears and they have consented.</div>
      {facts?.factsReleased && <Callout tone="neutral" title="Client's description">{facts.description || "No description provided."}</Callout>}
      {facts && !facts.factsReleased && <Callout tone="warning">Facts are not released yet{!cleared ? " — run the conflict check first" : " — the client hasn't consented"}.</Callout>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {r.conflict_status !== "clear" && <Button variant="outline" onClick={() => conflict.mutate()} disabled={conflict.isPending}>Run conflict check</Button>}
        {cleared && <Button variant="outline" onClick={() => view.mutate()}>View facts</Button>}
        <Button onClick={() => accept.mutate()} disabled={!cleared || accept.isPending} style={{ opacity: cleared ? 1 : 0.5 }}>Accept request</Button>
        <Button variant="ghost" onClick={() => decline.mutate()} disabled={decline.isPending}>Decline without reason</Button>
      </div>
    </Card>
  );
}

export function LawyerDashboard() {
  const { user, advocate, refresh } = useAuth();
  const { go } = useUI();
  const verified = advocate?.verification_status === "verified";
  const requests = useGet("/advocate/requests", undefined, { enabled: verified, refetchInterval: 15000 });
  const consultations = useGet("/consultations");
  const matters = useGet("/matters");
  const tasks = useGet("/tasks/mine");
  const reviews = useGet("/advocate/draft-reviews");
  const threads = useGet("/threads");

  const availability = useMut((b) => api.patch("/advocate/availability", b), { onSuccess: refresh, invalidate: ["/advocate"], success: "Updated." });

  if (!advocate) return <Callout tone="warning">No advocate profile yet. <a href="#profile">Apply to list</a>.</Callout>;

  const online = advocate.availability_state === "available";
  const upcoming = (consultations.data || []).filter((c) => ["scheduled", "reminder_sent", "in_progress"].includes(c.state) && new Date(c.scheduled_start) > new Date(Date.now() - 3 * 3600 * 1000)).sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start));
  const mine = (matters.data || []).filter((m) => m.mySide === "advocate" && !["closed", "archived"].includes(m.stage));
  const pendingReviews = (reviews.data || []).filter((r) => r.status !== "returned");
  const unread = (threads.data || []).reduce((n, t) => n + (t.unread || 0), 0);

  return (
    <div style={{ maxWidth: 1000, display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader
        title={`Adv. ${user.full_name.replace(/^Adv\.?\s*/i, "")}`}
        subtitle={`${advocate.bar_council} · ${advocate.enrolment_number}`}
        actions={verified && (
          <>
            <Button variant={online ? "primary" : "outline"} onClick={() => availability.mutate({ availabilityState: online ? "offline" : "available" })} disabled={availability.isPending}>{online ? "Accepting requests" : "Not accepting requests"}</Button>
            <Button variant="outline" onClick={() => availability.mutate({ acceptsUrgent: !advocate.accepts_urgent })} disabled={availability.isPending}>Urgent: {advocate.accepts_urgent ? "on" : "off"}</Button>
          </>
        )}
      />

      {!verified && <VerificationStatus advocate={advocate} />}

      {verified && (
        <div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 17, marginBottom: 10 }}>Incoming requests</div>
          <QueryBoundary query={requests} empty={<Card><div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{online ? "No open requests right now. They appear here the moment a client is matched to you." : "You're not accepting requests. Switch on “Accepting requests” to receive new clients."}</div></Card>}>
            {(list) => <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{list.map((r) => <RequestCard key={r.id} r={r} />)}</div>}
          </QueryBoundary>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        <Card style={{ cursor: "pointer" }} onClick={() => go("consultations")}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Upcoming consultations</div>
          {consultations.isPending ? <Loading /> : upcoming.length === 0 ? <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>None scheduled.</div> : upcoming.slice(0, 4).map((c) => <div key={c.id} style={{ fontSize: 12, marginBottom: 3 }}>{fmtDateTime(c.scheduled_start)} · {modeName(c.mode)}</div>)}
        </Card>
        <Card style={{ cursor: "pointer" }} onClick={() => go("matters")}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Active matters ({mine.length})</div>
          {matters.isPending ? <Loading /> : mine.length === 0 ? <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>None yet.</div> : mine.slice(0, 4).map((m) => <div key={m.id} style={{ fontSize: 12, marginBottom: 3 }}>{m.title}: {m.next_action || STAGE_LABEL[m.stage]}</div>)}
        </Card>
        <Card>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Needs attention</div>
          <div style={{ fontSize: 12, cursor: "pointer" }} onClick={() => go("matters")}>{(tasks.data || []).length} open task{(tasks.data || []).length === 1 ? "" : "s"}</div>
          <div style={{ fontSize: 12, cursor: "pointer" }} onClick={() => go("draftreviews")}>{pendingReviews.length} draft review{pendingReviews.length === 1 ? "" : "s"} waiting</div>
          <div style={{ fontSize: 12, cursor: "pointer" }} onClick={() => go("messages")}>{unread} unread message{unread === 1 ? "" : "s"}</div>
        </Card>
      </div>

      <Callout tone="neutral">Response time, acceptance rate and conversion are tracked internally for quality and are never shown to clients as a ranking.</Callout>
    </div>
  );
}
