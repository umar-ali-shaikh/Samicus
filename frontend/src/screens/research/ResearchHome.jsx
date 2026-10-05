import { useState } from "react";
import { useConfig, useGet, useMut } from "../../api/hooks";
import { useUI } from "../../state/UIState";
import { api } from "../../lib/api";
import { Card, StatTile, Callout, Button, Pill, Badge, Loading } from "../../components/ui";
import { PageHeader } from "../../components/PageHeader";
import { CLASS_LABEL, SOURCE_LABEL } from "../Research";

const SOURCE_FILTERS = [
  { value: "bare_act", label: "Bare acts" },
  { value: "supreme_court", label: "Supreme Court" },
  { value: "high_court", label: "High Courts" },
  { value: "tribunal", label: "Tribunals" },
  { value: "web", label: "Articles" },
];

function KnowledgeBaseStats() {
  const status = useGet("/corpus/status", undefined, { staleTime: 60000 });
  if (!status.data) return null;
  const { bySource, chunkCount, vectorIndex } = status.data;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {(bySource || []).map((s) => <StatTile key={s.source} value={Number(s.count).toLocaleString("en-IN")} label={(SOURCE_LABEL[s.source] || s.source).toUpperCase()} />)}
      <StatTile value={Number(chunkCount || 0).toLocaleString("en-IN")} label="PASSAGES" />
      {vectorIndex?.enabled && <StatTile value={Number(vectorIndex.points || 0).toLocaleString("en-IN")} label="VECTORS" />}
    </div>
  );
}

const PASSAGE_PAGE_SIZE = 5;
const PASSAGE_COLLAPSE_LEN = 320;

// Splits `text` on (case-insensitive) occurrences of `term` and wraps matches in <mark> —
// used both for "relevant to what you searched" highlighting and for the search-within
// box, so there's only one highlighting code path to keep correct.
function highlightTerm(text, term) {
  if (!term?.trim()) return text;
  const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "ig"));
  if (parts.length === 1) return text;
  return parts.map((part, i) => (i % 2 === 1 ? <mark key={i} style={{ background: "#FDE68A", color: "inherit" }}>{part}</mark> : part));
}

function PassageText({ text, highlight }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > PASSAGE_COLLAPSE_LEN;
  const shown = isLong && !expanded ? `${text.slice(0, PASSAGE_COLLAPSE_LEN).trim()}…` : text;
  return (
    <>
      {highlightTerm(shown, highlight)}
      {isLong && (
        <button onClick={() => setExpanded((e) => !e)} style={{ all: "unset", cursor: "pointer", display: "block", marginTop: 6, fontSize: 11.5, fontWeight: 600, color: "var(--color-rust)" }}>
          {expanded ? "Read less ↑" : "Read more ↓"}
        </button>
      )}
    </>
  );
}

