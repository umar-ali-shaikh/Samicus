import { useEffect, useMemo, useRef, useState } from "react";
import { useGet, useMut } from "../../api/hooks";
import { useUI } from "../../state/UIState";
import { api } from "../../lib/api";
import { Card, Callout, Button, Badge, SegmentedControl, Loading, Pill } from "../../components/ui";
import { SOURCE_LABEL } from "../Research";

const OUTCOME_TONE = { allowed: "success", dismissed: "danger", partial: "warning", not_stated: "neutral" };
const CITE_RE = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

// A chip naming exactly where a cited sentence's claim comes from (case, court, paragraph)
// — the concrete backing for "every sentence is a verbatim passage with its source",
// shown right next to the sentence rather than requiring a click to find out.
function SourceChip({ seg }) {
  if (!seg) return null;
  const label = [seg.documentTitle, seg.court, seg.sectionLabel].filter(Boolean).join(" · ");
  const short = seg.documentTitle?.length > 24 ? `${seg.documentTitle.slice(0, 22)}…` : seg.documentTitle;
  return (
    <span
      title={label}
      style={{ display: "inline-block", fontSize: 9.5, fontWeight: 600, color: "#C9D2E6", background: "rgba(255,255,255,0.1)", borderRadius: 999, padding: "1px 7px", marginLeft: 4, verticalAlign: "middle" }}
    >
      {short}{seg.court ? ` · ${seg.court}` : ""}
    </span>
  );
}

