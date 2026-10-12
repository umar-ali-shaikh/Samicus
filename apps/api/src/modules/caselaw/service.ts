/**
 * Business logic for the case-law search domain. Ported from routes/indianKanoon.js -- same
 * behaviour, including the exact Indian-Kanoon-vs-OpenRouter error taxonomy (handleIkError/
 * handleAiError there), now mapped onto HttpError so the shared error middleware produces the
 * identical status + message. The actual Indian Kanoon client and AI-grounded-answer pipeline
 * stay in services/indianKanoon.js and services/aiCaseLawAnswer.js (and their own test suites);
 * this layer only adapts their errors and shapes the DTO.
 */
import { HttpError } from "../../services/access.js";
import {
  search,
  getDocument,
  getOriginalDocument,
  getFragment,
  getMetainfo,
  IndianKanoonAuthError,
  IndianKanoonApiError,
} from "../../services/indianKanoon.js";
import { answerCaseLawQuestion, OpenRouterAuthError, OpenRouterApiError } from "../../services/aiCaseLawAnswer.js";
import type { CaseLawFiltersInput } from "@vidhira/contracts";

function mapError(err: unknown): never {
  if (err instanceof IndianKanoonAuthError) {
    throw new HttpError(502, "Case law search is unavailable: invalid or missing API token.");
  }
  if (err instanceof IndianKanoonApiError) {
    const status = err.status >= 400 && err.status < 600 ? err.status : 502;
    throw new HttpError(status, err.message);
  }
  if (err instanceof OpenRouterAuthError) {
    throw new HttpError(502, "AI answer generation is unavailable: invalid or missing OpenRouter API key.");
  }
  if (err instanceof OpenRouterApiError) {
    const status = err.status >= 400 && err.status < 600 ? err.status : 502;
    throw new HttpError(status, err.message);
  }
  throw err;
}

async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    return mapError(err);
  }
}

export function searchCaseLaw(query: string, filters: CaseLawFiltersInput, pagenum: number, maxpages?: number) {
  return guarded(() => search(query, filters, pagenum, maxpages));
}

export function getCaseLawDocument(docid: string, maxcites?: number, maxcitedby?: number) {
  return guarded(() => getDocument(docid, maxcites, maxcitedby));
}

export function getOriginalCaseLawDocument(docid: string) {
  return guarded(() => getOriginalDocument(docid));
}

export function getCaseLawFragment(docid: string, query: string) {
  return guarded(() => getFragment(docid, query));
}

export function getCaseLawMeta(docid: string) {
  return guarded(() => getMetainfo(docid));
}

export function answerCaseLaw(query: string, filters: CaseLawFiltersInput, topN?: number) {
  return guarded(() => answerCaseLawQuestion(query, filters, topN));
}
