import { useRef, useState } from "react";
import { askLegalAssistant } from "../api/legalAssistantClient";
import { Card, Button, Badge, Callout, EmptyState } from "../components/ui";

// Conversational "AI Legal Assistant" — distinct from the Case law search screen
// (which is a faceted research tool for browsing judgments directly). This screen is
// the RAG chat surface: natural-language questions in, a grounded + structured answer
// out, always with citations and a safety disclaimer.

const EXAMPLE_PROMPTS = [
  "Mere landlord ne security deposit return nahi kiya, kya kar sakta hoon?",
  "What are my rights if I am arrested?",
  "Section 138 NI Act ka kya meaning hai?",
  "Can an employer terminate me without notice?",
  "What does the Supreme Court say about anticipatory bail?",
  "Mere against FIR ho gayi hai, ab mujhe kya karna chahiye?",
];

const SECTION_META = [
  { key: "statute", label: "Law / statute", tone: "info" },
  { key: "judgments", label: "Court judgment(s)", tone: "neutral" },
  { key: "interpretation", label: "Legal interpretation", tone: "warning" },
  { key: "generalInformation", label: "General information", tone: "neutral" },
  { key: "practicalNextSteps", label: "Practical next steps", tone: "success" },
];

function AnswerCard({ turn }) {
  const { result } = turn;
  if (!result) return null;

  if (result.outcome === "no_evidence") {
    return (
      <Card>
        {result.emergency?.flag && (
          <Callout tone="danger" title="Time-sensitive" style={{ marginBottom: 12 }}>
            {result.emergency.message}
          </Callout>
        )}
        <EmptyState title="Insufficient sources" body={result.sections.insufficiencyNote} />
        <Callout tone="neutral" style={{ marginTop: 12 }}>{result.disclaimer}</Callout>
      </Card>
    );
  }

  const sections = SECTION_META.filter((s) => result.sections[s.key]);

  return (
    <Card>
      {result.emergency?.flag && (
        <Callout tone="danger" title="Time-sensitive" style={{ marginBottom: 12 }}>
          {result.emergency.message}
        </Callout>
      )}

      {result.outcome === "unparsed" && (
        <Callout tone="warning" style={{ marginBottom: 12 }}>
          The assistant's response couldn't be split into structured sections — shown below as general information.
        </Callout>
      )}

      {!result.sections.hasSufficientEvidence && result.sections.insufficiencyNote && (
        <Callout tone="warning" style={{ marginBottom: 12 }}>{result.sections.insufficiencyNote}</Callout>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {sections.map((s) => (
          <div key={s.key}>
            <Badge tone={s.tone}>{s.label}</Badge>
            <div style={{ fontSize: 13.5, lineHeight: 1.6, marginTop: 6, whiteSpace: "pre-wrap" }}>{result.sections[s.key]}</div>
          </div>
        ))}
      </div>

      {result.sources?.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Sources</div>
          <ol style={{ fontSize: 12, color: "var(--color-text-muted)", paddingLeft: 18 }}>
            {result.sources.map((s, i) => (
              <li key={s.tid} style={{ marginBottom: 3 }}>
                [{i + 1}]{" "}
                <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
                  {s.title}
                </a>{" "}
                <span style={{ opacity: 0.7 }}>({s.docsource})</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <Callout tone="neutral" style={{ marginTop: 14 }}>{result.disclaimer}</Callout>
    </Card>
  );
}

export function LegalAssistant() {
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const nextTurnId = useRef(0);

  async function ask(question) {
    const q = question.trim();
    if (!q || loading) return;
    setInput("");
    setError("");
    nextTurnId.current += 1;
    const turnId = nextTurnId.current;
    setTurns((t) => [...t, { id: turnId, question: q, result: null }]);
    setLoading(true);
    try {
      const result = await askLegalAssistant(q);
      setTurns((t) => t.map((turn) => (turn.id === turnId ? { ...turn, result } : turn)));
    } catch (err) {
      setError(err.message);
      setTurns((t) => t.filter((turn) => turn.id !== turnId));
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    ask(input);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 22 }}>AI Legal Assistant</div>
        <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
          Ask a question about Indian law in your own words — English, Hindi, or a mix. Answers are grounded in real Indian Kanoon
          sources with citations.
        </div>
      </div>

      <Callout tone="warning" title="Not a substitute for a lawyer">
        This assistant gives general legal information, not legal advice — it never guarantees outcomes and can't replace a
        qualified Indian lawyer. For arrests, violence, or urgent deadlines, contact a lawyer or the relevant authority
        immediately.
      </Callout>

      {turns.length === 0 && (
        <Card>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>Try asking</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {EXAMPLE_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => ask(p)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: "1px solid var(--color-border)",
                  background: "#fff",
                  fontSize: 12.5,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </Card>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {turns.map((turn) => (
          <div key={turn.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div
              style={{
                alignSelf: "flex-end",
                maxWidth: "85%",
                background: "var(--color-navy)",
                color: "#fff",
                padding: "10px 14px",
                borderRadius: "14px 14px 2px 14px",
                fontSize: 13.5,
              }}
            >
              {turn.question}
            </div>
            {turn.result ? (
              <AnswerCard turn={turn} />
            ) : (
              <Card style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Researching Indian Kanoon…</Card>
            )}
          </div>
        ))}
      </div>

      {error && <Callout tone="danger">{error}</Callout>}

      <form onSubmit={onSubmit} style={{ display: "flex", gap: 10, position: "sticky", bottom: 0 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Mujhe FIR ke baare mein jaanna hai…"
          style={{ flex: 1, padding: 12, borderRadius: 10, border: "1px solid var(--color-border)" }}
        />
        <Button type="submit" disabled={loading || !input.trim()}>{loading ? "Asking…" : "Ask"}</Button>
      </form>
    </div>
  );
}
