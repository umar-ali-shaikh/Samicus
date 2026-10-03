// Case-law proxy routes (backend/src/routes/indianKanoon.js). Sign-in required — every call
// there costs real money — so these go through the authenticated API client.
import { api } from "../lib/api";

/**
 * @param {string} query
 * @param {{court?: string, fromDate?: string, toDate?: string, title?: string, cite?: string, author?: string, bench?: string}} [filters]
 * @param {number} [pagenum]
 */
export function searchCaseLaw(query, filters = {}, pagenum = 0) {
  return api.get("/case-law/search", { q: query, pagenum, ...filters });
}

export function getCase(docid) {
  return api.get(`/case-law/${docid}`);
}

/** AI-generated answer grounded in top Indian Kanoon search results for `query`. */
export function getAiAnswer(query, filters = {}) {
  return api.get("/case-law/ai-answer", { q: query, ...filters });
}
