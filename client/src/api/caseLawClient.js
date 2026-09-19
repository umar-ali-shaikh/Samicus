// Thin fetch wrapper for the server's Indian Kanoon proxy routes (server/src/routes/indianKanoon.js).
// This is the only part of the client that talks to the backend — every other screen in
// this app is static/mock-data by design; keep it that way outside this feature.

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

async function get(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

function toQueryString(params) {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") usp.set(key, value);
  }
  return usp.toString();
}

/**
 * @param {string} query
 * @param {{court?: string, fromDate?: string, toDate?: string, title?: string, cite?: string, author?: string, bench?: string}} [filters]
 * @param {number} [pagenum]
 */
export function searchCaseLaw(query, filters = {}, pagenum = 0) {
  const qs = toQueryString({ q: query, pagenum, ...filters });
  return get(`/case-law/search?${qs}`);
}

export function getCase(docid) {
  return get(`/case-law/${docid}`);
}

/**
 * AI-generated answer grounded in top Indian Kanoon search results for `query`.
 * @param {string} query
 * @param {{court?: string, fromDate?: string, toDate?: string, title?: string, cite?: string, author?: string, bench?: string}} [filters]
 */
export function getAiAnswer(query, filters = {}) {
  const qs = toQueryString({ q: query, ...filters });
  return get(`/case-law/ai-answer?${qs}`);
}
