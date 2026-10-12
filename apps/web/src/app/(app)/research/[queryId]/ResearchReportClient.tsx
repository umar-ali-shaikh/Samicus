"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Callout, Button, Badge, EmptyState, Loading } from "@/components/ui";
import { CLASS_LABEL, SOURCE_LABEL } from "../shared";
import { fmtDateLong } from "@/lib/format";
import { getResearchReportAction, pinResearchQueryAction, refreshResearchQueryAction, getResearchChatAction, askResearchFollowUpAction } from "@/server/researchActions";
import type { ResearchChatTurnDto, ResearchReportDto } from "@vidhira/contracts";

const EYEBROW_STYLE = { fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", color: "var(--color-label)" };

const TABS = [
  { id: "answer", label: "Answer" },
  { id: "authorities", label: "Authorities" },
  { id: "compare", label: "Compare" },
  { id: "conflicts", label: "Conflicts" },
  { id: "adverse", label: "Adverse" },
  { id: "casemap", label: "Case map" },
] as const;

const POSITION_TONE: Record<string, "success" | "warning" | "danger"> = { "Settled law": "success", Unsettled: "warning", Conflicting: "danger" };

const NOT_FOUND_REASON_COPY: Record<string, string> = {
  corpus_gap: "The library doesn't have anything indexed on this yet. It automatically tried fetching new sources for this question and still came up empty.",
  ingest_failed: "A likely source was found, but indexing it failed partway through — this is a technical hiccup, not a sign the library lacks coverage. Try refreshing.",
  below_threshold: "Something close was found, but it didn't clear the relevance bar closely enough to cite with confidence.",
};

type DoneReport = Extract<ResearchReportDto, { status: "done" }>;
type Segment = DoneReport["segments"][number];

function PassageRow({ n, seg, open, onToggle, highlighted, nodeRef }: { n: number; seg: Segment; open: boolean; onToggle: () => void; highlighted: boolean; nodeRef: (el: HTMLDivElement | null) => void }) {
  return (
    <div ref={nodeRef}>
      <Card style={{ padding: 0, overflow: "hidden", background: highlighted ? "#FDF3DC" : "#fff", transition: "background 1.5s" }}>
        <button onClick={onToggle} style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, width: "100%", padding: 14, boxSizing: "border-box", minHeight: 44 }}>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, flex: "none", borderRadius: 6, fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--color-navy)", color: "#fff" }}>{n}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{seg.documentTitle}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
              {seg.court && <Badge tone="neutral">{seg.court}</Badge>}
              <span>{(seg.paragraphClass && CLASS_LABEL[seg.paragraphClass]) || seg.paragraphClass}</span>
              {typeof seg.score === "number" && <span>· match {seg.score.toFixed(2)}</span>}
            </div>
          </span>
          <span style={{ fontSize: 18, color: "var(--color-text-muted)", flex: "none" }}>{open ? "−" : "+"}</span>
        </button>
        {open && (
          <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--color-border)" }}>
            <div style={{ borderLeft: "3px solid var(--color-gold)", paddingLeft: 10, fontSize: 12.5, lineHeight: 1.5, color: "var(--color-text)", marginTop: 10, whiteSpace: "pre-wrap" }}>{seg.text}</div>
            {seg.url && (
              <a href={seg.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, display: "inline-block", marginTop: 8 }}>
                Open source ↗
              </a>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function CiteMarkers({ cites, onCite }: { cites: number[]; onCite: (n: number) => void }) {
  if (!cites?.length) return null;
  return (
    <span style={{ marginLeft: 4 }}>
      [
      {cites.map((n, i) => (
        <span key={n}>
          {i > 0 && ", "}
          <button onClick={() => onCite(n)} style={{ all: "unset", cursor: "pointer", color: "var(--color-rust)", fontWeight: 700 }}>
            {n}
          </button>
        </span>
      ))}
      ]
    </span>
  );
}

type NoteSection = NonNullable<DoneReport["note"]>["sections"][number];

function AccordionSection({ index, section, open, onToggle, onCite }: { index: number; section: NoteSection; open: boolean; onToggle: () => void; onCite: (n: number) => void }) {
  const label = String(index + 1).padStart(2, "0");
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <button onClick={onToggle} style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "14px 16px", boxSizing: "border-box", minHeight: 44 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--color-label)", flex: "none" }}>{label}</span>
        <span style={{ flex: 1, fontWeight: 700, fontSize: 14, textAlign: "left" }}>{section.title}</span>
        {section.status === "no_authority" ? (
          <Badge tone="warning">NO AUTHORITY RETRIEVED</Badge>
        ) : section.citationCount > 0 ? (
          <Badge tone="neutral">
            {section.citationCount} CITATION{section.citationCount === 1 ? "" : "S"}
          </Badge>
        ) : null}
        <span style={{ fontSize: 18, color: "var(--color-text-muted)", flex: "none" }}>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--color-border)" }}>
          {section.paragraphs.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "var(--color-text-muted)", paddingTop: 10, fontStyle: "italic" }}>No retrieved passage supports this section — nothing is shown rather than guessed.</div>
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

