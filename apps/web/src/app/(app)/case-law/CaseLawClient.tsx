"use client";

import { useEffect, useRef, useState } from "react";
import { Card, Button, Badge, Callout, EmptyState, Loading } from "@/components/ui";
import { paginationInfo, PAGE_SIZE } from "@/lib/pagination";
import { stripHtmlTags } from "@/lib/format";
import { searchCaseLawAction, getCaseLawAiAnswerAction, getCaseLawDocumentAction } from "@/server/caseLawActions";
import type { CaseLawAiAnswerDto, CaseLawDocumentDto, CaseLawSearchResultDto } from "@vidhira/contracts";

const COURTS = [
  { value: "", label: "Any court" },
  { value: "supremecourt", label: "Supreme Court" },
  { value: "highcourts", label: "High Courts" },
  { value: "tribunals", label: "Tribunals" },
];

const labelStyle = { display: "block", fontSize: 11.5, fontWeight: 700, color: "var(--color-label)", marginBottom: 4 };

// <input type="date"> uses YYYY-MM-DD; Indian Kanoon's filters use DD-MM-YYYY.
function inputToIk(value: string): string {
  if (!value) return "";
  const [y, m, d] = value.split("-");
  return `${d}-${m}-${y}`;
}
function isoToInput(ikDate: string): string {
  const [d, m, y] = ikDate.split("-");
  return `${y}-${m}-${d}`;
}

// Indian Kanoon's returned HTML (headline snippets, the full judgment) carries its own
// relative links (/doc/…, /search/…) -- clicked as-is, the browser would navigate to this
// origin at a path with no matching route. Intercept clicks inside these blocks instead: a
// same-site /doc/<id> link opens in the in-page judgment viewer below, anything else opens on
// indiankanoon.org in a new tab.
function interceptIkLinks(onOpenDoc: (tid: string) => void) {
  return (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    const href = a.getAttribute("href");
    if (!href) return;
    e.preventDefault();
    const docMatch = href.match(/\/doc\/(\d+)/);
    if (docMatch) {
      onOpenDoc(docMatch[1]!);
      return;
    }
    const absolute = /^https?:\/\//i.test(href) ? href : `https://indiankanoon.org${href.startsWith("/") ? "" : "/"}${href}`;
    window.open(absolute, "_blank", "noopener,noreferrer");
  };
}

