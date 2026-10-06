import { useState } from "react";
import { useConfig, useGet, useMut } from "../../api/hooks";
import { useUI } from "../../state/UIState";
import { api } from "../../lib/api";
import { Card, Callout, Button, Pill, Badge, Loading } from "../../components/ui";

// Static UI config only — the four fixed corpus categories and three example prompts shown
// before any search. Clicking a card or an example still runs a real retrieval against the
// real corpus; nothing about the counts, dates or results below is hard-coded.
const CORPUS_CARDS = [
  { source: "bare_act", label: "Bare Acts", detail: "Central Acts, as amended" },
  { source: "supreme_court", label: "Supreme Court", detail: "Reported judgments" },
  { source: "high_court", label: "High Courts", detail: "25 High Courts" },
  { source: "rules", label: "Rules & notifications", detail: "Subordinate legislation" },
];

const TRY_QUERIES = [
  { q: "Can my employer enforce a non-compete after I resign?", area: "Employment" },
  { q: "What is the time limit to send a notice for a bounced cheque?", area: "Money recovery" },
  { q: "Is my landlord allowed to keep my deposit for repainting?", area: "Property" },
];

const SOURCE_FILTERS = [
  { value: "bare_act", label: "Bare acts" },
  { value: "supreme_court", label: "Supreme Court" },
  { value: "high_court", label: "High Courts" },
  { value: "tribunal", label: "Tribunals" },
  { value: "web", label: "Articles" },
];

function formatDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
}

const EYEBROW_STYLE = { fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--color-label)" };

// Why a "No match" happened — shown as the badge's tooltip, never just a bare dead end.
const NOT_FOUND_REASON_LABEL = {
  corpus_gap: "The library doesn't have anything on this yet, even after trying to fetch new sources automatically.",
  ingest_failed: "A likely source was found but indexing it failed — try again, or rephrase.",
  below_threshold: "Something close was found but didn't clear the relevance bar.",
};

function notFoundTooltip(row) {
  const reason = NOT_FOUND_REASON_LABEL[row.not_found_reason] || "No passage cleared the relevance threshold.";
  const score = typeof row.top_score === "number" ? ` (best match: ${row.top_score.toFixed(2)})` : "";
  return `${reason}${score}`;
}

