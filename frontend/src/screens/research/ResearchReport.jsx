import { useEffect, useMemo, useRef, useState } from "react";
import { useGet, useMut } from "../../api/hooks";
import { useUI } from "../../state/UIState";
import { api } from "../../lib/api";
import { Card, Callout, Button, Badge, EmptyState, Loading } from "../../components/ui";
import { CLASS_LABEL, SOURCE_LABEL } from "../Research";

const EYEBROW_STYLE = { fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", color: "var(--color-label)" };

const TABS = [
  { id: "answer", label: "Answer" },
  { id: "authorities", label: "Authorities" },
  { id: "compare", label: "Compare" },
  { id: "conflicts", label: "Conflicts" },
  { id: "adverse", label: "Adverse" },
  { id: "casemap", label: "Case map" },
];

const POSITION_TONE = { "Settled law": "success", Unsettled: "warning", Conflicting: "danger" };

// Why a "No match" happened, matching MyResearchCard's tooltip in ResearchHome.jsx — shown
// here as the actual callout body instead of one generic line, so "No match" is never a bare
// dead end with no next step.
const NOT_FOUND_REASON_COPY = {
  corpus_gap: "The library doesn't have anything indexed on this yet. It automatically tried fetching new sources for this question and still came up empty.",
  ingest_failed: "A likely source was found, but indexing it failed partway through — this is a technical hiccup, not a sign the library lacks coverage. Try refreshing.",
  below_threshold: "Something close was found, but it didn't clear the relevance bar closely enough to cite with confidence.",
};

function formatDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
}

// --- Step 1: retrieved passages --------------------------------------------------------

function PassageRow({ n, seg, open, onToggle, highlighted, nodeRef }) {
  return (
    <Card ref={nodeRef} style={{ padding: 0, overflow: "hidden", background: highlighted ? "#FDF3DC" : "#fff", transition: "background 1.5s" }}>
      <button
        onClick={onToggle}
        style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, width: "100%", padding: 14, boxSizing: "border-box", minHeight: 44 }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, flex: "none", borderRadius: 6, fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--color-navy)", color: "#fff" }}>{n}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{seg.documentTitle}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
            {seg.court && <Badge tone="neutral">{seg.court}</Badge>}
            <span>{CLASS_LABEL[seg.paragraphClass] || seg.paragraphClass}</span>
            {typeof seg.score === "number" && <span>· match {seg.score.toFixed(2)}</span>}
          </div>
        </span>
        <span style={{ fontSize: 18, color: "var(--color-text-muted)", flex: "none" }}>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--color-border)" }}>
          <div style={{ borderLeft: "3px solid var(--color-gold)", paddingLeft: 10, fontSize: 12.5, lineHeight: 1.5, color: "var(--color-text)", marginTop: 10, whiteSpace: "pre-wrap" }}>
            {seg.text}
          </div>
          {seg.url && <a href={seg.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, display: "inline-block", marginTop: 8 }}>Open source ↗</a>}
        </div>
      )}
    </Card>
  );
}

function RetrievedPassages({ segments, threshold, openN, setOpenN, highlighted, passageRefs }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={EYEBROW_STYLE}>
        STEP 1 · RETRIEVED PASSAGES — {segments.length} chunk{segments.length === 1 ? "" : "s"} retrieved above threshold {Number(threshold).toFixed(2)}
      </div>
      {segments.map((seg, i) => {
        const n = i + 1;
        return (
          <PassageRow
            key={seg.chunkId}
            n={n}
            seg={seg}
            open={openN === n}
            onToggle={() => setOpenN((cur) => (cur === n ? null : n))}
            highlighted={highlighted === n}
            nodeRef={(el) => { if (el) passageRefs.current[n] = el; }}
          />
        );
      })}
    </div>
  );
}

// --- Step 2: composed answer ------------------------------------------------------------

function CiteMarkers({ cites, onCite }) {
  if (!cites?.length) return null;
  return (
    <span style={{ marginLeft: 4 }}>
      [{cites.map((n, i) => (
        <span key={n}>
          {i > 0 && ", "}
          <button onClick={() => onCite(n)} style={{ all: "unset", cursor: "pointer", color: "var(--color-rust)", fontWeight: 700 }}>{n}</button>
        </span>
      ))}]
    </span>
  );
}

