import { useState } from "react";
import { useAppState } from "../state/AppState";
import { CORPUS, CITES, RAG_QUERIES } from "../data/mockData";
import { Card, StatTile, Callout, Button, ProgressBar, Badge } from "../components/ui";

// The core "grounded rendering" primitive: splits a paragraph on [n] markers and turns
// each into a clickable citation button — mirrors Vidhira.dc.html's parts() function.
function Cited({ text, openChunk, onOpen }) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <span>
      {parts.map((p, i) => {
        const m = p.match(/^\[(\d+)\]$/);
        if (!m) return <span key={i}>{p}</span>;
        const n = Number(m[1]);
        const active = openChunk === n;
        return (
          <button
            key={i}
            onClick={() => onOpen(n)}
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, margin: "0 2px",
              borderRadius: 5, border: "none", fontFamily: "var(--font-mono)", fontSize: 10.5, cursor: "pointer",
              background: active ? "var(--color-navy)" : "#F1EFE6", color: active ? "#fff" : "var(--color-ink)",
            }}
          >
            {n}
          </button>
        );
      })}
    </span>
  );
}

export function Research() {
  const { state, act } = useAppState();
  const [pane, setPane] = useState("passage");
  const query = RAG_QUERIES.find((q) => q.id === state.ragActive);
  const openChunk = state.ragOpenChunk || query.trail?.[0]?.n || null;
  const activeCite = openChunk ? CITES[openChunk] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 24 }}>Vidhira</div>
          <div style={{ fontSize: 11.5, letterSpacing: "0.06em", color: "var(--color-label)", fontWeight: 700 }}>GROUNDED LEGAL RESEARCH · SAMICUS</div>
          <div style={{ fontSize: 12.5, color: "var(--color-text-muted)", maxWidth: 480 }}>Answers are assembled only from passages retrieved from the indexed corpus. Every sentence carries the citation it came from.</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {CORPUS.map((c) => <StatTile key={c.id} value={c.count} label={c.name.toUpperCase()} />)}
        </div>
      </div>

      <Card style={{ background: "var(--color-navy)", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            defaultValue={query.question}
            onKeyDown={(e) => e.key === "Enter" && act.askSamicus(e.target.value)}
            placeholder="Ask a question of Indian statutes, rules and reported judgments"
            style={{ flex: "1 1 200px", minWidth: 0, padding: 12, borderRadius: 10, border: "1px solid #2A3854", background: "#18233A", color: "#fff" }}
          />
          <Button onClick={() => act.runRag(query.id)}>Research</Button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {RAG_QUERIES.map((q) => (
            <button key={q.id} onClick={() => act.runRag(q.id)} style={{ padding: "6px 12px", borderRadius: 999, border: "1px solid #2A3854", background: state.ragActive === q.id ? "var(--color-gold)" : "#182338", color: state.ragActive === q.id ? "var(--color-navy)" : "#F6F1E8", fontSize: 11.5, cursor: "pointer" }}>
              {q.label}
            </button>
          ))}
        </div>
      </Card>

      {state.ragStage === "retrieving" && (
        <Card><div style={{ fontSize: 13 }}>Chunking the query… discarding anything below the relevance threshold (0.62)…</div><ProgressBar pct={60} /></Card>
      )}

      {state.ragStage === "answer" && (
        <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 220px", minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-label)" }}>RETRIEVAL TRAIL · {query.trail.length} of {query.trail.length + query.discarded} kept</div>
            {query.trail.map((c) => (
              <button key={c.n} onClick={() => act.openChunk(c.n)} style={{ textAlign: "left", padding: 10, borderRadius: 10, border: `1px solid ${openChunk === c.n ? "var(--color-navy)" : "var(--color-border)"}`, background: "#fff", cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 10.5 }}>
                  <span>{c.chunk}</span><span style={{ color: c.score >= 0.8 ? "#0F7A55" : "#D9A441" }}>{c.score}</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 12, margin: "3px 0" }}>{c.src}</div>
                <ProgressBar pct={c.score * 100} tone={c.score >= 0.8 ? "mint" : undefined} />
              </button>
            ))}
            {query.discarded > 0 && (
              <div style={{ border: "1px dashed var(--color-border)", borderRadius: 10, padding: 10, fontSize: 11.5, color: "var(--color-text-muted)" }}>
                {query.discarded} chunks discarded — below the 0.62 relevance floor. Never shown to the answer model.
              </div>
            )}
          </div>

          <div style={{ flex: "3 1 260px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            <Card>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-label)" }}>QUESTION</div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 18 }}>{query.question}</div>
            </Card>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Badge tone={query.notFound ? "warning" : "success"}>{query.notFound ? "Answer withheld" : `${query.trail.length} passages used`}</Badge>
              <Badge>0 unsupported sentences</Badge>
              <Badge tone="info">Corpus as of 14 Aug 2026</Badge>
            </div>

            {query.notFound && (
              <>
                <Callout tone="warning" title="Not in the indexed corpus">{query.notFoundBody}</Callout>
                <Card>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-label)", marginBottom: 8 }}>WHAT THE INDEX DOES HOLD</div>
                  {query.partials.map((p, i) => (
                    <div key={i} style={{ fontSize: 13, marginBottom: 8 }}>
                      <Cited text={p.text} openChunk={openChunk} onOpen={act.openChunk} />
                    </div>
                  ))}
                  <div style={{ fontSize: 11.5, color: "var(--color-label)", marginTop: 8 }}>Vidhira will not write an answer that its sources do not support. Ask a verified advocate, or narrow the question to what is indexed.</div>
                </Card>
              </>
            )}

            {!query.notFound && (
              <Card>
                {query.sections.map((s, i) => (
                  <div key={i} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--color-rust)", letterSpacing: "0.05em", marginBottom: 4 }}>{s.h.toUpperCase()}</div>
                    {s.paras.map((p, j) => <div key={j} style={{ fontSize: 13.5, lineHeight: 1.6, marginBottom: 4 }}><Cited text={p} openChunk={openChunk} onOpen={act.openChunk} /></div>)}
                  </div>
                ))}
              </Card>
            )}

            {!query.notFound && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Button onClick={act.exportResearch}>Export research note</Button>
                <Button variant="outline" onClick={() => act.openQuote()}>Send to an advocate</Button>
                <Button variant="ghost" onClick={() => act.flagCitation(activeCite?.short)}>Flag for human review</Button>
              </div>
            )}

            {!query.notFound && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-label)", marginBottom: 8 }}>AUTHORITIES RELIED ON</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                  {query.trail.map((c) => {
                    const cite = Object.entries(CITES).find(([, v]) => v.chunk === c.chunk);
                    if (!cite) return null;
                    const [n, v] = cite;
                    return (
                      <button key={n} onClick={() => act.openChunk(Number(n))} style={{ textAlign: "left", padding: 10, borderRadius: 10, border: "1px solid var(--color-border)", background: "#fff", cursor: "pointer" }}>
                        <Badge tone={v.treatment.includes("GOOD LAW") || v.treatment === "IN FORCE" ? "success" : "warning"}>{v.treatment}</Badge>
                        <div style={{ fontWeight: 700, fontSize: 12.5, marginTop: 4 }}>{v.short}</div>
                        <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{v.meta}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div style={{ flex: "1 1 280px", minWidth: 0 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {["passage", "timeline", "filters"].map((p) => (
                <button key={p} onClick={() => setPane(p)} style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "none", background: pane === p ? "var(--color-navy)" : "#F1EFE6", color: pane === p ? "#fff" : "var(--color-ink)", fontSize: 11.5, fontWeight: 600, cursor: "pointer", textTransform: "capitalize" }}>{p}</button>
              ))}
            </div>

            {pane === "passage" && activeCite && (
              <Card>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-label)" }}>{activeCite.kindLabel}</div>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 15, marginBottom: 8 }}>{activeCite.title}</div>
                <Badge tone={activeCite.treatment.includes("GOOD LAW") || activeCite.treatment === "IN FORCE" ? "success" : "warning"}>{activeCite.treatment}</Badge>
                <div style={{ borderLeft: "3px solid var(--color-gold)", paddingLeft: 10, fontSize: 12.5, fontStyle: "italic", color: "var(--color-text-muted)", margin: "10px 0" }}>{activeCite.passage}</div>
                <Callout tone="success" title="Plain-language read">{activeCite.plain}</Callout>
              </Card>
            )}

            {pane === "timeline" && (
              <Card>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-label)", marginBottom: 8 }}>HOW THE DOCTRINE MOVED — {query.timelineSubject}</div>
                {query.timeline.map((t, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", marginTop: 5, flex: "none", background: t.dot === "good" ? "#159C6E" : t.dot === "bad" ? "#DB4F35" : "#8A8578" }} />
                    <div><div style={{ fontWeight: 700, fontSize: 12.5 }}>{t.year} · {t.title}</div><div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{t.body}</div></div>
                  </div>
                ))}
              </Card>
            )}

            {pane === "filters" && (
              <Card>
                <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>Filters apply to retrieval, not the written answer. Tightening them re-runs the search and rewrites the note.</div>
                <Button variant="outline" style={{ marginTop: 10 }} onClick={() => act.showToast("Reset to full corpus.")}>Reset to full corpus</Button>
              </Card>
            )}

            <div style={{ marginTop: 10, background: "var(--color-navy)", color: "#F6F1E8", borderRadius: 12, padding: 12, fontSize: 11.5 }}>
              Judgments synced nightly from court registries. Bare acts checked against India Code weekly. Vidhira states its cut-off on every answer and refuses questions beyond it.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
