// Thin fetch wrapper for the server's conversational legal assistant route
// (backend/src/routes/legalAssistant.js). See frontend/src/api/caseLawClient.js for the
// sibling case-law-search client this pipeline is built alongside.

import { api } from "../lib/api";

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
export function askLegalAssistant(question, filters = {}, sessionId) {
  return api.post("/legal-assistant/ask", { question, ...filters, ...(sessionId ? { sessionId } : {}) });
}

/**
 * Rehydrates a previously persisted conversation (e.g. after a page refresh).
 * @param {string} sessionId
 * @returns {Promise<{turns: Array<{question: string, result: object, createdAt?: string}>}>}
 */
export function getLegalAssistantSession(sessionId) {
  return api.get(`/legal-assistant/session/${encodeURIComponent(sessionId)}`);
}