function AccordionSection({ index, section, open, onToggle, onCite }) {
  const label = String(index + 1).padStart(2, "0");
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <button
        onClick={onToggle}
        style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "14px 16px", boxSizing: "border-box", minHeight: 44 }}
      >
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--color-label)", flex: "none" }}>{label}</span>
        <span style={{ flex: 1, fontWeight: 700, fontSize: 14, textAlign: "left" }}>{section.title}</span>
        {section.status === "no_authority" ? (
          <Badge tone="warning">NO AUTHORITY RETRIEVED</Badge>
        ) : section.citationCount > 0 ? (
          <Badge tone="neutral">{section.citationCount} CITATION{section.citationCount === 1 ? "" : "S"}</Badge>
        ) : null}
        <span style={{ fontSize: 18, color: "var(--color-text-muted)", flex: "none" }}>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--color-border)" }}>
          {section.paragraphs.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "var(--color-text-muted)", paddingTop: 10, fontStyle: "italic" }}>
              No retrieved passage supports this section — nothing is shown rather than guessed.
            </div>
          ) : (
            section.paragraphs.map((p, i) => (
              <div key={i} style={{ fontSize: 13.5, lineHeight: 1.6, marginTop: 10 }}>
                {p.text}
                <CiteMarkers cites={p.cites} onCite={onCite} />
              </div>
            ))
          )}
        </div>
      )}
    </Card>
  );
}

function NotYetAvailable({ what }) {
  return <EmptyState title="Not yet available" body={`Vidhira doesn't have enough retrieved evidence to build a ${what} without guessing — so nothing is shown here rather than something invented.`} />;
}

function AuthoritiesTab({ authorities }) {
  if (!authorities?.length) return <NotYetAvailable what="list of authorities" />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {authorities.map((a) => (
        <Card key={a.n} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-label)" }}>[{a.n}]</span>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 15 }}>{a.title}</div>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--color-text-muted)", marginTop: 2 }}>{[a.court, a.citation].filter(Boolean).join(" · ")}</div>
          </div>
          {a.url && <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>Open source ↗</a>}
        </Card>
      ))}
    </div>
  );
}

// --- Follow-up chat (existing feature, kept) --------------------------------------------

