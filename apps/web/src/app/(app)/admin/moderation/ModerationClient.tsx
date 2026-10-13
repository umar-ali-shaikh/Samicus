"use client";

import { useState, useTransition } from "react";
import type { ModerationQueueDto } from "@vidhira/contracts";
import { Card, Button, EmptyState, Callout } from "@/components/ui";
import { decideModerationAction } from "@/server/learnActions";

type Question = ModerationQueueDto["questions"][number];
type Answer = ModerationQueueDto["answers"][number];

function Item({ type, id, onDecided, children }: { type: "question" | "answer"; id: string; onDecided: (id: string) => void; children: React.ReactNode }) {
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  function decide(decision: "published" | "rejected") {
    setError(undefined);
    startTransition(async () => {
      const result = await decideModerationAction(type, id, { decision });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onDecided(id);
    });
  }

  return (
    <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
      {children}
      {error && <Callout tone="danger">{error}</Callout>}
      <div style={{ display: "flex", gap: 8 }}>
        <Button onClick={() => decide("published")} disabled={isPending} style={{ width: "auto" }}>
          Publish
        </Button>
        <Button variant="outline" onClick={() => decide("rejected")} disabled={isPending} style={{ width: "auto" }}>
          Reject
        </Button>
      </div>
    </Card>
  );
}

// Ported from frontend/src/screens/Moderation.jsx.
export function ModerationClient({ initialQueue }: { initialQueue: ModerationQueueDto }) {
  const [questions, setQuestions] = useState<Question[]>(initialQueue.questions);
  const [answers, setAnswers] = useState<Answer[]>(initialQueue.answers);

  if (questions.length + answers.length === 0) {
    return <EmptyState title="Nothing to review" body="New questions and answers will appear here." />;
  }

  return (
    <>
      {questions.length > 0 && <div style={{ fontWeight: 700 }}>Questions</div>}
      {questions.map((q) => (
        <Item key={q.id} type="question" id={q.id} onDecided={(id) => setQuestions((prev) => prev.filter((x) => x.id !== id))}>
          <div style={{ fontSize: 13.5 }}>{q.body}</div>
          <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{[q.practice_area, q.city].filter(Boolean).join(" · ")}</div>
        </Item>
      ))}
      {answers.length > 0 && <div style={{ fontWeight: 700 }}>Answers</div>}
      {answers.map((a) => (
        <Item key={a.id} type="answer" id={a.id} onDecided={(id) => setAnswers((prev) => prev.filter((x) => x.id !== id))}>
          <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>To: {a.question?.body}</div>
          <div style={{ fontSize: 13.5, whiteSpace: "pre-wrap" }}>{a.body}</div>
          <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>by Adv. {a.advocate?.user?.full_name}</div>
        </Item>
      ))}
    </>
  );
}
