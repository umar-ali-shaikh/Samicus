/**
 * Case law search domain contracts. Ported from apps/api/src/routes/indianKanoon.js's query
 * validation and apps/api/src/services/indianKanoon.js / aiCaseLawAnswer.js's response shapes.
 * All five endpoints are GET with query-string input, so there is no request body schema here
 * -- just the filter shape shared by every one of them.
 */
import { z } from "zod";

export const caseLawFiltersSchema = z.object({
  court: z.union([z.string(), z.array(z.string())]).optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  title: z.string().optional(),
  cite: z.string().optional(),
  author: z.string().optional(),
  bench: z.string().optional(),
});
export type CaseLawFiltersInput = z.infer<typeof caseLawFiltersSchema>;

export const caseLawSearchQuerySchema = caseLawFiltersSchema.extend({
  q: z.string().trim().min(1, "Query parameter 'q' is required."),
  pagenum: z.union([z.string(), z.number()]).optional(),
  maxpages: z.union([z.string(), z.number()]).optional(),
});
export type CaseLawSearchQueryInput = z.infer<typeof caseLawSearchQuerySchema>;

const caseLawDocSummaryDto = z
  .object({ tid: z.number(), title: z.string(), headline: z.string(), docsource: z.string(), docsize: z.number().optional() })
  .strict();

export const caseLawSearchResultDto = z
  .object({ found: z.number(), docs: z.array(caseLawDocSummaryDto), categories: z.array(z.unknown()) })
  .strict();
export type CaseLawSearchResultDto = z.infer<typeof caseLawSearchResultDto>;

// getDocument()/getOriginalDocument() -- Indian Kanoon's own shape, sanitized server-side
// before it ever reaches the client (sanitizeJudgmentHtml). Not .strict(): Indian Kanoon's
// documented response carries other fields (numcites, numcitedby, publishdate, ...) this app
// never reads but must not have stripped by a too-narrow contract.
export const caseLawDocumentDto = z.object({
  tid: z.number().optional(),
  doc: z.string(),
  title: z.string(),
  citeList: z.array(z.unknown()).optional(),
  citedbyList: z.array(z.unknown()).optional(),
});
export type CaseLawDocumentDto = z.infer<typeof caseLawDocumentDto>;

export const caseLawFragmentDto = z.object({
  headline: z.string().optional(),
  headlines: z.array(z.string()).optional(),
});
export type CaseLawFragmentDto = z.infer<typeof caseLawFragmentDto>;

// docmeta -- metadata-only, no judgment text. Indian Kanoon's own shape, passed through as-is.
export const caseLawMetaDto = z.record(z.string(), z.unknown());

const caseLawAiSourceDto = z.object({ tid: z.number(), title: z.string(), docsource: z.string() }).strict();

export const caseLawAiAnswerDto = z
  .object({
    outcome: z.enum(["answered", "not_found"]),
    answer: z.string(),
    sources: z.array(caseLawAiSourceDto),
  })
  .strict();
export type CaseLawAiAnswerDto = z.infer<typeof caseLawAiAnswerDto>;
