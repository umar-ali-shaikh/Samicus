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

// Every passage indexed for one document, read in order — shown when a browse-list card is
// expanded. Verbatim, same extractive guarantee as the rest of this library. Bounded and
// scrollable — a long judgment can have dozens of chunks, and letting those sprawl the page
// instead of scrolling inside a fixed box made the whole page unreadable.
function DocumentPassages({ documentId }) {
  const chunks = useGet(`/corpus/documents/${documentId}/chunks`, undefined, { staleTime: 60000 });
  if (chunks.isLoading) return <Loading label="Loading indexed passages…" />;
  if (chunks.isError) return <Callout tone="danger">{chunks.error.message}</Callout>;
  if (!chunks.data?.length) return <Callout tone="neutral">No passages indexed for this document.</Callout>;
  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--color-border)", background: "#FBF8F2", borderRadius: 8, padding: 10, maxHeight: 320, overflowY: "auto" }}>
      {chunks.data.map((c) => (
        <div key={c.id} style={{ borderLeft: "3px solid var(--color-gold)", paddingLeft: 10, marginBottom: 8, fontSize: 12.5, lineHeight: 1.45, whiteSpace: "pre-wrap", color: "var(--color-text-muted)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-label)" }}>{CLASS_LABEL[c.paragraph_class] || c.paragraph_class}</div>
          {c.text}
        </div>
      ))}
    </div>
  );
}

// Collapsed by default — this is the shared global knowledge base, not the signed-in user's
// own research, so it shouldn't dump 29 documents onto the page until someone actually asks
// to browse it.
function IndexedLibrary() {
  const [expanded, setExpanded] = useState(false);
  const docs = useGet("/corpus/documents", undefined, { staleTime: 60000, enabled: expanded });
  const [openDocId, setOpenDocId] = useState(null);

  if (!expanded) {
    return (
      <Button variant="outline" onClick={() => setExpanded(true)}>
        Browse the indexed library ↓
      </Button>
    );
  }
  if (docs.isLoading) return <Loading label="Loading the indexed library…" />;
  if (!docs.data?.length) return <Callout tone="neutral">Nothing indexed yet — ask a question in the AI Legal Assistant to start building the library.</Callout>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-label)" }}>ALREADY INDEXED · {docs.data.length} document{docs.data.length === 1 ? "" : "s"} · click a document to read its indexed passages</div>
        <button onClick={() => setExpanded(false)} style={{ all: "unset", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--color-rust)" }}>Hide ↑</button>
      </div>
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
        <span>{timeAgo(row.created_at)}</span>
        <span>·</span>
        <span>{row.caseCount} case{row.caseCount === 1 ? "" : "s"}</span>
        {row.topCourt && <><span>·</span><span>{row.topCourt}</span></>}
        <Badge tone={row.outcome === "not_found" ? "warning" : "success"}>{row.outcome === "not_found" ? "No match" : row.outcome}</Badge>
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
        <div style={{ fontSize: 11.5, color: "#9AA5BC" }}>The library grows as questions are asked here or in the AI Legal Assistant.</div>
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
