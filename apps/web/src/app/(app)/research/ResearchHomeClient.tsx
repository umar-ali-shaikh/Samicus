"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Callout, Button, Pill, Badge } from "@/components/ui";
import { fmtDateLong } from "@/lib/format";
import {
  runResearchAction,
  listResearchQueriesAction,
  pinResearchQueryAction,
  deleteResearchQueryAction,
  refreshResearchQueryAction,
} from "@/server/researchActions";
import type { CorpusStatusDto, ResearchQueryListItemDto } from "@vidhira/contracts";

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

const EYEBROW_STYLE = { fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--color-label)" };

const NOT_FOUND_REASON_LABEL: Record<string, string> = {
  corpus_gap: "The library doesn't have anything on this yet, even after trying to fetch new sources automatically.",
  ingest_failed: "A likely source was found but indexing it failed — try again, or rephrase.",
  below_threshold: "Something close was found but didn't clear the relevance bar.",
};

function notFoundTooltip(row: ResearchQueryListItemDto): string {
  const reason = NOT_FOUND_REASON_LABEL[row.not_found_reason ?? ""] || "No passage cleared the relevance threshold.";
  const score = typeof row.top_score === "number" ? ` (best match: ${row.top_score.toFixed(2)})` : "";
  return `${reason}${score}`;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function CorpusCards({ status }: { status: CorpusStatusDto | null }) {
  if (!status) return null;
  const bySource = status.bySource || [];
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
                {row.indexed_at && <> · indexed to {fmtDateLong(row.indexed_at)}</>}
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

function MyResearchCard({ row, onChanged }: { row: ResearchQueryListItemDto; onChanged: () => void }) {
  const router = useRouter();
  const [pending, setPending] = useState<"pin" | "retry" | "delete" | null>(null);

  async function pin() {
    setPending("pin");
    const result = await pinResearchQueryAction(row.id, !row.pinned_at);
    setPending(null);
    if (result.ok) onChanged();
  }
  async function retry() {
    setPending("retry");
    const result = await refreshResearchQueryAction(row.id);
    setPending(null);
    if (result.ok) router.push(`/research/${result.data.searchId}`);
  }
  async function remove() {
    if (!window.confirm(`Delete "${row.title || row.text}"?`)) return;
    setPending("delete");
    const result = await deleteResearchQueryAction(row.id);
    setPending(null);
    if (result.ok) onChanged();
  }

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 6, padding: 16 }}>
      <button onClick={() => router.push(`/research/${row.id}`)} style={{ all: "unset", cursor: "pointer", display: "block" }}>
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{row.title || row.text}</div>
      </button>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 11.5, color: "var(--color-text-muted)" }}>
        <span>{timeAgo(row.updated_at)}</span>
        <span>·</span>
        <span>
          {row.caseCount} case{row.caseCount === 1 ? "" : "s"}
        </span>
        {row.topCourt && (
          <>
            <span>·</span>
            <span>{row.topCourt}</span>
          </>
        )}
        <span title={row.outcome === "not_found" ? notFoundTooltip(row) : undefined}>
          <Badge tone={row.outcome === "not_found" ? "warning" : "success"}>{row.outcome === "not_found" ? "No match" : row.outcome}</Badge>
        </span>
        {row.rerun_count > 1 && <Badge tone="neutral">Re-run ×{row.rerun_count}</Badge>}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {row.outcome === "not_found" && (
          <Button variant="outline" onClick={retry} disabled={pending !== null} style={{ width: "auto" }}>
            {pending === "retry" ? "Retrying…" : "Retry"}
          </Button>
        )}
        <Button variant="outline" onClick={pin} disabled={pending !== null} style={{ width: "auto" }}>
          {row.pinned_at ? "Unpin" : "Pin"}
        </Button>
        <Button variant="ghost" onClick={remove} disabled={pending !== null} style={{ width: "auto" }}>
          Delete
        </Button>
      </div>
    </Card>
  );
}

