import { useEffect, useRef, useState } from "react";
import { useGet } from "../../api/hooks";
import { useUI } from "../../state/UIState";
import { Card, Callout, Loading } from "../../components/ui";
import { CLASS_LABEL, SOURCE_LABEL } from "../Research";

// In-app full judgment reader — the data (document metadata + every indexed chunk, in
// reading order) already exists via /corpus/documents/:id and /corpus/documents/:id/chunks
// (built for the browse-library "Read passages" feature); this page just reads it full-page
// with paragraph numbers and, when arrived at from a report, highlights the paragraphs that
// report actually cited.
export function JudgmentReader({ docId }) {
  const { go, takeHandoff, setResearchQuestion } = useUI();
  const [citedChunkIds] = useState(() => takeHandoff("research")?.citedChunkIds || []);
  const citedSet = new Set(citedChunkIds);
  const doc = useGet(`/corpus/documents/${docId}`);
  const chunks = useGet(`/corpus/documents/${docId}/chunks`);
  const paraRefs = useRef({});

  useEffect(() => {
    if (!chunks.data || citedChunkIds.length === 0) return;
    const firstCited = citedChunkIds.find((id) => paraRefs.current[id]);
    if (firstCited) requestAnimationFrame(() => paraRefs.current[firstCited]?.scrollIntoView({ behavior: "smooth", block: "center" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunks.data]);

  if (doc.isLoading || chunks.isLoading) return <Loading label="Loading judgment…" />;
  if (doc.isError) return <Callout tone="danger">{doc.error.message}</Callout>;
  if (!doc.data) return <Callout tone="danger">Document not found.</Callout>;

  return (
    <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ flex: "2 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <button onClick={() => { setResearchQuestion(""); go("research"); }} style={{ all: "unset", cursor: "pointer", fontSize: 12, color: "var(--color-text-muted)" }}>← Research library</button>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 22 }}>{doc.data.title}</div>
        <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>
          {[SOURCE_LABEL[doc.data.source] || doc.data.source, doc.data.court, doc.data.citation].filter(Boolean).join(" · ")}
        </div>
        <Card>
          {(chunks.data || []).length === 0 && <Callout tone="neutral">No passages indexed for this document.</Callout>}
          {chunks.data?.map((c) => (
            <div
              key={c.id}
              ref={(el) => { if (el) paraRefs.current[c.id] = el; }}
              style={{ marginBottom: 16, background: citedSet.has(c.id) ? "#FDF3DC" : undefined, padding: citedSet.has(c.id) ? 10 : 0, borderRadius: 8, transition: "background 1s" }}
            >
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-label)", marginBottom: 2 }}>
                {c.para_number ? `¶ ${c.para_number} · ` : ""}{CLASS_LABEL[c.paragraph_class] || c.paragraph_class}
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{c.text}</div>
            </div>
          ))}
        </Card>
      </div>

      <div style={{ flex: "1 1 260px", minWidth: 240, position: "sticky", top: 16 }}>
        <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--color-label)", letterSpacing: "0.05em" }}>DOCUMENT</div>
          <div style={{ fontSize: 12.5 }}>
            <div><strong>Source: </strong>{SOURCE_LABEL[doc.data.source] || doc.data.source}</div>
            {doc.data.court && <div><strong>Court: </strong>{doc.data.court}</div>}
            {doc.data.citation && <div><strong>Citation: </strong>{doc.data.citation}</div>}
            {doc.data.indexed_at && <div><strong>Indexed: </strong>{new Date(doc.data.indexed_at).toLocaleDateString("en-IN")}</div>}
          </div>
          {doc.data.canonical_url && <a href={doc.data.canonical_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, fontWeight: 600 }}>Open original on Indian Kanoon ↗</a>}

          {citedChunkIds.length > 0 && (
            <>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--color-label)", letterSpacing: "0.05em", marginTop: 6 }}>CITED IN THAT REPORT</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {citedChunkIds.map((id, i) => (
                  <button
                    key={id}
                    onClick={() => paraRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" })}
                    style={{ all: "unset", cursor: "pointer", fontSize: 12, color: "var(--color-rust)" }}
                  >
                    Jump to passage {i + 1} ↓
                  </button>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
