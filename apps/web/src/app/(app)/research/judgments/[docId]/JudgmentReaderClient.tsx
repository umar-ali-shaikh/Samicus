"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, Callout } from "@/components/ui";
import { CLASS_LABEL, SOURCE_LABEL } from "../../shared";
import { fmtDate } from "@/lib/format";
import type { CorpusChunkBriefDto, CorpusDocumentDetailDto } from "@vidhira/contracts";

// Ported from frontend/src/screens/research/JudgmentReader.jsx -- the data (document metadata
// + every indexed chunk, in reading order) is built for the browse-library "Read passages"
// feature; this page reads it full-page with paragraph numbers, highlighting any chunks a
// report linked here as cited (see page.tsx's `cited` searchParam).
export function JudgmentReaderClient({ doc, initialChunks, citedChunkIds }: { doc: CorpusDocumentDetailDto; initialChunks: CorpusChunkBriefDto[]; citedChunkIds: string[] }) {
  const router = useRouter();
  const citedSet = new Set(citedChunkIds);
  const paraRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (citedChunkIds.length === 0) return;
    const firstCited = citedChunkIds.find((id) => paraRefs.current[id]);
    if (firstCited) requestAnimationFrame(() => paraRefs.current[firstCited]?.scrollIntoView({ behavior: "smooth", block: "center" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap", padding: 24 }}>
      <div style={{ flex: "2 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <button onClick={() => router.push("/research")} style={{ all: "unset", cursor: "pointer", fontSize: 12, color: "var(--color-text-muted)" }}>
          ← Research library
        </button>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 22 }}>{doc.title}</div>
        <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{[SOURCE_LABEL[doc.source] || doc.source, doc.court, doc.citation].filter(Boolean).join(" · ")}</div>
        <Card style={{ padding: 16 }}>
          {initialChunks.length === 0 && <Callout tone="neutral">No passages indexed for this document.</Callout>}
          {initialChunks.map((c) => (
            <div
              key={c.id}
              ref={(el) => {
                if (el) paraRefs.current[c.id] = el;
              }}
              style={{ marginBottom: 16, background: citedSet.has(c.id) ? "#FDF3DC" : undefined, padding: citedSet.has(c.id) ? 10 : 0, borderRadius: 8, transition: "background 1s" }}
            >
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-label)", marginBottom: 2 }}>
                {c.para_number ? `¶ ${c.para_number} · ` : ""}
                {CLASS_LABEL[c.paragraph_class] || c.paragraph_class}
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{c.text}</div>
            </div>
          ))}
        </Card>
      </div>

      <div style={{ flex: "1 1 260px", minWidth: 240, position: "sticky", top: 16 }}>
        <Card style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--color-label)", letterSpacing: "0.05em" }}>DOCUMENT</div>
          <div style={{ fontSize: 12.5 }}>
            <div>
              <strong>Source: </strong>
              {SOURCE_LABEL[doc.source] || doc.source}
            </div>
            {doc.court && (
              <div>
                <strong>Court: </strong>
                {doc.court}
              </div>
            )}
            {doc.citation && (
              <div>
                <strong>Citation: </strong>
                {doc.citation}
              </div>
            )}
            {doc.indexed_at && (
              <div>
                <strong>Indexed: </strong>
                {fmtDate(doc.indexed_at)}
              </div>
            )}
          </div>
          {doc.canonical_url && (
            <a href={doc.canonical_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, fontWeight: 600 }}>
              Open original on Indian Kanoon ↗
            </a>
          )}

          {citedChunkIds.length > 0 && (
            <>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--color-label)", letterSpacing: "0.05em", marginTop: 6 }}>CITED IN THAT REPORT</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {citedChunkIds.map((id, i) => (
                  <button key={id} onClick={() => paraRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" })} style={{ all: "unset", cursor: "pointer", fontSize: 12, color: "var(--color-rust)" }}>
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
