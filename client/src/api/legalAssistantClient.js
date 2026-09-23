// Thin fetch wrapper for the server's conversational legal assistant route
// (server/src/routes/legalAssistant.js). See client/src/api/caseLawClient.js for the
// sibling case-law-search client this pipeline is built alongside.

// Same-origin "/api" in production builds (server serves the built client and the API
// from one process) — override with VITE_API_BASE_URL for a split deployment.
const BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? "http://localhost:4000/api" : "/api");

/**
 * Ask the AI legal assistant a question (any language/register — Hindi, Marathi, Urdu,
 * English, Hinglish, Marathlish). Runs the full RAG pipeline server-side: query
 * understanding -> Indian Kanoon search -> evidence extraction -> grounded, structured
 * answer.
 * @param {string} question
 * @param {{court?: string, fromDate?: string, toDate?: string, title?: string, cite?: string, author?: string, bench?: string}} [filters]
 * @param {string} [sessionId] - when provided, the server appends this turn to that
 *   session's persisted history (see getLegalAssistantSession).
 */
export async function askLegalAssistant(question, filters = {}, sessionId) {
  const res = await fetch(`${BASE_URL}/legal-assistant/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, ...filters, ...(sessionId ? { sessionId } : {}) }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

/**
 * Rehydrates a previously persisted conversation (e.g. after a page refresh).
 * @param {string} sessionId
 * @returns {Promise<{turns: Array<{question: string, result: object, createdAt?: string}>}>}
 */
export async function getLegalAssistantSession(sessionId) {
  const res = await fetch(`${BASE_URL}/legal-assistant/session/${encodeURIComponent(sessionId)}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}
