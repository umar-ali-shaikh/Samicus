"use client";

import { useState, useTransition } from "react";
import { ADMIN_ACCESS_REASON_MIN, type AdminMatterReviewDto } from "@vidhira/contracts";
import { Card, Button, Callout, EmptyState } from "@/components/ui";
import { TextInput, TextArea } from "@/components/forms";
import { fmtDate, fmtDateTime, STAGE_LABEL } from "@/lib/format";
import { accessMatterAction } from "@/server/adminMatterAccessActions";

export function MatterAccessClient() {
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [review, setReview] = useState<AdminMatterReviewDto | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const reasonLength = reason.trim().length;

  function open() {
    setError(undefined);
    setReview(null);
    startTransition(async () => {
      const result = await accessMatterAction({ reference: reference.trim(), reason: reason.trim() });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setReview(result.review);
      setReason("");
    });
  }

  return (
    <>
      <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>Open a matter</div>
        <TextInput label="Matter reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. VID-2026-0001" />
        <TextArea
          label="Reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          hint={`At least ${ADMIN_ACCESS_REASON_MIN} characters — e.g. the complaint reference and what you need to check. Kept in the access log; not shown to the client or advocate.`}
        />
        {error && <Callout tone="danger">{error}</Callout>}
        <Button onClick={open} disabled={!reference.trim() || reasonLength === 0 || isPending} style={{ alignSelf: "flex-start", width: "auto" }}>
          Record reason &amp; open
        </Button>
      </Card>

      {review && (
        <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 18 }}>{review.matter.title}</div>
            <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
              {review.matter.reference} · {STAGE_LABEL[review.matter.stage]} · opened {fmtDate(review.matter.opened_at)}
              {review.matter.account ? ` · ${review.matter.account.display_name}` : ""}
              {review.matter.advocate?.user ? ` · Adv. ${review.matter.advocate.user.full_name}` : ""}
            </div>
          </div>

          <section>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Timeline</div>
            {review.timeline.length === 0 ? (
              <EmptyState title="No events" body="Nothing has been recorded on this matter yet." />
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {review.timeline.map((e) => (
                  <li key={e.id}>
                    {fmtDateTime(e.occurred_at)} — {e.title}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Tasks</div>
            {review.tasks.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>No tasks.</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {review.tasks.map((t) => (
                  <li key={t.id}>
                    {t.label} · {t.owner_type}
                    {t.due_at ? ` · due ${fmtDate(t.due_at)}` : ""}
                    {t.completed_at ? ` · done ${fmtDate(t.completed_at)}` : " · open"}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Hearings</div>
            {review.hearings.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>No hearings.</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {review.hearings.map((h) => (
                  <li key={h.id}>
                    {fmtDateTime(h.listed_at)}
                    {h.forum ? ` · ${h.forum}` : ""}
                    {h.purpose ? ` · ${h.purpose}` : ""}
                    {h.outcome_note ? ` — ${h.outcome_note}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Documents (names only)</div>
            {review.documents.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>No documents.</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {review.documents.map((d) => (
                  <li key={d.id}>
                    {d.filename} · {d.kind} · {fmtDate(d.created_at)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </Card>
      )}
    </>
  );
}