function NotYetAvailable({ what }: { what: string }) {
  return <EmptyState title="Not yet available" body={`Vidhira doesn't have enough retrieved evidence to build a ${what} without guessing — so nothing is shown here rather than something invented.`} />;
}

function AuthoritiesTab({ authorities }: { authorities: NonNullable<DoneReport["note"]>["authorities"] }) {
  if (!authorities?.length) return <NotYetAvailable what="list of authorities" />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {authorities.map((a) => (
        <Card key={a.n} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start", padding: 16 }}>
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-label)" }}>[{a.n}]</span>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 15 }}>{a.title}</div>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--color-text-muted)", marginTop: 2 }}>{[a.court, a.citation].filter(Boolean).join(" · ")}</div>
          </div>
          {a.url && (
            <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>
              Open source ↗
            </a>
          )}
        </Card>
      ))}
    </div>
  );
}

function FollowUpChat({ queryId }: { queryId: string }) {
  const [turns, setTurns] = useState<ResearchChatTurnDto[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    getResearchChatAction(queryId).then(setTurns);
  }, [queryId]);

  async function ask() {
    const q = question.trim();
    if (q.length < 3 || asking) return;
    setAsking(true);
    const result = await askResearchFollowUpAction(queryId, q);
    setAsking(false);
    if (result.ok) {
      setQuestion("");
      setTurns((t) => [...t, result.data]);
    }
  }

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16 }}>
      <div style={EYEBROW_STYLE}>ASK A FOLLOW-UP</div>
      <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>Answered only from this report's own sources — no new search.</div>
      {turns.map((t) => (
        <div key={t.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{t.question}</div>
          <div style={{ fontSize: 13, color: t.answer?.text ? "var(--color-text)" : "var(--color-text-muted)" }}>{t.answer?.text || "Couldn't answer that from this report's sources."}</div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder="Ask about this report…"
          style={{ flex: 1, padding: 10, borderRadius: 9, border: "1px solid var(--color-border)" }}
        />
        <Button onClick={ask} disabled={question.trim().length < 3 || asking} style={{ width: "auto" }}>
          {asking ? "…" : "Ask"}
        </Button>
      </div>
    </Card>
  );
}

const POLL_MS = 1500;

export function ResearchReportClient({ queryId, initialReport }: { queryId: string; initialReport: ResearchReportDto }) {
  const router = useRouter();
  const [report, setReport] = useState(initialReport);
  const [tool, setTool] = useState<string>("answer");
  const [openPassage, setOpenPassage] = useState<number | null>(null);
  const [highlightPassage, setHighlightPassage] = useState<number | null>(null);
  const [openSection, setOpenSection] = useState<string | null>("s1");
  const [refreshing, setRefreshing] = useState(false);
  const [pinning, setPinning] = useState(false);
  const passageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (report.status !== "processing") return;
    const t = setInterval(async () => {
      const fresh = await getResearchReportAction(queryId);
      setReport(fresh);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [report.status, queryId]);

  const data = report.status === "done" ? report : null;
  const segments = useMemo(() => data?.segments || [], [data]);
  const hasSources = data ? data.outcome !== "not_found" && segments.length > 0 : false;
  const note = data?.note;
  const authorities = note?.authorities || segments.map((s, i) => ({ n: i + 1, title: s.documentTitle, court: s.court ?? null, citation: s.citation ?? null, source: s.source, url: s.url ?? null }));

  function goToPassage(n: number) {
    setOpenPassage(n);
    setHighlightPassage(n);
    requestAnimationFrame(() => passageRefs.current[n]?.scrollIntoView({ behavior: "smooth", block: "center" }));
    setTimeout(() => setHighlightPassage(null), 1600);
  }

  async function refresh() {
    setRefreshing(true);
    const result = await refreshResearchQueryAction(queryId);
    setRefreshing(false);
    if (result.ok) router.push(`/research/${result.data.searchId}`);
  }

  async function pin() {
    if (!data) return;
    setPinning(true);
    await pinResearchQueryAction(queryId, !data.query.pinned_at);
    const fresh = await getResearchReportAction(queryId);
    setReport(fresh);
    setPinning(false);
  }

  if (report.status === "processing") return <Loading label="Still researching…" />;
  if (!data) return <Callout tone="danger">Report not found.</Callout>;

  const { query } = data;
  const lawAsOn = note?.lawAsOn ? fmtDateLong(note.lawAsOn) : null;

  return (
    <div className="research-page" style={{ display: "flex", flexDirection: "column", gap: 16, padding: 24 }}>
      <Card style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <button onClick={() => router.push("/research")} style={{ all: "unset", cursor: "pointer", fontSize: 12, color: "var(--color-text-muted)", marginBottom: 6, display: "block" }}>
              ← Vidhira Research
            </button>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 22 }}>{query.title || query.text}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 11.5, color: "var(--color-text-muted)", marginTop: 4 }}>
              <span>{fmtDateLong(query.created_at)}</span>
              {lawAsOn && (
                <span style={{ background: "var(--color-gold)", color: "var(--color-navy)", borderRadius: 999, padding: "3px 10px", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em" }}>
                  LAW AS ON {lawAsOn.toUpperCase()}
                </span>
              )}
              {query.sources_enabled.length > 0 && <span>{query.sources_enabled.map((s) => SOURCE_LABEL[s] || s).join(", ")}</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="outline" onClick={refresh} disabled={refreshing} style={{ width: "auto" }}>
              {refreshing ? "Refreshing…" : hasSources ? "Refresh" : "Search again"}
            </Button>
            {hasSources && (
              <>
                <a href={`/api/bff/research/${queryId}/export-pdf`} download style={{ textDecoration: "none" }}>
                  <Button variant="outline" style={{ width: "auto" }}>
                    Export research note
                  </Button>
                </a>
                <Button variant="outline" onClick={pin} disabled={pinning} style={{ width: "auto" }}>
                  {query.pinned_at ? "Unpin" : "Pin"}
                </Button>
                <Button onClick={() => chatRef.current?.scrollIntoView({ behavior: "smooth" })} style={{ width: "auto" }}>
                  Ask follow-up
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>

      {!hasSources ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Callout tone="warning">
            {NOT_FOUND_REASON_COPY[query.not_found_reason ?? ""] || "No passage cleared the relevance threshold, or the only matches were a party's arguments (which can't be cited as the law)."}
            {typeof query.top_score === "number" && (
              <div style={{ marginTop: 6, fontSize: 12 }}>
                Best match found: {query.top_score.toFixed(2)} (threshold {Number(query.threshold).toFixed(2)}).
              </div>
            )}
          </Callout>
          <Card style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16 }}>
            <div style={EYEBROW_STYLE}>TRY THIS INSTEAD</div>
            <Button onClick={() => router.push("/assistant")} style={{ width: "auto" }}>
              Try the AI Legal Assistant →
            </Button>
            <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
              Suggested rephrasings:
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                <li>Drop the specific section number and search by topic instead.</li>
                <li>Search with just the Act name, without the section number.</li>
                <li>Try a shorter, plainer version of the question.</li>
              </ul>
            </div>
            <Button variant="outline" onClick={refresh} disabled={refreshing} style={{ width: "auto" }}>
              {refreshing ? "Fetching…" : "Request this be added to the library"}
            </Button>
          </Card>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={EYEBROW_STYLE}>
              STEP 1 · RETRIEVED PASSAGES — {segments.length} chunk{segments.length === 1 ? "" : "s"} retrieved above threshold {Number(query.threshold).toFixed(2)}
            </div>
            {segments.map((seg, i) => {
              const n = i + 1;
              return (
                <PassageRow
                  key={seg.chunkId ?? n}
                  n={n}
                  seg={seg}
                  open={openPassage === n}
                  onToggle={() => setOpenPassage((cur) => (cur === n ? null : n))}
                  highlighted={highlightPassage === n}
                  nodeRef={(el) => {
                    if (el) passageRefs.current[n] = el;
                  }}
                />
              );
            })}
          </div>

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
                    <Card style={{ background: "var(--color-navy)", color: "#F6F1E8", display: "flex", flexDirection: "column", gap: 6, padding: 16 }}>
                      <div style={{ fontFamily: "var(--font-serif)", fontSize: 18 }}>{query.text}</div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11.5, color: "#9AA5BC" }}>
                        {lawAsOn && <span>LAW AS ON {lawAsOn}</span>}
                        <span>
                          {note.authorities.length} AUTHORIT{note.authorities.length === 1 ? "Y" : "IES"}
                        </span>
                        {note.jurisdiction && <span>{note.jurisdiction}</span>}
                      </div>
                    </Card>

                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {note.sections.map((sec, i) => (
                        <AccordionSection key={sec.id} index={i} section={sec} open={openSection === sec.id} onToggle={() => setOpenSection((cur) => (cur === sec.id ? null : sec.id))} onCite={goToPassage} />
                      ))}
                    </div>

                    {note.position?.label && (
                      <Callout tone={POSITION_TONE[note.position.label] || "neutral"}>
                        <strong>{note.position.label}.</strong> {note.position.note}
                      </Callout>
                    )}

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Button onClick={() => router.push("/advocates")} style={{ width: "auto" }}>
                        Consult an advocate on this
                      </Button>
                      <Button variant="outline" onClick={() => router.push("/drafts")} style={{ width: "auto" }}>
                        Draft a document instead
                      </Button>
                    </div>
                  </>
                ) : (
                  <Callout tone="neutral">{data.aiSummary ? data.aiSummary : "Showing the retrieved passages above directly — no AI summary was generated for this report."}</Callout>
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
          <FollowUpChat queryId={queryId} />
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