// Renders aiSummary text with [n] / [n, m] citation markers turned into clickable numbers
// that scroll to + flash the matching case card below, plus a source chip (case/court/¶)
// right next to each one — so the claim's grounding is visible without clicking anything.
function SummaryText({ text, segments, onCite }) {
  const parts = [];
  let last = 0;
  let match;
  const re = new RegExp(CITE_RE);
  while ((match = re.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const nums = match[1].split(",").map((n) => n.trim());
    parts.push(
      <span key={match.index}>
        [{nums.map((n, i) => (
          <span key={n}>
            {i > 0 && ", "}
            <button onClick={() => onCite(Number(n))} style={{ all: "unset", cursor: "pointer", color: "var(--color-rust)", fontWeight: 700 }}>{n}</button>
          </span>
        ))}]
        {nums.slice(0, 2).map((n) => <SourceChip key={`chip-${n}`} seg={segments?.[Number(n) - 1]} />)}
      </span>
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function CaseCard({ seg, index, highlighted, nodeRef, onOpenJudgment }) {
  return (
    <Card ref={nodeRef} style={{ background: highlighted ? "#FDF3DC" : undefined, transition: "background 1.5s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, flex: "none", borderRadius: 6, fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--color-navy)", color: "#fff" }}>{index}</span>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 16 }}>{seg.documentTitle}</div>
        </div>
        {seg.outcome && seg.outcome !== "not_stated" && <Badge tone={OUTCOME_TONE[seg.outcome] || "neutral"}>{seg.outcome}</Badge>}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--color-text-muted)", marginTop: 2 }}>
        {[seg.court, seg.citation].filter(Boolean).join(" · ")}
      </div>
      {seg.gloss && <div style={{ fontSize: 13, marginTop: 8 }}>{seg.gloss}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8, fontSize: 12.5 }}>
        {[["Facts", seg.facts], ["Issues", seg.issues], ["Held", seg.held], ["Ratio", seg.ratio]].map(([label, value]) =>
          value ? <div key={label}><strong>{label}: </strong>{value}</div> : null
        )}
      </div>
      {seg.keyParagraph && (
        <div style={{ borderLeft: "3px solid var(--color-gold)", paddingLeft: 10, fontSize: 12.5, color: "var(--color-text-muted)", marginTop: 8, fontStyle: "italic" }}>
          "{seg.keyParagraph}"
        </div>
      )}
      <div style={{ display: "flex", gap: 14, marginTop: 10 }}>
        <button onClick={() => onOpenJudgment(seg.documentId)} style={{ all: "unset", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--color-rust)" }}>Read full judgment →</button>
        {seg.url && <a href={seg.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>Open on Indian Kanoon ↗</a>}
      </div>
    </Card>
  );
}

function FollowUpChat({ searchId, locale }) {
  const turns = useGet(`/research/queries/${searchId}/chat`);
  const [question, setQuestion] = useState("");
  const ask = useMut((q) => api.post(`/research/queries/${searchId}/ask`, { question: q }), {
    onSuccess: () => { setQuestion(""); turns.refetch(); },
  });
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--color-label)", letterSpacing: "0.05em" }}>ASK A FOLLOW-UP</div>
      <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>Answered only from this report's own sources — no new search.</div>
      {(turns.data || []).map((t) => (
        <div key={t.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{t.question}</div>
          <div style={{ fontSize: 13, color: t.answer?.text ? "var(--color-text)" : "var(--color-text-muted)" }}>
            {t.answer?.text || "Couldn't answer that from this report's sources."}
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && question.trim().length >= 3 && ask.mutate(question.trim())}
          placeholder="Ask about this report…"
          style={{ flex: 1, padding: 10, borderRadius: 9, border: "1px solid var(--color-border)" }}
        />
        <Button onClick={() => ask.mutate(question.trim())} disabled={question.trim().length < 3 || ask.isPending}>{ask.isPending ? "…" : "Ask"}</Button>
      </div>
    </Card>
  );
}

export function ResearchReport({ searchId }) {
  const { go, showToast } = useUI();
  const [tab, setTab] = useState("summary");
  const [highlightChunk, setHighlightChunk] = useState(null);
  const segmentRefs = useRef({});
  const chatRef = useRef(null);

  const report = useGet(`/research/queries/${searchId}/report`, undefined, {
    refetchInterval: (q) => (q.state.data?.status === "processing" ? 1500 : false),
  });

  const refresh = useMut(() => api.post(`/research/queries/${searchId}/refresh`), { onSuccess: ({ searchId: newId }) => go("research", newId) });
  const pin = useMut((pinned) => api.patch(`/research/queries/${searchId}`, { pinned }), { onSuccess: () => report.refetch() });
  const exportPdf = useMut(() => api.download(`/research/queries/${searchId}/export.pdf`, `research-${searchId}.pdf`), { success: "Downloaded." });

  const data = report.data;
  const segments = useMemo(() => data?.segments || [], [data]);
  const hasSources = data?.outcome !== "not_found" && segments.length > 0;
  const cases = segments.filter((s) => s.source !== "web");
  const articles = segments.filter((s) => s.source === "web");
  const numberOf = (chunkId) => segments.findIndex((s) => s.chunkId === chunkId) + 1;

  function openJudgment(documentId) {
    if (!documentId) return;
    go("research", `doc/${documentId}`, { citedChunkIds: segments.filter((s) => s.documentId === documentId).map((s) => s.chunkId) });
  }

  function goToCitation(n) {
    const seg = segments[n - 1];
    if (!seg) return;
    setTab(seg.source === "web" ? "articles" : "cases");
    setHighlightChunk(seg.chunkId);
    requestAnimationFrame(() => segmentRefs.current[seg.chunkId]?.scrollIntoView({ behavior: "smooth", block: "center" }));
    setTimeout(() => setHighlightChunk(null), 1600);
  }

  useEffect(() => {
    setTab("summary");
  }, [searchId]);

  if (report.isLoading || data?.status === "processing") return <Loading label={data?.status === "processing" ? "Still researching…" : "Loading report…"} />;
  if (report.isError) return <Callout tone="danger">{report.error.message}</Callout>;
  if (!data) return <Callout tone="danger">Report not found.</Callout>;

  const { query } = data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <button onClick={() => go("research")} style={{ all: "unset", cursor: "pointer", fontSize: 12, color: "var(--color-text-muted)", marginBottom: 6, display: "block" }}>← Research library</button>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 22 }}>{query.title || query.text}</div>
            <div style={{ fontSize: 11.5, color: "var(--color-text-muted)", marginTop: 4 }}>
              {new Date(query.created_at).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}
              {(query.sources_enabled || []).length > 0 && ` · ${query.sources_enabled.map((s) => SOURCE_LABEL[s] || s).join(", ")}`}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="outline" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
              {refresh.isPending ? "Refreshing…" : hasSources ? "Refresh" : "Search again"}
            </Button>
            {hasSources && (
              <>
                <Button variant="outline" onClick={() => exportPdf.mutate()} disabled={exportPdf.isPending}>Export PDF</Button>
                <Button variant="outline" onClick={() => navigator.clipboard.writeText(data.aiSummary || query.text).then(() => showToast("Copied."))}>Copy</Button>
                <Button variant="outline" onClick={() => pin.mutate(!query.pinned_at)} disabled={pin.isPending}>{query.pinned_at ? "Unpin" : "Pin"}</Button>
                <Button onClick={() => chatRef.current?.scrollIntoView({ behavior: "smooth" })}>Ask follow-up</Button>
              </>
            )}
          </div>
        </div>
      </Card>

      {!hasSources ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Callout tone="warning" title="Not in the indexed library">
            No passage cleared the relevance threshold, or the only matches were a party's arguments (which can't be cited as the law). The library already tried fetching new sources for this question automatically — it still came up empty.
          </Callout>
          <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-label)" }}>TRY THIS INSTEAD</div>
            <Button onClick={() => go("legalassistant", "", { question: query.text })}>Try the AI Legal Assistant →</Button>
            <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
              Suggested rephrasings:
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                <li>Drop the specific section number and search by topic instead.</li>
                <li>Search with just the Act name, without the section number.</li>
                <li>Try a shorter, plainer version of the question.</li>
              </ul>
            </div>
            <Button variant="outline" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
              {refresh.isPending ? "Fetching…" : "Request this be added to the library"}
            </Button>
          </Card>
        </div>
      ) : (
        <>
          <SegmentedControl
            options={[
              { value: "summary", label: "Summary" },
              { value: "cases", label: `Cases (${cases.length})` },
              { value: "articles", label: `Articles (${articles.length})` },
              { value: "related", label: "Related" },
            ]}
            value={tab}
            onChange={setTab}
          />

          {tab === "summary" && (
            <Card style={{ background: "var(--color-navy)", color: "#F6F1E8" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#9AA5BC", letterSpacing: "0.05em", marginBottom: 6 }}>AI SUMMARY</div>
              {data.aiSummary ? (
                <div style={{ fontSize: 14, lineHeight: 1.65 }}><SummaryText text={data.aiSummary} segments={segments} onCite={goToCitation} /></div>
              ) : (
                <div style={{ fontSize: 13, color: "#9AA5BC" }}>No AI summary for this report — showing the retrieved passages directly.</div>
              )}
              <div style={{ fontSize: 11, color: "#9AA5BC", marginTop: 8 }}>Written from the cases below — every number is a clickable citation. Read the verbatim passages before relying on this.</div>
            </Card>
          )}

          {tab === "cases" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {cases.length === 0 && <Callout tone="neutral">No case law in this report.</Callout>}
              {cases.map((s) => (
                <CaseCard
                  key={s.chunkId}
                  seg={s}
                  index={numberOf(s.chunkId)}
                  highlighted={highlightChunk === s.chunkId}
                  nodeRef={(el) => { if (el) segmentRefs.current[s.chunkId] = el; }}
                  onOpenJudgment={openJudgment}
                />
              ))}
            </div>
          )}

          {tab === "articles" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {articles.length === 0 && <Callout tone="neutral">No articles or bare-act excerpts in this report.</Callout>}
              {articles.map((s) => (
                <Card key={s.chunkId} ref={(el) => { if (el) segmentRefs.current[s.chunkId] = el; }} style={{ background: highlightChunk === s.chunkId ? "#FDF3DC" : undefined }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{s.documentTitle}</div>
                  <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{s.court || "Article"}</div>
                  {s.gloss && <div style={{ fontSize: 13, marginTop: 6 }}>{s.gloss}</div>}
                  {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>Read full article ↗</a>}
                </Card>
              ))}
            </div>
          )}

          {tab === "related" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-label)", marginBottom: 8 }}>RELATED SEARCHES</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(data.relatedSearches || []).length === 0 && <Callout tone="neutral">No suggestions for this report.</Callout>}
                  {(data.relatedSearches || []).map((s) => (
                    <Pill key={s} onClick={async () => {
                      const { retrievalId } = await api.post("/research/retrieve", { text: s });
                      await api.post("/research/answer", { retrievalId });
                      go("research", retrievalId);
                    }}>{s}</Pill>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-label)", marginBottom: 8 }}>RELATED CASES</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                  {(data.relatedCases || []).length === 0 && <Callout tone="neutral">No related cases found.</Callout>}
                  {(data.relatedCases || []).map((d) => (
                    <Card key={d.id}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{d.title}</div>
                      <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{[d.court, d.citation].filter(Boolean).join(" · ")}</div>
                      <button onClick={() => openJudgment(d.id)} style={{ all: "unset", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--color-rust)", marginTop: 6, display: "block" }}>Read full judgment →</button>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {hasSources && (
        <div ref={chatRef}>
          <FollowUpChat searchId={searchId} locale={query.locale} />
        </div>
      )}

      {hasSources && (
        <div style={{ background: "var(--color-navy)", color: "#F6F1E8", borderRadius: 12, padding: 12, fontSize: 11.5 }}>
          AI-generated research aid, not legal advice. Every claim is grounded in the sources above — verify with the original judgment before relying on it.
        </div>
      )}
    </div>
  );
}