function FollowUpChat({ searchId }) {
  const turns = useGet(`/research/queries/${searchId}/chat`);
  const [question, setQuestion] = useState("");
  const ask = useMut((q) => api.post(`/research/queries/${searchId}/ask`, { question: q }), {
    onSuccess: () => { setQuestion(""); turns.refetch(); },
  });
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={EYEBROW_STYLE}>ASK A FOLLOW-UP</div>
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

// --- Main ---------------------------------------------------------------------------------

export function ResearchReport({ searchId }) {
  const { go, setResearchQuestion } = useUI();
  const [tool, setTool] = useState("answer");
  const [openPassage, setOpenPassage] = useState(null);
  const [highlightPassage, setHighlightPassage] = useState(null);
  const [openSection, setOpenSection] = useState("s1");
  const passageRefs = useRef({});
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
  const note = data?.note;
  // When the structured note doesn't exist (pre-v2 row, or generation failed), the
  // Authorities tab still has a real, non-fabricated list to show — it's just the segments
  // themselves, same source of truth as Step 1, renumbered to match.
  const authorities = note?.authorities || segments.map((s, i) => ({ n: i + 1, title: s.documentTitle, court: s.court, citation: s.citation, source: s.source, url: s.url }));

  useEffect(() => { setTool("answer"); setOpenPassage(null); setOpenSection("s1"); }, [searchId]);

  function goToPassage(n) {
    setOpenPassage(n);
    setHighlightPassage(n);
    requestAnimationFrame(() => passageRefs.current[n]?.scrollIntoView({ behavior: "smooth", block: "center" }));
    setTimeout(() => setHighlightPassage(null), 1600);
  }

  if (report.isLoading || data?.status === "processing") return <Loading label={data?.status === "processing" ? "Still researching…" : "Loading report…"} />;
  if (report.isError) return <Callout tone="danger">{report.error.message}</Callout>;
  if (!data) return <Callout tone="danger">Report not found.</Callout>;

  const { query } = data;
  const lawAsOn = formatDate(note?.lawAsOn);

  return (
    <div className="research-page" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <button onClick={() => { setResearchQuestion(""); go("research"); }} style={{ all: "unset", cursor: "pointer", fontSize: 12, color: "var(--color-text-muted)", marginBottom: 6, display: "block" }}>← Vidhira Research</button>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 22 }}>{query.title || query.text}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 11.5, color: "var(--color-text-muted)", marginTop: 4 }}>
              <span>{new Date(query.created_at).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}</span>
              {lawAsOn && <span style={{ background: "var(--color-gold)", color: "var(--color-navy)", borderRadius: 999, padding: "3px 10px", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em" }}>LAW AS ON {lawAsOn.toUpperCase()}</span>}
              {(query.sources_enabled || []).length > 0 && <span>{query.sources_enabled.map((s) => SOURCE_LABEL[s] || s).join(", ")}</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="outline" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
              {refresh.isPending ? "Refreshing…" : hasSources ? "Refresh" : "Search again"}
            </Button>
            {hasSources && (
              <>
                <Button variant="outline" onClick={() => exportPdf.mutate()} disabled={exportPdf.isPending}>Export research note</Button>
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
            {NOT_FOUND_REASON_COPY[query.not_found_reason] ||
              "No passage cleared the relevance threshold, or the only matches were a party's arguments (which can't be cited as the law)."}
            {typeof query.top_score === "number" && <div style={{ marginTop: 6, fontSize: 12 }}>Best match found: {query.top_score.toFixed(2)} (threshold {Number(query.threshold).toFixed(2)}).</div>}
          </Callout>
          <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={EYEBROW_STYLE}>TRY THIS INSTEAD</div>
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
          <RetrievedPassages
            segments={segments}
            threshold={query.threshold}
            openN={openPassage}
            setOpenN={setOpenPassage}
            highlighted={highlightPassage}
            passageRefs={passageRefs}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={EYEBROW_STYLE}>STEP 2 · COMPOSED ONLY FROM THE ABOVE</div>
            <div style={{ display: "flex", gap: 2, background: "#F1EFE6", borderRadius: 9, padding: 3, overflowX: "auto" }}>
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTool(t.id)}
                  style={{ background: tool === t.id ? "var(--color-navy)" : "transparent", color: tool === t.id ? "#fff" : "var(--color-ink)", border: "none", borderRadius: 7, padding: "9px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", minHeight: 44 }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tool === "answer" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {note ? (
                  <>
                    <Card style={{ background: "var(--color-navy)", color: "#F6F1E8", display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ fontFamily: "var(--font-serif)", fontSize: 18 }}>{query.text}</div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11.5, color: "#9AA5BC" }}>
                        {lawAsOn && <span>LAW AS ON {lawAsOn}</span>}
                        <span>{note.authorities.length} AUTHORIT{note.authorities.length === 1 ? "Y" : "IES"}</span>
                        {note.jurisdiction && <span>{note.jurisdiction}</span>}
                      </div>
                    </Card>

                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {note.sections.map((sec, i) => (
                        <AccordionSection
                          key={sec.id}
                          index={i}
                          section={sec}
                          open={openSection === sec.id}
                          onToggle={() => setOpenSection((cur) => (cur === sec.id ? null : sec.id))}
                          onCite={goToPassage}
                        />
                      ))}
                    </div>

                    {note.position?.label && (
                      <Callout tone={POSITION_TONE[note.position.label] || "neutral"} title={note.position.label}>
                        {note.position.note}
                      </Callout>
                    )}

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Button onClick={() => go("find")}>Consult an advocate on this</Button>
                      <Button variant="outline" onClick={() => go("draft")}>Draft a document instead</Button>
                    </div>
                  </>
                ) : (
                  <Callout tone="neutral" title="Structured note not available for this report">
                    {data.aiSummary ? data.aiSummary : "Showing the retrieved passages above directly — no AI summary was generated for this report."}
                  </Callout>
                )}
              </div>
            )}

            {tool === "authorities" && <AuthoritiesTab authorities={authorities} />}
            {tool === "compare" && <NotYetAvailable what="side-by-side comparison" />}
            {tool === "conflicts" && <NotYetAvailable what="conflicting-views analysis" />}
            {tool === "adverse" && <NotYetAvailable what="adverse-authority analysis" />}
            {tool === "casemap" && <NotYetAvailable what="citation map" />}
          </div>
        </>
      )}

      {hasSources && (
        <div ref={chatRef}>
          <FollowUpChat searchId={searchId} />
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
