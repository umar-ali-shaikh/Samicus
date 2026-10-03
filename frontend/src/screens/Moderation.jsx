import { useGet, useMut } from "../api/hooks";
import { api } from "../lib/api";
import { Card, Button, EmptyState, QueryBoundary } from "../components/ui";
import { PageHeader } from "../components/PageHeader";

function Item({ type, id, children }) {
  const decide = useMut((decision) => api.post(`/admin/moderation/${type}/${id}`, { decision }), { invalidate: ["/admin"], success: (_, d) => (d === "published" ? "Published." : "Rejected.") });
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {children}
      <div style={{ display: "flex", gap: 8 }}>
        <Button onClick={() => decide.mutate("published")} disabled={decide.isPending}>Publish</Button>
        <Button variant="outline" onClick={() => decide.mutate("rejected")} disabled={decide.isPending}>Reject</Button>
      </div>
    </Card>
  );
}

export function Moderation() {
  const queue = useGet("/admin/moderation", undefined, { refetchInterval: 30000 });
  return (
    <div style={{ maxWidth: 820, display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader title="Moderation" subtitle="Public questions and advocate answers are reviewed before they're published. Reject anything with private facts, names, advertising or advice that creates a client relationship." />
      <QueryBoundary query={queue} isEmpty={(d) => d.questions.length + d.answers.length === 0} empty={<EmptyState title="Nothing to review" body="New questions and answers will appear here." />}>
        {(d) => (
          <>
            {d.questions.length > 0 && <div style={{ fontWeight: 700 }}>Questions</div>}
            {d.questions.map((q) => <Item key={q.id} type="question" id={q.id}><div style={{ fontSize: 13.5 }}>{q.body}</div><div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{[q.practice_area, q.city].filter(Boolean).join(" · ")}</div></Item>)}
            {d.answers.length > 0 && <div style={{ fontWeight: 700 }}>Answers</div>}
            {d.answers.map((a) => <Item key={a.id} type="answer" id={a.id}><div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>To: {a.question?.body}</div><div style={{ fontSize: 13.5, whiteSpace: "pre-wrap" }}>{a.body}</div><div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>by Adv. {a.advocate?.user?.full_name}</div></Item>)}
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
