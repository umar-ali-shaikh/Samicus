import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useUI } from "../state/UIState";
import { useGet, useMut } from "../api/hooks";
import { api } from "../lib/api";
import { Card, Button, Badge, Callout, QueryBoundary, EmptyState } from "../components/ui";
import { PageHeader } from "../components/PageHeader";
import { Select, TextArea } from "../components/forms";
import { fmtDate } from "../lib/format";

function AnswerForm({ question }) {
  const [body, setBody] = useState("");
  const [open, setOpen] = useState(false);
  const submit = useMut(() => api.post(`/questions/${question.id}/answers`, { body }), { success: "Answer submitted for moderation.", onSuccess: () => { setBody(""); setOpen(false); } });
  if (!open) return <Button variant="outline" onClick={() => setOpen(true)} style={{ alignSelf: "flex-start" }}>Answer this question</Button>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <TextArea label="Your answer (general information only — do not create an advocate–client relationship)" rows={5} value={body} onChange={(e) => setBody(e.target.value)} hint="30–4,000 characters. Reviewed by our team before publishing." />
      <div style={{ display: "flex", gap: 8 }}><Button onClick={() => submit.mutate()} disabled={body.trim().length < 30 || submit.isPending}>Submit</Button><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button></div>
    </div>
  );
}

function QuestionCard({ q, canAnswer }) {
  const [openId, setOpenId] = useState(false);
  const helpful = useMut((id) => api.post(`/answers/${id}/helpful`), { invalidate: ["/questions"] });
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ cursor: "pointer" }} onClick={() => setOpenId(!openId)}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{q.body}</div>
          {q.practice_area && <Badge>{q.practice_area}</Badge>}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{q.answers.length} answer{q.answers.length === 1 ? "" : "s"} · asked {fmtDate(q.created_at)}{q.city ? ` · ${q.city}` : ""}</div>
      </div>
      {openId && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {q.answers.map((a) => (
            <div key={a.id} style={{ borderTop: "1px solid var(--color-border)", paddingTop: 8, fontSize: 12.5 }}>
              <strong>Adv. {a.advocate?.user?.full_name?.replace(/^Adv\.?\s*/i, "")}:</strong> <span style={{ whiteSpace: "pre-wrap" }}>{a.body}</span>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
                <button onClick={() => helpful.mutate(a.id)} style={{ background: "none", border: "none", color: "var(--color-rust)", cursor: "pointer", fontSize: 11.5, padding: 0 }}>Helpful ({a.helpful_count})</button>
                <span style={{ fontSize: 11, color: "var(--color-label)" }}>General information — does not create an advocate–client relationship.</span>
              </div>
            </div>
          ))}
          {canAnswer && <AnswerForm question={q} />}
        </div>
      )}
    </Card>
  );
}

export function Learn() {
  const { user, advocate } = useAuth();
  const { openModal } = useUI();
  const [text, setText] = useState("");
  const [area, setArea] = useState("");
  const [filterArea, setFilterArea] = useState("");
  const areas = useGet("/specialisations", undefined, { staleTime: 600000 });
  const questions = useGet("/questions", { area: filterArea || undefined });
  const mine = useGet("/questions/mine");
  const guides = useGet("/guides");
  const post = useMut(() => api.post("/questions", { body: text.trim(), practiceArea: area || undefined }), { invalidate: ["/questions"], success: "Posted anonymously. It appears after a quick review.", onSuccess: () => setText("") });
  const canAnswer = user.role === "advocate" && advocate?.verification_status === "verified";
  const pending = (mine.data || []).filter((q) => q.status === "pending_moderation");

  return (
    <div style={{ maxWidth: 820, display: "flex", flexDirection: "column", gap: 18 }}>
      <PageHeader title="Ask & learn" subtitle="Ask a general legal question anonymously. Verified advocates answer in public; nothing here creates an advocate–client relationship." />

      <Card style={{ background: "var(--color-navy)", color: "#fff", display: "flex", flexDirection: "column", gap: 10 }}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} placeholder="Ask a general legal question — never post private facts, names or documents." style={{ padding: 12, borderRadius: 10, border: "1px solid #2A3854", background: "#18233A", color: "#fff" }} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={area} onChange={(e) => setArea(e.target.value)} style={{ padding: 10, borderRadius: 9, border: "1px solid #2A3854", background: "#18233A", color: "#fff" }}>
            <option value="">Practice area (optional)</option>{(areas.data || []).map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
          </select>
          <Button onClick={() => post.mutate()} disabled={text.trim().length < 20 || post.isPending}>Post anonymously</Button>
        </div>
        {pending.length > 0 && <div style={{ fontSize: 12, color: "#9AA5BC" }}>{pending.length} of your question{pending.length === 1 ? " is" : "s are"} awaiting review.</div>}
      </Card>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontWeight: 700 }}>Answered by verified advocates</div>
          <Select value={filterArea} onChange={(e) => setFilterArea(e.target.value)} placeholder="All areas" options={(areas.data || []).map((a) => a.name)} />
        </div>
        <QueryBoundary query={questions} empty={<EmptyState title="No questions yet" body="Be the first to ask — approved questions appear here." />}>
          {(list) => <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{list.map((q) => <QuestionCard key={q.id} q={q} canAnswer={canAnswer} />)}</div>}
        </QueryBoundary>
      </div>

      <div>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Know your rights</div>
        <QueryBoundary query={guides} empty={<Callout tone="neutral">Guides will appear here once they've been published and reviewed.</Callout>}>
          {(list) => (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
              {list.map((g) => (
                <Card key={g.id} style={{ cursor: "pointer" }} onClick={() => openModal("guide", { guideId: g.id })}>
                  {g.tag && <Badge>{g.tag}</Badge>}
                  <div style={{ fontWeight: 600, marginTop: 6 }}>{g.title}</div>
                  {g.read_minutes && <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{g.read_minutes} min read</div>}
                </Card>
              ))}
            </div>
          )}
        </QueryBoundary>
      </div>
    </div>
  );
}