export function ResearchHomeClient({
  initialStatus,
  initialMyResearch,
  initialExamples,
}: {
  initialStatus: CorpusStatusDto;
  initialMyResearch: ResearchQueryListItemDto[];
  initialExamples: ResearchQueryListItemDto[];
}) {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [sourcesEnabled, setSourcesEnabled] = useState<string[]>([]);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [myResearch, setMyResearch] = useState(initialMyResearch);
  const [examples] = useState(initialExamples);
  const [isPending, startTransition] = useTransition();
  const [runError, setRunError] = useState("");

  const lawAsOn = initialStatus.lawAsOn ? fmtDateLong(initialStatus.lawAsOn) : null;

  async function refetchMyResearch(q?: string) {
    const rows = await listResearchQueriesAction(q?.trim() ? { q: q.trim() } : {});
    setMyResearch(rows);
  }

  function run(text: string) {
    if (text.trim().length < 5 || isPending) return;
    setRunError("");
    startTransition(async () => {
      const result = await runResearchAction(text.trim(), sourcesEnabled);
      if (!result.ok) {
        setRunError(result.error);
        return;
      }
      setQuestion("");
      router.push(`/research/${result.data.queryId}`);
    });
  }

  function toggleSource(value: string) {
    setSourcesEnabled((cur) => (cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]));
  }

  return (
    <div className="research-page" style={{ display: "flex", flexDirection: "column", gap: 20, padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 26 }}>Vidhira Research</div>
        {lawAsOn && (
          <span style={{ background: "var(--color-gold)", color: "var(--color-navy)", borderRadius: 999, padding: "5px 12px", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em" }}>
            LAW AS ON {lawAsOn.toUpperCase()}
          </span>
        )}
      </div>

      <div style={{ fontSize: 13.5, color: "var(--color-text-muted)", lineHeight: 1.6, maxWidth: 760 }}>
        Vidhira Research answers only from statutes, rules and reported judgments it has actually indexed and retrieved for your question — never from memory. Every sentence in the note below carries the verbatim passage it came from, with the court, the section and a link to the source, so you can verify it before relying on it.
      </div>

      <div style={EYEBROW_STYLE}>RETRIEVAL-THEN-CITE · CORPUS OF RECORD</div>

      <Card style={{ background: "var(--color-navy)", display: "flex", flexDirection: "column", gap: 10, padding: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run(question)}
            maxLength={1000}
            placeholder="Search the corpus — statutes, rules and reported judgments"
            style={{ flex: "1 1 200px", minWidth: 0, padding: 12, borderRadius: 10, border: "1px solid #2A3854", background: "#18233A", color: "#fff" }}
          />
          <Button onClick={() => run(question)} disabled={question.trim().length < 5 || isPending} style={{ width: "auto" }}>
            {isPending ? "Researching…" : "Research"}
          </Button>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {SOURCE_FILTERS.map((f) => (
            <Pill key={f.value} active={sourcesEnabled.includes(f.value)} onClick={() => toggleSource(f.value)}>
              {f.label}
            </Pill>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: "#9AA5BC" }}>
          {isPending
            ? "Searching the indexed library — if nothing matches yet, new sources are fetched and indexed automatically before answering. This can take up to a minute."
            : "The library grows as questions are asked here or in the AI Legal Assistant."}
        </div>
      </Card>
      {runError && <Callout tone="danger">{runError}</Callout>}

      <CorpusCards status={initialStatus} />

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={EYEBROW_STYLE}>TRY ONE OF THESE</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {TRY_QUERIES.map((ex) => (
            <button
              key={ex.q}
              onClick={() => run(ex.q)}
              disabled={isPending}
              style={{ all: "unset", cursor: isPending ? "default" : "pointer", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", background: "#fff", border: "1px solid var(--color-border)", borderRadius: 11, padding: "12px 14px", minHeight: 44 }}
            >
              <span style={{ background: "var(--color-gold)", color: "var(--color-navy)", borderRadius: 999, padding: "3px 10px", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em" }}>{ex.area.toUpperCase()}</span>
              <span style={{ fontSize: 13.5, flex: 1 }}>{ex.q}</span>
            </button>
          ))}
        </div>
      </div>

      {!libraryQuery.trim() && myResearch.length === 0 && examples.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={EYEBROW_STYLE}>EXAMPLE RESEARCH</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
            {examples.map((ex) => (
              <Card key={ex.id} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{ex.title || ex.text}</div>
                <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>
                  {ex.caseCount} case{ex.caseCount === 1 ? "" : "s"} found
                </div>
                <Button variant="outline" onClick={() => router.push(`/research/${ex.id}`)} style={{ width: "auto" }}>
                  Open research
                </Button>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div style={EYEBROW_STYLE}>MY RESEARCH</div>
          <input
            value={libraryQuery}
            onChange={(e) => {
              setLibraryQuery(e.target.value);
              refetchMyResearch(e.target.value);
            }}
            placeholder="Search your past research…"
            style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--color-border)", fontSize: 12.5, minWidth: 200 }}
          />
        </div>
        {myResearch.length === 0 ? (
          <Callout tone="neutral">No searches yet — ask a question above to start your research library.</Callout>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
            {myResearch.map((row) => (
              <MyResearchCard key={row.id} row={row} onChanged={() => refetchMyResearch(libraryQuery)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
