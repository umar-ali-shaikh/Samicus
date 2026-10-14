"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { GuideListItemDto, PublicQuestionDto, SpecialisationDto } from "@vidhira/contracts";
import { Card, Button, Badge, Callout, EmptyState, Select } from "@/components/ui";
import { TextArea } from "@/components/forms";
import { fmtDate } from "@/lib/format";
import { askQuestionAction, answerQuestionAction, listQuestionsAction, markAnswerHelpfulAction } from "@/server/learnActions";

function AnswerForm({ questionId, onSubmitted }: { questionId: string; onSubmitted: () => void }) {
  const [body, setBody] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(undefined);
    startTransition(async () => {
      const result = await answerQuestionAction(questionId, { body });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBody("");
      setOpen(false);
      onSubmitted();
    });
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)} style={{ alignSelf: "flex-start", width: "auto" }}>
        Answer this question
      </Button>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {error && <Callout tone="danger">{error}</Callout>}
      <TextArea
        label="Your answer (general information only — do not create an advocate–client relationship)"
        rows={5}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        hint="30–4,000 characters. Reviewed by our team before publishing."
      />
      <div style={{ display: "flex", gap: 8 }}>
        <Button onClick={submit} disabled={body.trim().length < 30 || isPending} style={{ width: "auto" }}>
          Submit
        </Button>
        <Button variant="outline" onClick={() => setOpen(false)} style={{ width: "auto" }}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function QuestionCard({ q, canAnswer, onChanged }: { q: PublicQuestionDto; canAnswer: boolean; onChanged: () => void }) {
  const [openId, setOpenId] = useState(false);
  const [answers, setAnswers] = useState(q.answers);
  const [, startTransition] = useTransition();

  function markHelpful(answerId: string) {
    startTransition(async () => {
      const result = await markAnswerHelpfulAction(answerId);
      setAnswers((prev) => prev.map((a) => (a.id === answerId ? { ...a, helpful_count: result.helpful_count } : a)));
    });
  }

  return (
    <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ cursor: "pointer" }} onClick={() => setOpenId(!openId)}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{q.body}</div>
          {q.practice_area && <Badge>{q.practice_area}</Badge>}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>
          {answers.length} answer{answers.length === 1 ? "" : "s"} · asked {fmtDate(q.created_at)}
          {q.city ? ` · ${q.city}` : ""}
        </div>
      </div>
      {openId && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {answers.map((a) => (
            <div key={a.id} style={{ borderTop: "1px solid var(--color-border)", paddingTop: 8, fontSize: 12.5 }}>
              <strong>Adv. {a.advocate?.user?.full_name?.replace(/^Adv\.?\s*/i, "")}:</strong> <span style={{ whiteSpace: "pre-wrap" }}>{a.body}</span>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
                <button onClick={() => markHelpful(a.id)} style={{ background: "none", border: "none", color: "var(--color-rust)", cursor: "pointer", fontSize: 11.5, padding: 0 }}>
                  Helpful ({a.helpful_count})
                </button>
                <span style={{ fontSize: 11, color: "var(--color-label)" }}>General information — does not create an advocate–client relationship.</span>
              </div>
            </div>
          ))}
          {canAnswer && <AnswerForm questionId={q.id} onSubmitted={onChanged} />}
        </div>
      )}
    </Card>
  );
}

// Ported from frontend/src/screens/Learn.jsx.
export function LearnClient({
  areas,
  initialQuestions,
  guides,
  canAnswer,
  pendingCount,
}: {
  areas: SpecialisationDto[];
  initialQuestions: PublicQuestionDto[];
  guides: GuideListItemDto[];
  canAnswer: boolean;
  pendingCount: number;
}) {
  const [text, setText] = useState("");
  const [area, setArea] = useState("");
  const [filterArea, setFilterArea] = useState("");
  const [questions, setQuestions] = useState(initialQuestions);
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [pending, setPending] = useState(pendingCount);
  const [isPending, startTransition] = useTransition();

  function refreshQuestions(nextArea: string) {
    startTransition(async () => {
      setQuestions(await listQuestionsAction(nextArea || undefined));
    });
  }

  function post() {
    setError(undefined);
    setNotice(undefined);
    startTransition(async () => {
      const result = await askQuestionAction({ body: text.trim(), practiceArea: area || undefined });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setText("");
      setNotice("Posted anonymously. It appears after a quick review.");
      setPending((p) => p + 1);
    });
  }

  return (
    <div style={{ maxWidth: 820, display: "flex", flexDirection: "column", gap: 18, padding: 24 }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-serif)", margin: 0 }}>Ask & learn</h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
          Ask a general legal question anonymously. Verified advocates answer in public; nothing here creates an advocate–client relationship.
        </p>
      </div>

      <Card style={{ padding: 16, background: "var(--color-navy)", color: "#fff", display: "flex", flexDirection: "column", gap: 10 }}>
        {error && <Callout tone="danger">{error}</Callout>}
        {notice && <Callout tone="success">{notice}</Callout>}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Ask a general legal question — never post private facts, names or documents."
          style={{ padding: 12, borderRadius: 10, border: "1px solid #2A3854", background: "#18233A", color: "#fff" }}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select aria-label="Practice area" value={area} onChange={(e) => setArea(e.target.value)} style={{ padding: 10, borderRadius: 9, border: "1px solid #2A3854", background: "#18233A", color: "#fff" }}>
            <option value="">Practice area (optional)</option>
            {areas.map((a) => (
              <option key={a.id} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>
          <Button onClick={post} disabled={text.trim().length < 20 || isPending} style={{ width: "auto" }}>
            Post anonymously
          </Button>
        </div>
        {pending > 0 && <div style={{ fontSize: 12, color: "#9AA5BC" }}>{pending} of your question{pending === 1 ? " is" : "s are"} awaiting review.</div>}
      </Card>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontWeight: 700 }}>Answered by verified advocates</div>
          <Select
            aria-label="Filter by practice area"
            value={filterArea}
            onChange={(e) => {
              setFilterArea(e.target.value);
              refreshQuestions(e.target.value);
            }}
            placeholder="All areas"
            options={areas.map((a) => a.name)}
          />
        </div>
        {questions.length === 0 ? (
          <EmptyState title="No questions yet" body="Be the first to ask — approved questions appear here." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {questions.map((q) => (
              <QuestionCard key={q.id} q={q} canAnswer={canAnswer} onChanged={() => refreshQuestions(filterArea)} />
            ))}
          </div>
        )}
      </div>

      <div>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Know your rights</div>
        {guides.length === 0 ? (
          <Callout tone="neutral">Guides will appear here once they&apos;ve been published and reviewed.</Callout>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
            {guides.map((g) => (
              <Link key={g.id} href={`/learn/guides/${g.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                <Card style={{ padding: 16, cursor: "pointer" }}>
                  {g.tag && <Badge>{g.tag}</Badge>}
                  <div style={{ fontWeight: 600, marginTop: 6 }}>{g.title}</div>
                  {g.read_minutes && <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{g.read_minutes} min read</div>}
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
