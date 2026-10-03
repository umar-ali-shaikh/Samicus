import { useState } from "react";
import { useGet, useMut } from "../api/hooks";
import { api } from "../lib/api";
import { Card, Badge, Button, Callout, QueryBoundary, EmptyState, Loading } from "../components/ui";
import { PageHeader } from "../components/PageHeader";
import { Select, TextArea } from "../components/forms";
import { fmtDateTime } from "../lib/format";

function ReviewDetail({ id, onClose }) {
  const detail = useGet(`/advocate/draft-reviews/${id}`);
  const [comments, setComments] = useState([{ severity: "info", body: "" }]);
  const send = useMut(() => api.post(`/advocate/draft-reviews/${id}/return`, { comments: comments.filter((c) => c.body.trim().length >= 3).map((c) => ({ severity: c.severity, body: c.body.trim() })) }), { invalidate: ["/advocate/draft-reviews"], success: "Review returned to the client.", onSuccess: onClose });
  if (detail.isPending) return <Loading />;
  if (detail.isError) return <Callout tone="danger">{detail.error.message}</Callout>;
  const { review, draft } = detail.data;
  const returned = review.status === "returned";
  return (
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 340px" }}>
        <Button variant="ghost" onClick={onClose}>← All reviews</Button>
        <Card style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--color-label)", marginBottom: 8 }}>DRAFT UNDER REVIEW</div>
          {draft.blocks.map((b) => (
            <div key={b.n} style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5 }}>{b.n}. {b.heading} {b.reviewAdvised && <Badge tone="warning">REVIEW ADVISED</Badge>}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)", whiteSpace: "pre-wrap" }}>{b.text}</div>
            </div>
          ))}
        </Card>
      </div>
      <div style={{ flex: "1 1 300px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontWeight: 700 }}>Your comments {returned && <Badge tone="success">returned</Badge>}</div>
        {returned ? (review.comments || []).map((c, i) => <Callout key={i} tone={c.severity === "critical" ? "danger" : c.severity === "warn" ? "warning" : "neutral"}>{c.body}</Callout>) : (
          <>
            {comments.map((c, i) => (
              <Card key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Select label="Severity" value={c.severity} onChange={(e) => setComments(comments.map((x, j) => (j === i ? { ...x, severity: e.target.value } : x)))} options={[["info", "Note"], ["warn", "Should change"], ["critical", "Must change"]]} />
                <TextArea label="Comment" rows={3} value={c.body} onChange={(e) => setComments(comments.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))} />
              </Card>
            ))}
            <button onClick={() => setComments([...comments, { severity: "info", body: "" }])} style={{ alignSelf: "flex-start", background: "none", border: "none", color: "var(--color-rust)", cursor: "pointer", fontSize: 12.5 }}>+ Add comment</button>
            <Button onClick={() => send.mutate()} disabled={!comments.some((c) => c.body.trim().length >= 3) || send.isPending} style={{ alignSelf: "flex-start" }}>Return review to client</Button>
          </>
        )}
      </div>
    </div>
  );
}

export function DraftReviews() {
  const reviews = useGet("/advocate/draft-reviews");
  const [openId, setOpenId] = useState(null);
  if (openId) return <ReviewDetail id={openId} onClose={() => setOpenId(null)} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader title="Draft reviews" subtitle="Clients ask you to review a document they drafted on Samicus. Return comments within the stated turnaround." />
      <QueryBoundary query={reviews} empty={<EmptyState title="No review requests" body="Paid draft-review requests from clients appear here." />}>
        {(list) => list.map((r) => (
          <Card key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, cursor: "pointer" }} onClick={() => setOpenId(r.id)}>
            <div><div style={{ fontWeight: 600 }}>{r.draft?.template?.name}</div><div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>Requested {fmtDateTime(r.submitted_at)}</div></div>
            <Badge tone={r.status === "returned" ? "success" : "warning"}>{r.status.replace("_", " ")}</Badge>
          </Card>
        ))}
      </QueryBoundary>
    </div>
  );
}
