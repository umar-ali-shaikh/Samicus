import { useEffect, useRef } from "react";
import { useConfig, useGet, useMut } from "../api/hooks";
import { useUI } from "../state/UIState";
import { api } from "../lib/api";
import { Card, StatTile, Callout, Button, ProgressBar, Badge, Loading } from "../components/ui";
import { PageHeader } from "../components/PageHeader";

const CLASS_LABEL = {
  provision: "Statutory provision", facts: "Facts", issues: "Issue", petitioner_arguments: "Petitioner's argument", respondent_arguments: "Respondent's argument",
  reasoning: "Court's reasoning", holding: "Court's holding", directions: "Directions",
};
const SOURCE_LABEL = { bare_act: "Bare act", supreme_court: "Supreme Court", high_court: "High Court", rules: "Rules", tribunal: "Tribunal", other: "Other", ccpa: "CCPA", asci: "ASCI" };

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

function IndexedLibrary() {
  const docs = useGet("/corpus/documents", undefined, { staleTime: 60000 });
  if (docs.isLoading) return <Loading label="Loading the indexed library…" />;
  if (!docs.data?.length) return <Callout tone="neutral">Nothing indexed yet — ask a question in the AI Legal Assistant to start building the library.</Callout>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-label)" }}>ALREADY INDEXED · {docs.data.length} document{docs.data.length === 1 ? "" : "s"}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {docs.data.map((d) => (
          <Card key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{d.title}</div>
              <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>
                {(SOURCE_LABEL[d.source] || d.source)}{d.court ? ` · ${d.court}` : ""}{d.citation ? ` · ${d.citation}` : ""}
              </div>
            </div>
            {d.canonical_url && (
              <a href={d.canonical_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, flex: "none" }}>Open source ↗</a>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

export function Research() {
  const config = useConfig();
  const {
    researchQuestion: question, setResearchQuestion: setQuestion,
    researchState: state, setResearchState: setState, // { text, retrieval, answer }
    researchOpenChunk: openChunk, setResearchOpenChunk: setOpenChunk,
  } = useUI();
  const segmentRefs = useRef({}); // chunkId -> DOM node, so selecting a passage scrolls the verbatim list to it

  const run = useMut(async (text) => {
    const retrieval = await api.post("/research/retrieve", { text });
    const answer = await api.post("/research/answer", { retrievalId: retrieval.retrievalId });
    return { text, retrieval, answer };
  }, { onSuccess: (r) => { setState(r); setOpenChunk(r.answer.segments?.[0]?.chunkId || r.retrieval.chunks[0]?.chunkId || null); }, invalidate: ["/corpus"] });

  const disabled = config.data && !config.data.research.enabled;
  const retrieval = state?.retrieval;
  const answer = state?.answer;
  const segments = answer?.segments || [];
  const numberOf = (chunkId) => segments.findIndex((s) => s.chunkId === chunkId) + 1;
  const active = retrieval?.chunks.find((c) => c.chunkId === openChunk);

  // Selecting a passage in the retrieval trail (left) or a [n] marker only changed the
  // detail panel (right) — the verbatim list (middle) stayed scrolled wherever it was,
  // so the selection often wasn't visible at all without manually scrolling. Bring it
  // into view whenever the selection changes.
  useEffect(() => {
    segmentRefs.current[openChunk]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [openChunk]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <PageHeader title="Research library" subtitle="Semantic search over the indexed statutes and judgments. The note below is assembled only from the retrieved passages — every sentence is a verbatim passage with its source, and nothing is written from memory." />
        <KnowledgeBaseStats />
      </div>

      {disabled && <Callout tone="warning" title="Not enabled on this deployment">The research library needs Qdrant and Gemini embeddings to be configured (see .env.example).</Callout>}

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
        <div style={{ fontSize: 11.5, color: "#9AA5BC" }}>The library grows as questions are asked in the AI Legal Assistant — sources found there are indexed here for future searches.</div>
      </Card>

      {run.isPending && <Loading label="Retrieving passages and discarding anything below the relevance threshold…" />}
      {run.isError && <Callout tone="danger">{run.error.message}</Callout>}

      {!state && !run.isPending && <IndexedLibrary />}

      {state && !run.isPending && (
        <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 240px", minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-label)" }}>RETRIEVAL TRAIL · {retrieval.chunks.filter((c) => c.kept).length} of {retrieval.chunks.length} kept</div>
            {retrieval.chunks.map((c) => (
              <button key={c.chunkId} onClick={() => setOpenChunk(c.chunkId)} style={{ textAlign: "left", padding: 10, borderRadius: 10, border: `1px solid ${openChunk === c.chunkId ? "var(--color-navy)" : "var(--color-border)"}`, background: c.kept ? "#fff" : "#F7F4EC", cursor: "pointer", opacity: c.kept ? 1 : 0.7 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 10.5 }}>
                  <span>{CLASS_LABEL[c.paragraphClass] || c.paragraphClass}</span><span style={{ color: c.kept ? "#0F7A55" : "#D9A441" }}>{c.score}</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 12, margin: "3px 0" }}>{c.documentTitle}</div>
                <ProgressBar pct={c.score * 100} tone={c.kept ? "mint" : undefined} />
                {!c.kept && <div style={{ fontSize: 10.5, color: "var(--color-text-muted)", marginTop: 3 }}>Below the {retrieval.threshold} relevance floor — not used</div>}
              </button>
            ))}
            {retrieval.chunks.length === 0 && <Callout tone="neutral">Nothing in the library resembles this question yet.</Callout>}
          </div>

          <div style={{ flex: "1 1 500px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            <Card><div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-label)" }}>QUESTION</div><div style={{ fontFamily: "var(--font-serif)", fontSize: 18 }}>{state.text}</div></Card>

            {answer.aiSummary && (
              <Card style={{ background: "var(--color-navy)", color: "#F6F1E8" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#9AA5BC", letterSpacing: "0.05em", marginBottom: 6 }}>AI SUMMARY</div>
                <div style={{ fontSize: 14, lineHeight: 1.65 }}>{answer.aiSummary}</div>
                <div style={{ fontSize: 11, color: "#9AA5BC", marginTop: 8 }}>Written from the passages below — every sentence is numbered to the source it came from. Read the verbatim passages (and the full source) before relying on this.</div>
              </Card>
            )}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Badge tone={answer.outcome === "not_found" ? "warning" : "success"}>{answer.outcome === "not_found" ? "Answer withheld" : `${segments.length} passage${segments.length === 1 ? "" : "s"} used`}</Badge>
              <Badge>0 unsupported sentences</Badge>
              {answer.discardedCount > 0 && <Badge tone="info">{answer.discardedCount} discarded</Badge>}
            </div>

            {/* Whichever passage is selected (left trail, or a [n] marker below) shows its context
                right here — no separate side column, so it's visible for every single selection
                without having to look elsewhere on the page. */}
            {active && (
              <Card style={{ background: "#FBF8F2" }}>
                {active.url && <a href={active.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 600 }}>Open the full source ↗</a>}
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-label)", marginTop: 8 }}>{(SOURCE_LABEL[active.source] || active.source).toUpperCase()} · {CLASS_LABEL[active.paragraphClass] || active.paragraphClass}{numberOf(active.chunkId) ? ` · [${numberOf(active.chunkId)}]` : ""}</div>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 15, marginBottom: 8 }}>{active.documentTitle}</div>
                <div style={{ borderLeft: "3px solid var(--color-gold)", paddingLeft: 10, fontSize: 12.5, color: "var(--color-text-muted)", margin: "10px 0", whiteSpace: "pre-wrap", maxHeight: 240, overflowY: "auto" }}>{active.text}</div>
                {["petitioner_arguments", "respondent_arguments"].includes(active.paragraphClass) && <Callout tone="warning">This is a party's argument — shown for context, never cited as the court's view.</Callout>}
              </Card>
            )}

            {answer.outcome === "not_found" ? (
              <Callout tone="warning" title="Not in the indexed library">
                No passage cleared the relevance threshold, or the only matches were a party's arguments (which can't be cited as the law). The library won't write an answer its sources don't support. Try the AI Legal Assistant (it searches Indian Kanoon live and adds what it finds here), or narrow the question.
              </Callout>
            ) : (
              <Card>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--color-rust)", letterSpacing: "0.05em", marginBottom: 8 }}>CASES FOUND · one per source, click to read the full passage above</div>
                {segments.map((s, i) => (
                  <button
                    key={s.chunkId}
                    ref={(el) => { if (el) segmentRefs.current[s.chunkId] = el; }}
                    onClick={() => setOpenChunk(s.chunkId)}
                    style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 10, padding: 10, borderRadius: 8, border: "none", cursor: "pointer", background: openChunk === s.chunkId ? "#F7F1E0" : "transparent", transition: "background 0.2s" }}
                  >
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, flex: "none", borderRadius: 5, fontFamily: "var(--font-mono)", fontSize: 10.5, background: openChunk === s.chunkId ? "var(--color-navy)" : "#F1EFE6", color: openChunk === s.chunkId ? "#fff" : "var(--color-ink)" }}>{i + 1}</span>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{s.documentTitle}</span>
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.55, marginTop: 3, marginInlineStart: 24, color: "var(--color-text)" }}>
                      {s.gloss || `${s.text.slice(0, 160)}${s.text.length > 160 ? "…" : ""}`}
                    </div>
                  </button>
                ))}
              </Card>
            )}

            {segments.length > 0 && (
              <Card>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--color-label)", letterSpacing: "0.05em", marginBottom: 8 }}>RELATED READING</div>
                <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 12.5, display: "flex", flexDirection: "column", gap: 4 }}>
                  {[...new Map(segments.map((s) => [s.url || s.documentTitle, s])).values()].map((s) => (
                    <li key={s.url || s.documentTitle}>
                      {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.documentTitle}</a> : s.documentTitle}
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <div style={{ background: "var(--color-navy)", color: "#F6F1E8", borderRadius: 12, padding: 12, fontSize: 11.5 }}>
              This library only contains what has been indexed so far. It does not claim completeness or that a judgment is still good law — check before relying on it.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