export function CaseLawClient() {
  const [query, setQuery] = useState("");
  const [court, setCourt] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(0);
  const [results, setResults] = useState<CaseLawSearchResultDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [validationError, setValidationError] = useState("");

  const [selectedDoc, setSelectedDoc] = useState<CaseLawDocumentDto | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState("");
  const docRef = useRef<HTMLDivElement>(null);

  const [aiAnswer, setAiAnswer] = useState<CaseLawAiAnswerDto | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  useEffect(() => {
    if (selectedDoc) docRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedDoc]);

  async function search(pagenum: number) {
    setLoading(true);
    setError("");
    setSelectedDoc(null);
    setAiAnswer(null);
    setAiError("");
    const result = await searchCaseLawAction(query, { court, fromDate, toDate }, pagenum);
    if (result.ok) {
      setResults(result.data);
      setPage(pagenum);
    } else {
      setError(result.error);
      setResults(null);
    }
    setLoading(false);
  }

  function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) {
      setValidationError("Enter a search term first — e.g. a case name, a section, or a few keywords.");
      return;
    }
    setValidationError("");
    search(0);
  }

  async function askAi() {
    if (!query.trim()) {
      setValidationError("Enter a search term first.");
      return;
    }
    setValidationError("");
    setAiLoading(true);
    setAiError("");
    setAiAnswer(null);
    const result = await getCaseLawAiAnswerAction(query, { court, fromDate, toDate });
    if (result.ok) setAiAnswer(result.data);
    else setAiError(result.error);
    setAiLoading(false);
  }

  async function openCase(tid: string) {
    setDocLoading(true);
    setDocError("");
    setSelectedDoc(null);
    const result = await getCaseLawDocumentAction(tid);
    if (result.ok) setSelectedDoc(result.data);
    else setDocError(result.error);
    setDocLoading(false);
  }

  const onDocLinkClick = interceptIkLinks(openCase);
  const found = results?.found || 0;
  const { rangeStart, rangeEnd, totalPages, hasPrev, hasNext } = paginationInfo(found, page, results?.docs.length || 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, padding: 24 }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 400, margin: 0 }}>Case law search</h1>
        <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>Search Indian court judgments via Indian Kanoon.</div>
      </div>

      <Card style={{ padding: 16 }}>
        <form onSubmit={runSearch} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label htmlFor="case-law-query" style={labelStyle}>Search terms</label>
            <input
              id="case-law-query"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (validationError) setValidationError("");
              }}
              placeholder='e.g. "breach of contract" ANDD damages'
              style={{ width: "100%", padding: 10, borderRadius: 9, border: "1px solid var(--color-border)", boxSizing: "border-box" }}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
            <div>
              <label htmlFor="case-law-court" style={labelStyle}>Court</label>
              <select id="case-law-court" value={court} onChange={(e) => setCourt(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 9, border: "1px solid var(--color-border)", boxSizing: "border-box" }}>
                {COURTS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="case-law-from" style={labelStyle}>From date</label>
              <input id="case-law-from" type="date" value={fromDate ? isoToInput(fromDate) : ""} onChange={(e) => setFromDate(inputToIk(e.target.value))} style={{ width: "100%", padding: 10, borderRadius: 9, border: "1px solid var(--color-border)", boxSizing: "border-box" }} />
            </div>
            <div>
              <label htmlFor="case-law-to" style={labelStyle}>To date</label>
              <input id="case-law-to" type="date" value={toDate ? isoToInput(toDate) : ""} onChange={(e) => setToDate(inputToIk(e.target.value))} style={{ width: "100%", padding: 10, borderRadius: 9, border: "1px solid var(--color-border)", boxSizing: "border-box" }} />
            </div>
          </div>
          {validationError && <Callout tone="danger">{validationError}</Callout>}
          <div style={{ display: "flex", gap: 10 }}>
            <Button type="submit" disabled={loading} style={{ width: "auto" }}>
              {loading ? "Searching…" : "Search"}
            </Button>
            <Button type="button" variant="outline" onClick={askAi} disabled={aiLoading} style={{ width: "auto" }}>
              {aiLoading ? "Asking AI…" : "Ask AI"}
            </Button>
          </div>
        </form>
      </Card>

      {aiError && <Callout tone="danger">{aiError}</Callout>}

      {aiAnswer && aiAnswer.outcome === "not_found" && (
        <EmptyState title="No cases to ground an answer" body="Try a different query — the AI answer only uses real Indian Kanoon search results as context." />
      )}

      {aiAnswer && aiAnswer.outcome === "answered" && (
        <Card style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 8 }}>AI answer</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{aiAnswer.answer}</div>
          {aiAnswer.sources.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Sources</div>
              <ol style={{ fontSize: 12, color: "var(--color-text-muted)", paddingLeft: 18 }}>
                {aiAnswer.sources.map((s) => (
                  <li key={s.tid} style={{ cursor: "pointer" }} onClick={() => openCase(String(s.tid))}>
                    {stripHtmlTags(s.title)} <span style={{ opacity: 0.7 }}>({s.docsource})</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Card>
      )}

      {error && <Callout tone="danger">{error}</Callout>}

      {results && (
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{found > 0 ? `${rangeStart}-${rangeEnd} of ${found} results` : "0 results"}</div>
      )}

      {results && results.docs.length === 0 && <EmptyState title="No cases found" body="Try a different query or widen your filters." />}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {results?.docs.map((doc) => (
          <div key={doc.tid} onClick={() => openCase(String(doc.tid))} style={{ cursor: "pointer" }}>
            <Card style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontWeight: 700 }}>{stripHtmlTags(doc.title)}</div>
                <Badge>{doc.docsource}</Badge>
              </div>
              {/* doc.headline is sanitized server-side (services/sanitizeHtml.js) before it ever reaches the client. */}
              <div
                style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginTop: 6 }}
                dangerouslySetInnerHTML={{ __html: doc.headline }}
                onClick={(e) => {
                  e.stopPropagation();
                  onDocLinkClick(e);
                }}
              />
            </Card>
          </div>
        ))}
      </div>

      {results && found > PAGE_SIZE && (
        <div style={{ display: "flex", gap: 10, justifyContent: "center", alignItems: "center" }}>
          <Button variant="outline" onClick={() => search(page - 1)} disabled={!hasPrev || loading} style={{ width: "auto" }}>
            ← Previous
          </Button>
          <span style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
            Page {page + 1} of {totalPages}
          </span>
          <Button variant="outline" onClick={() => search(page + 1)} disabled={!hasNext || loading} style={{ width: "auto" }}>
            Next →
          </Button>
        </div>
      )}

      {docLoading && <Loading label="Loading judgment…" />}
      {docError && <Callout tone="danger">{docError}</Callout>}

      {selectedDoc && (
        <div ref={docRef}>
          <Card style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 18 }}>{stripHtmlTags(selectedDoc.title)}</div>
              <Button variant="outline" onClick={() => setSelectedDoc(null)} style={{ width: "auto" }}>
                Close
              </Button>
            </div>
            {/* selectedDoc.doc is sanitized server-side before it ever reaches the client. */}
            <div style={{ fontSize: 13, lineHeight: 1.6, marginTop: 10, maxHeight: 420, overflowY: "auto" }} dangerouslySetInnerHTML={{ __html: selectedDoc.doc }} onClick={onDocLinkClick} />
            {selectedDoc.citeList && selectedDoc.citeList.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 6 }}>Cited</div>
                <ul style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  {selectedDoc.citeList.map((c, i) => (
                    <li key={i}>{typeof c === "string" ? c : (c as { title?: string })?.title}</li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