function CorpusCards() {
  const status = useGet("/corpus/status", undefined, { staleTime: 60000 });
  if (status.isLoading) return <Loading label="Loading the corpus…" />;
  if (!status.data) return null;
  const bySource = status.data.bySource || [];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
      {CORPUS_CARDS.map((c) => {
        const row = bySource.find((s) => s.source === c.source);
        return (
          <Card key={c.source} style={{ display: "flex", flexDirection: "column", gap: 4, padding: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{c.label}</div>
            <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{c.detail}</div>
            {row ? (
              <div style={{ fontSize: 12, color: "var(--color-text)", marginTop: 4 }}>
                {Number(row.count).toLocaleString("en-IN")} item{Number(row.count) === 1 ? "" : "s"}
                {row.indexed_at && <> · indexed to {formatDate(row.indexed_at)}</>}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--color-label)", marginTop: 4 }}>Not yet indexed</div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function MyResearchCard({ row, onChanged }) {
  const { go } = useUI();
  const pin = useMut((pinned) => api.patch(`/research/queries/${row.id}`, { pinned }), { onSuccess: onChanged });
  const remove = useMut(() => api.delete(`/research/queries/${row.id}`), { success: "Deleted.", onSuccess: onChanged });
  // Re-runs THIS saved question through live retrieval again (new sources may have been
  // indexed since) — a separate API call keyed off row.id, never touching the home
  // screen's own search input/question state, so it can never collide with (or get
  // overwritten by) a different question the user types into that box next.
  const retry = useMut(() => api.post(`/research/queries/${row.id}/refresh`), { onSuccess: ({ searchId }) => go("research", searchId) });
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <button onClick={() => go("research", row.id)} style={{ all: "unset", cursor: "pointer", display: "block" }}>
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{row.title || row.text}</div>
      </button>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 11.5, color: "var(--color-text-muted)" }}>
        <span>{timeAgo(row.updated_at || row.created_at)}</span>
        <span>·</span>
        <span>{row.caseCount} case{row.caseCount === 1 ? "" : "s"}</span>
        {row.topCourt && <><span>·</span><span>{row.topCourt}</span></>}
        <span title={row.outcome === "not_found" ? notFoundTooltip(row) : undefined}>
          <Badge tone={row.outcome === "not_found" ? "warning" : "success"}>{row.outcome === "not_found" ? "No match" : row.outcome}</Badge>
        </span>
        {row.rerun_count > 1 && <Badge tone="neutral">Re-run ×{row.rerun_count}</Badge>}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {row.outcome === "not_found" && (
          <Button variant="outline" onClick={() => retry.mutate()} disabled={retry.isPending}>{retry.isPending ? "Retrying…" : "Retry"}</Button>
        )}
        <Button variant="outline" onClick={() => pin.mutate(!row.pinned_at)} disabled={pin.isPending}>{row.pinned_at ? "Unpin" : "Pin"}</Button>
        <Button variant="ghost" onClick={() => window.confirm(`Delete "${row.title || row.text}"?`) && remove.mutate()}>Delete</Button>
      </div>
    </Card>
  );
}

export function ResearchHome() {
  const config = useConfig();
  const { go, researchQuestion: question, setResearchQuestion: setQuestion } = useUI();
  const [sourcesEnabled, setSourcesEnabled] = useState([]);
  const [libraryQuery, setLibraryQuery] = useState("");

  const status = useGet("/corpus/status", undefined, { staleTime: 60000 });
  const lawAsOn = formatDate(status.data?.lawAsOn);

  const myResearch = useGet("/research/queries", libraryQuery.trim() ? { q: libraryQuery.trim() } : undefined);
  const examples = useGet("/research/queries", { tag: "example" }, { enabled: !libraryQuery.trim() && myResearch.data?.length === 0 });

  const run = useMut(
    async (text) => {
      const { retrievalId } = await api.post("/research/retrieve", { text, sourcesEnabled });
      await api.post("/research/answer", { retrievalId });
      return retrievalId;
    },
    // researchQuestion is global UI state (so a question typed on this screen survives
    // navigating to the report and back) — it must be cleared here, not left for the report
    // screen's own back button, or returning to #research by any OTHER route (closing the
    // tab and reopening, a different nav link) leaves the previous question sitting in the
    // box, and the next thing typed lands in/next to it instead of a clean field.
    { onSuccess: (id) => { setQuestion(""); go("research", id); } }
  );

  const disabled = config.data && !config.data.research.enabled;
  const toggleSource = (value) => setSourcesEnabled((cur) => (cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]));

  return (
    <div className="research-page" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 1. Title + LAW AS ON chip */}
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 26 }}>Vidhira Research</div>
        {lawAsOn && (
          <span style={{ background: "var(--color-gold)", color: "var(--color-navy)", borderRadius: 999, padding: "5px 12px", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em" }}>
            LAW AS ON {lawAsOn.toUpperCase()}
          </span>
        )}
      </div>

      {/* 2. Intro paragraph */}
      <div style={{ fontSize: 13.5, color: "var(--color-text-muted)", lineHeight: 1.6, maxWidth: 760 }}>
        Vidhira Research answers only from statutes, rules and reported judgments it has actually indexed and retrieved for your question — never from memory. Every sentence in the note below carries the verbatim passage it came from, with the court, the section and a link to the source, so you can verify it before relying on it.
      </div>

      {disabled && <Callout tone="warning" title="Not enabled on this deployment">The research library needs Qdrant and OpenRouter to be configured (see .env.example).</Callout>}

      {/* 3. Eyebrow */}
      <div style={EYEBROW_STYLE}>RETRIEVAL-THEN-CITE · CORPUS OF RECORD</div>

      {/* 4. Search the corpus */}
      <Card style={{ background: "var(--color-navy)", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && question.trim().length >= 5 && run.mutate(question.trim())}
            maxLength={1000}
            placeholder="Search the corpus — statutes, rules and reported judgments"
            style={{ flex: "1 1 200px", minWidth: 0, padding: 12, borderRadius: 10, border: "1px solid #2A3854", background: "#18233A", color: "#fff" }}
          />
          <Button onClick={() => run.mutate(question.trim())} disabled={question.trim().length < 5 || run.isPending || disabled}>{run.isPending ? "Researching…" : "Research"}</Button>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {SOURCE_FILTERS.map((f) => (
            <Pill key={f.value} tone="dark" active={sourcesEnabled.includes(f.value)} onClick={() => toggleSource(f.value)}>{f.label}</Pill>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: "#9AA5BC" }}>
          {run.isPending
            ? "Searching the indexed library — if nothing matches yet, new sources are fetched and indexed automatically before answering. This can take up to a minute."
            : "The library grows as questions are asked here or in the AI Legal Assistant."}
        </div>
      </Card>
      {run.isError && <Callout tone="danger">{run.error.message}</Callout>}

      {/* 5. Corpus cards */}
      <CorpusCards />

      {/* 6. Try one of these */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={EYEBROW_STYLE}>TRY ONE OF THESE</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {TRY_QUERIES.map((ex) => (
            <button
              key={ex.q}
              onClick={() => run.mutate(ex.q)}
              disabled={run.isPending || disabled}
              style={{ all: "unset", cursor: run.isPending ? "default" : "pointer", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", background: "#fff", border: "1px solid var(--color-border)", borderRadius: 11, padding: "12px 14px", minHeight: 44 }}
            >
              <span style={{ background: "var(--color-gold)", color: "var(--color-navy)", borderRadius: 999, padding: "3px 10px", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em" }}>{ex.area.toUpperCase()}</span>
              <span style={{ fontSize: 13.5, flex: 1 }}>{ex.q}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 7. Existing feature: example research (seeded showcase) */}
      {!libraryQuery.trim() && myResearch.data?.length === 0 && examples.data?.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={EYEBROW_STYLE}>EXAMPLE RESEARCH</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
            {examples.data.map((ex) => (
              <Card key={ex.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{ex.title || ex.text}</div>
                <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{ex.caseCount} case{ex.caseCount === 1 ? "" : "s"} found</div>
                <Button variant="outline" onClick={() => go("research", ex.id)}>Open research</Button>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* 8. My research history (existing feature, restyled) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div style={EYEBROW_STYLE}>MY RESEARCH</div>
          <input
            value={libraryQuery}
            onChange={(e) => setLibraryQuery(e.target.value)}
            placeholder="Search your past research…"
            style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--color-border)", fontSize: 12.5, minWidth: 200 }}
          />
        </div>
        {myResearch.isLoading ? (
          <Loading label="Loading your research…" />
        ) : myResearch.data?.length === 0 ? (
          <Callout tone="neutral">No searches yet — ask a question above to start your research library.</Callout>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
            {myResearch.data?.map((row) => <MyResearchCard key={row.id} row={row} onChanged={() => myResearch.refetch()} />)}
          </div>
        )}
      </div>
    </div>
  );
}
