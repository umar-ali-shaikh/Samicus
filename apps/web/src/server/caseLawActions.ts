"use server";

import { apiClient, ApiError } from "./apiClient";
import type { CaseLawAiAnswerDto, CaseLawDocumentDto, CaseLawSearchResultDto } from "@vidhira/contracts";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

// The web UI only ever offers a single-select court filter -- narrower than the full
// CaseLawFiltersInput contract (which also allows an array, for callers that fan out multiple
// doctypes server-side).
export interface CaseLawWebFilters {
  court?: string;
  fromDate?: string;
  toDate?: string;
}

async function wrap<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function searchCaseLawAction(
  q: string,
  filters: CaseLawWebFilters,
  pagenum: number
): Promise<ActionResult<CaseLawSearchResultDto>> {
  return wrap(() => apiClient.get<CaseLawSearchResultDto>("/case-law/search", { q, pagenum, ...filters }));
}

export async function getCaseLawAiAnswerAction(q: string, filters: CaseLawWebFilters): Promise<ActionResult<CaseLawAiAnswerDto>> {
  return wrap(() => apiClient.get<CaseLawAiAnswerDto>("/case-law/ai-answer", { q, ...filters }));
}

export async function getCaseLawDocumentAction(docid: string): Promise<ActionResult<CaseLawDocumentDto>> {
  return wrap(() => apiClient.get<CaseLawDocumentDto>(`/case-law/${docid}`));
}