// Every passage indexed for one document, read in order — shown when a browse-list card is
// expanded. Verbatim, same extractive guarantee as the rest of this library. A judgment can
// have 100+ chunks, so this shows 5 at a time ("Show more"), lets the reader search within
// the document (which also highlights matches — doubling as "what's relevant to what you
// typed"), and collapses any individual long passage behind "Read more".
function DocumentPassages({ documentId }) {
  const chunks = useGet(`/corpus/documents/${documentId}/chunks`, undefined, { staleTime: 60000 });
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PASSAGE_PAGE_SIZE);
  if (chunks.isLoading) return <Loading label="Loading indexed passages…" />;
  if (chunks.isError) return <Callout tone="danger">{chunks.error.message}</Callout>;
  if (!chunks.data?.length) return <Callout tone="neutral">No passages indexed for this document.</Callout>;

  const term = search.trim();
  const filtered = term ? chunks.data.filter((c) => c.text.toLowerCase().includes(term.toLowerCase())) : chunks.data;
  const visible = filtered.slice(0, visibleCount);

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--color-border)", background: "#FBF8F2", borderRadius: 8, padding: 10 }}>
      <input
        value={search}
        onChange={(e) => { setSearch(e.target.value); setVisibleCount(PASSAGE_PAGE_SIZE); }}
        placeholder={`Search within these ${chunks.data.length} passages…`}
        style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--color-border)", fontSize: 12, marginBottom: 8, boxSizing: "border-box" }}
      />
      {filtered.length === 0 ? (
        <Callout tone="neutral">No passage matches "{term}".</Callout>
      ) : (
        <div style={{ maxHeight: 420, overflowY: "auto" }}>
          {visible.map((c) => (
            <div key={c.id} style={{ borderLeft: "3px solid var(--color-gold)", paddingLeft: 10, marginBottom: 8, fontSize: 12.5, lineHeight: 1.45, whiteSpace: "pre-wrap", color: "var(--color-text-muted)" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-label)" }}>{CLASS_LABEL[c.paragraph_class] || c.paragraph_class}</div>
              <PassageText text={c.text} highlight={term} />
            </div>
          ))}
          {visibleCount < filtered.length && (
            <Button variant="outline" onClick={() => setVisibleCount((n) => n + PASSAGE_PAGE_SIZE)}>
              Show more ({filtered.length - visibleCount} left)
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function IndexedLibrary() {
  const docs = useGet("/corpus/documents", undefined, { staleTime: 60000 });
  const [openDocId, setOpenDocId] = useState(null);
  if (docs.isLoading) return <Loading label="Loading the indexed library…" />;
  if (!docs.data?.length) return <Callout tone="neutral">Nothing indexed yet — ask a question in the AI Legal Assistant to start building the library.</Callout>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-label)" }}>ALREADY INDEXED · {docs.data.length} document{docs.data.length === 1 ? "" : "s"} · click a document to read its indexed passages</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {docs.data.map((d) => {
          const open = openDocId === d.id;
          return (
            <Card key={d.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <button onClick={() => setOpenDocId(open ? null : d.id)} style={{ all: "unset", cursor: "pointer", minWidth: 0, flex: "1 1 auto" }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{d.title}</div>
                  <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>
                    {(SOURCE_LABEL[d.source] || d.source)}{d.court ? ` · ${d.court}` : ""}{d.citation ? ` · ${d.citation}` : ""}
                  </div>
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "none" }}>
                  <button onClick={() => setOpenDocId(open ? null : d.id)} style={{ all: "unset", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--color-rust)" }}>
                    {open ? "Hide passages ↑" : "Read passages ↓"}
                  </button>
                  {d.canonical_url && <a href={d.canonical_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>Open source ↗</a>}
                </div>
              </div>
              {open && <DocumentPassages documentId={d.id} />}
            </Card>
          );
        })}
      </div>
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
        <Badge tone={row.outcome === "not_found" ? "warning" : "success"}>{row.outcome === "not_found" ? "No match" : row.outcome}</Badge>
        {row.rerun_count > 1 && <Badge tone="neutral">Re-run ×{row.rerun_count}</Badge>}
        {(row.tags || []).map((t) => <Badge key={t}>{t}</Badge>)}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
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

  const myResearch = useGet("/research/queries", libraryQuery.trim() ? { q: libraryQuery.trim() } : undefined);
  // Only treat "no results" as "show examples" when the list isn't filtered — a filtered
  // search legitimately returning zero matches is not the same as having no research yet.
  const examples = useGet("/research/queries", { tag: "example" }, { enabled: !libraryQuery.trim() && myResearch.data?.length === 0 });

  const run = useMut(
    async (text) => {
      const { retrievalId } = await api.post("/research/retrieve", { text, sourcesEnabled });
      await api.post("/research/answer", { retrievalId });
      return retrievalId;
    },
    { onSuccess: (id) => go("research", id) }
  );

  const disabled = config.data && !config.data.research.enabled;
  const toggleSource = (value) => setSourcesEnabled((cur) => (cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <PageHeader title="Research library" subtitle="Semantic search over the indexed statutes and judgments. The note below is assembled only from the retrieved passages — every sentence is a verbatim passage with its source, and nothing is written from memory." />
        <KnowledgeBaseStats />
      </div>

      {disabled && <Callout tone="warning" title="Not enabled on this deployment">The research library needs Qdrant and OpenRouter to be configured (see .env.example).</Callout>}

      <Card style={{ background: "var(--color-navy)", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && question.trim().length >= 5 && run.mutate(question.trim())}
            maxLength={1000}
            placeholder="Ask a question of Indian statutes, rules and reported judgments"
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

      {!libraryQuery.trim() && myResearch.data?.length === 0 && examples.data?.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-label)" }}>EXAMPLE RESEARCH</div>
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

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-label)" }}>MY RESEARCH</div>
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

      <IndexedLibrary />
    </div>
  );
}
