"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdvocateDraftReviewDetailDto } from "@vidhira/contracts";
import { Card, Badge, Button, Callout, Select } from "@/components/ui";
import { TextArea } from "@/components/forms";
import { returnDraftReviewAction } from "@/server/draftingActions";

type Comment = { severity: "info" | "warn" | "critical"; body: string };

// Ported from frontend/src/screens/DraftReviews.jsx's ReviewDetail.
export function ReturnReviewClient({ detail }: { detail: AdvocateDraftReviewDetailDto }) {
  const router = useRouter();
  const [comments, setComments] = useState<Comment[]>([{ severity: "info", body: "" }]);
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const returned = detail.review.status === "returned";

  function send() {
    const valid = comments.filter((c) => c.body.trim().length >= 3).map((c) => ({ severity: c.severity, body: c.body.trim() }));
    setError(undefined);
    startTransition(async () => {
      const result = await returnDraftReviewAction(detail.review.id, { comments: valid });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/lawyer/draft-reviews");
    });
  }

  return (
    <div style={{ flex: "1 1 300px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontWeight: 700 }}>Your comments {returned && <Badge tone="success">returned</Badge>}</div>
      {error && <Callout tone="danger">{error}</Callout>}
      {returned
        ? detail.review.comments.map((c, i) => (
            <Callout key={i} tone={c.severity === "critical" ? "danger" : c.severity === "warn" ? "warning" : "neutral"}>
              {c.body}
            </Callout>
          ))
        : (
            <>
              {comments.map((c, i) => (
                <Card key={i} style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  <Select
                    label="Severity"
                    value={c.severity}
                    onChange={(e) => setComments(comments.map((x, j) => (j === i ? { ...x, severity: e.target.value as Comment["severity"] } : x)))}
                    options={[
                      ["info", "Note"],
                      ["warn", "Should change"],
                      ["critical", "Must change"],
                    ]}
                  />
                  <TextArea label="Comment" rows={3} value={c.body} onChange={(e) => setComments(comments.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))} />
                </Card>
              ))}
              <button
                onClick={() => setComments([...comments, { severity: "info", body: "" }])}
                style={{ alignSelf: "flex-start", background: "none", border: "none", color: "var(--color-rust)", cursor: "pointer", fontSize: 12.5 }}
              >
                + Add comment
              </button>
              <Button onClick={send} disabled={!comments.some((c) => c.body.trim().length >= 3) || isPending} style={{ alignSelf: "flex-start", width: "auto" }}>
                Return review to client
              </Button>
            </>
          )}
    </div>
  );
}
