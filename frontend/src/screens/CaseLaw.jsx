import { useEffect, useRef, useState } from "react";
import { searchCaseLaw, getCase, getAiAnswer } from "../api/caseLawClient";
import { Card, Button, Badge, Callout, EmptyState } from "../components/ui";
import { paginationInfo, PAGE_SIZE } from "../lib/pagination";
import { stripHtmlTags } from "../lib/format";

const COURTS = [
  { value: "", label: "Any court" },
  { value: "supremecourt", label: "Supreme Court" },
  { value: "highcourts", label: "High Courts" },
  { value: "tribunals", label: "Tribunals" },
];

const labelStyle = { display: "block", fontSize: 11.5, fontWeight: 700, color: "var(--color-label)", marginBottom: 4 };

// Indian Kanoon's returned HTML (headline snippets, the full judgment) carries its own
// relative links (/doc/…, /search/…) — clicked as-is inside our SPA, the browser navigates
// to our own origin at a path with no matching hash route, landing on Home. Intercept clicks
// inside these blocks instead: a same-site /doc/<id> link opens in our own in-app viewer,
// anything else opens on indiankanoon.org in a new tab — either way, it never hits our router.
function interceptIkLinks(onOpenDoc) {
  return (e) => {
    const a = e.target.closest("a");
    if (!a) return;
    const href = a.getAttribute("href");
    if (!href) return;
    e.preventDefault();
    const docMatch = href.match(/\/doc\/(\d+)/);
    if (docMatch) {
      onOpenDoc(docMatch[1]);
      return;
    }
    const absolute = /^https?:\/\//i.test(href) ? href : `https://indiankanoon.org${href.startsWith("/") ? "" : "/"}${href}`;
    window.open(absolute, "_blank", "noopener,noreferrer");
  };
}

