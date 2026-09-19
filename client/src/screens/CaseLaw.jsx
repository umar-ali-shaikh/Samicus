import { useState } from "react";
import { searchCaseLaw, getCase, getAiAnswer } from "../api/caseLawClient";
import { Card, Button, Badge, Callout, EmptyState } from "../components/ui";

// This screen is the one place in the client that makes a real network call — everything
// else in this app is static/mock data by design (see client/src/data/mockData.js).

const COURTS = [
  { value: "", label: "Any court" },
  { value: "supremecourt", label: "Supreme Court" },
  { value: "highcourts", label: "High Courts" },
  { value: "tribunals", label: "Tribunals" },
];

export function CaseLaw() {
  const [query, setQuery] = useState("");
  const [court, setCourt] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [selectedDoc, setSelectedDoc] = useState(null);
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState("");

  const [aiAnswer, setAiAnswer] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  async function runSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setSelectedDoc(null);
    setAiAnswer(null);
    setAiError("");
    try {
      const data = await searchCaseLaw(query, { court, fromDate, toDate });
      setResults(data);
    } catch (err) {
      setError(err.message);
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  async function askAi() {
    if (!query.trim()) return;
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 22 }}>Case law search</div>
        <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>Search Indian court judgments via Indian Kanoon.</div>
      </div>

      <Card>
        <form onSubmit={runSearch} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='e.g. "breach of contract" ANDD damages'
            style={{ padding: 10, borderRadius: 9, border: "1px solid var(--color-border)" }}
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
            <select value={court} onChange={(e) => setCourt(e.target.value)} style={{ padding: 10, borderRadius: 9, border: "1px solid var(--color-border)" }}>
              {COURTS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <input type="date" value={fromDate ? isoToInput(fromDate) : ""} onChange={(e) => setFromDate(inputToIk(e.target.value))} style={{ padding: 10, borderRadius: 9, border: "1px solid var(--color-border)" }} title="From date" />
            <input type="date" value={toDate ? isoToInput(toDate) : ""} onChange={(e) => setToDate(inputToIk(e.target.value))} style={{ padding: 10, borderRadius: 9, border: "1px solid var(--color-border)" }} title="To date" />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Button type="submit" disabled={loading}>{loading ? "Searching…" : "Search"}</Button>
            <Button type="button" variant="outline" onClick={askAi} disabled={aiLoading || !query.trim()}>{aiLoading ? "Asking AI…" : "Ask AI"}</Button>
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
                  <li key={s.tid} style={{ cursor: "pointer" }} onClick={() => openCase(s.tid)}>{s.title} <span style={{ opacity: 0.7 }}>({s.docsource})</span></li>
                ))}
              </ol>
            </div>
          )}
        </Card>
      )}

      {error && <Callout tone="danger">{error}</Callout>}

      {results && (
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{results.found} results found</div>
      )}

      {results && results.docs.length === 0 && <EmptyState title="No cases found" body="Try a different query or widen your filters." />}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {results?.docs.map((doc) => (
          <Card key={doc.tid} style={{ cursor: "pointer" }} onClick={() => openCase(doc.tid)}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontWeight: 700 }}>{doc.title}</div>
              <Badge>{doc.docsource}</Badge>
            </div>
            {/* doc.headline is sanitized server-side (server/src/utils/sanitizeHtml.js) before it ever reaches the client. */}
            <div style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginTop: 6 }} dangerouslySetInnerHTML={{ __html: doc.headline }} />
          </Card>
        ))}
      </div>

      {docLoading && <Card>Loading judgment…</Card>}
      {docError && <Callout tone="danger">{docError}</Callout>}

      {selectedDoc && (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 18 }}>{selectedDoc.title}</div>
            <Button variant="outline" onClick={() => setSelectedDoc(null)}>Close</Button>
          </div>
          {/* selectedDoc.doc is sanitized server-side before it ever reaches the client. */}
          <div style={{ fontSize: 13, lineHeight: 1.6, marginTop: 10, maxHeight: 420, overflowY: "auto" }} dangerouslySetInnerHTML={{ __html: selectedDoc.doc }} />
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