export function CaseLaw() {
  const [query, setQuery] = useState("");
  const [court, setCourt] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(0);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [validationError, setValidationError] = useState("");

  const [selectedDoc, setSelectedDoc] = useState(null);
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState("");
  const docRef = useRef(null);

  const [aiAnswer, setAiAnswer] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  useEffect(() => {
    document.title = "Case law search · Vidhira";
  }, []);

  // Opening a result must bring the judgment into view, not just append it after a long
  // results list where it renders far below the fold with nothing to tell the reader it
  // even changed.
  useEffect(() => {
    if (selectedDoc) docRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedDoc]);

  async function search(pagenum) {
    setLoading(true);
    setError("");
    setSelectedDoc(null);
    setAiAnswer(null);
    setAiError("");
    try {
      const data = await searchCaseLaw(query, { court, fromDate, toDate }, pagenum);
      setResults(data);
      setPage(pagenum);
    } catch (err) {
      setError(err.message);
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  function runSearch(e) {
    e.preventDefault();
    if (!query.trim()) { setValidationError("Enter a search term first — e.g. a case name, a section, or a few keywords."); return; }
    setValidationError("");
    search(0);
  }

  async function askAi() {
    if (!query.trim()) { setValidationError("Enter a search term first."); return; }
    setValidationError("");
    setAiLoading(true);
    setAiError("");
    setAiAnswer(null);
    try {
      const data = await getAiAnswer(query, { court, fromDate, toDate });
      setAiAnswer(data);
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  }

  async function openCase(tid) {
    setDocLoading(true);
    setDocError("");
    setSelectedDoc(null);
    try {
      const data = await getCase(tid);
      setSelectedDoc(data);
    } catch (err) {
      setDocError(err.message);
    } finally {
      setDocLoading(false);
    }
  }

  const onDocLinkClick = interceptIkLinks(openCase);
  const found = results?.found || 0;
  const { rangeStart, rangeEnd, totalPages, hasPrev, hasNext } = paginationInfo(found, page, results?.docs.length || 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 400, margin: 0 }}>Case law search</h1>
        <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>Search Indian court judgments via Indian Kanoon.</div>
      </div>

      <Card>
        <form onSubmit={runSearch} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label htmlFor="case-law-query" style={labelStyle}>Search terms</label>
            <input
              id="case-law-query"
              value={query}
              onChange={(e) => { setQuery(e.target.value); if (validationError) setValidationError(""); }}
              placeholder='e.g. "breach of contract" ANDD damages'
              style={{ width: "100%", padding: 10, borderRadius: 9, border: "1px solid var(--color-border)", boxSizing: "border-box" }}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
            <div>
              <label htmlFor="case-law-court" style={labelStyle}>Court</label>
              <select id="case-law-court" value={court} onChange={(e) => setCourt(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 9, border: "1px solid var(--color-border)", boxSizing: "border-box" }}>
                {COURTS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
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
            <Button type="submit" disabled={loading}>{loading ? "Searching…" : "Search"}</Button>
            <Button type="button" variant="outline" onClick={askAi} disabled={aiLoading}>{aiLoading ? "Asking AI…" : "Ask AI"}</Button>
          </div>
        </form>
      </Card>

      {aiError && <Callout tone="danger">{aiError}</Callout>}

      {aiAnswer && aiAnswer.outcome === "not_found" && (
        <EmptyState title="No cases to ground an answer" body="Try a different query — the AI answer only uses real Indian Kanoon search results as context." />
      )}

      {aiAnswer && aiAnswer.outcome === "answered" && (
        <Card>
          <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 8 }}>AI answer</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{aiAnswer.answer}</div>
          {aiAnswer.sources?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Sources</div>
              <ol style={{ fontSize: 12, color: "var(--color-text-muted)", paddingLeft: 18 }}>
                {aiAnswer.sources.map((s) => (
                  <li key={s.tid} style={{ cursor: "pointer" }} onClick={() => openCase(s.tid)}>{stripHtmlTags(s.title)} <span style={{ opacity: 0.7 }}>({s.docsource})</span></li>
                ))}
              </ol>
            </div>
          )}
        </Card>
      )}

      {error && <Callout tone="danger">{error}</Callout>}

      {results && (
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          {found > 0 ? `${rangeStart}-${rangeEnd} of ${found} results` : "0 results"}
        </div>
      )}

      {results && results.docs.length === 0 && <EmptyState title="No cases found" body="Try a different query or widen your filters." />}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {results?.docs.map((doc) => (
          <Card key={doc.tid} style={{ cursor: "pointer" }} onClick={() => openCase(doc.tid)}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontWeight: 700 }}>{stripHtmlTags(doc.title)}</div>
              <Badge>{doc.docsource}</Badge>
            </div>
            {/* doc.headline is sanitized server-side (backend/src/utils/sanitizeHtml.js) before it ever reaches the client. */}
            <div
              style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginTop: 6 }}
              dangerouslySetInnerHTML={{ __html: doc.headline }}
              onClick={(e) => { e.stopPropagation(); onDocLinkClick(e); }}
            />
          </Card>
        ))}
      </div>

      {results && found > PAGE_SIZE && (
        <div style={{ display: "flex", gap: 10, justifyContent: "center", alignItems: "center" }}>
          <Button variant="outline" onClick={() => search(page - 1)} disabled={!hasPrev || loading}>← Previous</Button>
          <span style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>Page {page + 1} of {totalPages}</span>
          <Button variant="outline" onClick={() => search(page + 1)} disabled={!hasNext || loading}>Next →</Button>
        </div>
      )}

      {docLoading && <Card>Loading judgment…</Card>}
      {docError && <Callout tone="danger">{docError}</Callout>}

      {selectedDoc && (
        <Card ref={docRef}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 18 }}>{stripHtmlTags(selectedDoc.title)}</div>
            <Button variant="outline" onClick={() => setSelectedDoc(null)}>Close</Button>
          </div>
          {/* selectedDoc.doc is sanitized server-side before it ever reaches the client. */}
          <div style={{ fontSize: 13, lineHeight: 1.6, marginTop: 10, maxHeight: 420, overflowY: "auto" }} dangerouslySetInnerHTML={{ __html: selectedDoc.doc }} onClick={onDocLinkClick} />
          {selectedDoc.citeList?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 6 }}>Cited</div>
              <ul style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                {selectedDoc.citeList.map((c, i) => <li key={i}>{c.title || c}</li>)}
              </ul>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// <input type="date"> uses YYYY-MM-DD; Indian Kanoon's filters use DD-MM-YYYY.
function inputToIk(value) {
  if (!value) return "";
  const [y, m, d] = value.split("-");
  return `${d}-${m}-${y}`;
}
function isoToInput(ikDate) {
  const [d, m, y] = ikDate.split("-");
  return `${y}-${m}-${d}`;
}
