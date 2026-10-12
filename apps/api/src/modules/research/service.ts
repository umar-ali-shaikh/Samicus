/**
 * Business logic for the research-library domain. Ported from routes/research.js -- same
 * behaviour, including the dedupe-by-normalized-text "My Research" update-in-place, the
 * supersede chain on Refresh, and the outcome-sync-after-build fix. The retrieval/scoring/
 * generation pipeline itself stays in services/research.js and its own test suite; this layer
 * orchestrates it and persists the result, same precedent as modules/assistant/service.ts
 * calling services/legalAssistant.js.
 */
import { HttpError, assertAccountMember, defaultAccountId } from "../../services/access.js";
import {
  retrieve,
  answerFromRetrieval,
  generateResearchInsights,
  generateStructuredNote,
  researchNoteV2Enabled,
  relevanceThreshold,
  findRelatedCases,
  detectLanguage,
  answerFollowUp,
  caseMismatchNote,
} from "../../services/research.js";
import { renderResearchReportPdf } from "../../services/draftRender.js";
import { knowledgeBaseStats } from "../../services/rag/retrieve.js";
import type {
  AnswerResearchInput,
  AskResearchFollowUpInput,
  CorpusChunkDetailDto,
  PatchResearchQueryInput,
  ResearchQueryRowDto,
  ResearchReportDto,
  RetrieveResearchInput,
} from "@vidhira/contracts";
import * as repo from "./repository.js";

const MODEL_VERSION = "sentence-transformers/all-mpnet-base-v2+qdrant";
const TITLE_MAX = 80;

function deriveTitle(text: string): string {
  const t = text.trim();
  return t.length > TITLE_MAX ? `${t.slice(0, TITLE_MAX - 1)}…` : t;
}

// Same normalization the de-dupe migration backfilled existing rows with -- lowercase,
// trimmed, punctuation stripped -- so "Kesavananda Bharati v. State of Kerala?" and
// "kesavananda bharati v state of kerala" collapse onto the same "My Research" card.
function normalizeQueryText(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ");
}

/** Loads a research_queries row the caller may see, or throws a 404 (never a 403 -- ids aren't probeable). */
async function loadOwnedQuery(user: { id: string }, id: string): Promise<ResearchQueryRowDto> {
  const query = await repo.findQueryById(id);
  if (!query) throw new HttpError(404, "Unknown research query id.");
  try {
    await assertAccountMember(user.id, query.account_id);
  } catch {
    throw new HttpError(404, "Unknown research query id.");
  }
  return query;
}

// Seeded example reports (tags contains "example") have no owning account -- visible to every
// signed-in user as a cold-start showcase -- so they skip the normal account-membership check.
async function loadQueryForReport(user: { id: string }, id: string): Promise<ResearchQueryRowDto> {
  const query = await repo.findQueryById(id);
  if (!query) throw new HttpError(404, "Unknown research query id.");
  if ((query.tags || []).includes("example")) return query;
  try {
    await assertAccountMember(user.id, query.account_id);
  } catch {
    throw new HttpError(404, "Unknown research query id.");
  }
  return query;
}

interface BuildAnswerResult {
  outcome: "answered" | "partial" | "not_found";
  discardedCount: number;
  reason: string | null;
  topScore: number | null;
}

/**
 * Builds the answer (extractive segments + AI insights + related cases) for an already-scored
 * retrieval and persists it -- shared by the retrieve->answer flow and the refresh endpoint so
 * the two never drift out of sync.
 */
async function buildAndPersistAnswer(query: ResearchQueryRowDto, scored: repo.ScoredChunkRow[], locale: string): Promise<BuildAnswerResult> {
  if (scored.length === 0) return { outcome: "not_found", discardedCount: 0, reason: "corpus_gap", topScore: null };
  const result = await answerFromRetrieval(query.text, scored, { liveFetchIngestFailed: query.live_fetch_ingest_failed });
  if (result.outcome === "not_found") {
    return { outcome: "not_found", discardedCount: result.discardedCount, reason: result.reason, topScore: result.topScore };
  }

  const answer = await repo.insertAnswer(query.id, result.unsupportedSpanCount);
  await repo.insertAnswerSegments(
    answer.id,
    result.segments.map((s: { text: string; chunkId: string }, i: number) => ({ position: i, text: s.text, chunkId: s.chunkId }))
  );

  // Pure enhancements over the extractive segments above -- never required for the report to
  // be usable, so a failure in either just means the report shows passages without them.
  const [insights, relatedCaseIds, structuredNote] = await Promise.all([
    generateResearchInsights(query.text, result.segments, { language: locale }),
    findRelatedCases(
      result.segments[0],
      result.segments.map((s: { documentId?: string }) => s.documentId).filter(Boolean)
    ),
    researchNoteV2Enabled() ? generateStructuredNote(query.text, result.segments, { language: locale }) : Promise.resolve(null),
  ]);
  const caseCards: Record<string, unknown> = {};
  for (const seg of result.segments as Array<{ chunkId: string }>) {
    caseCards[seg.chunkId] = { ...(insights.caseCards[seg.chunkId] || {}), gloss: insights.glosses[seg.chunkId] || null };
  }
  // A case-name mismatch is safety-relevant, so it's a server-constructed prefix, never left
  // to the model's own summary to mention or omit.
  const mismatchNote = caseMismatchNote(query.text, result.segments);
  const summary = mismatchNote ? `${mismatchNote} ${insights.summary || ""}`.trim() : insights.summary;

  await repo.updateAnswer(answer.id, {
    summary,
    case_cards: caseCards,
    related_searches: insights.relatedSearches,
    related_case_ids: relatedCaseIds,
    sections: structuredNote?.sections || null,
    authorities: structuredNote?.authorities || null,
    position: structuredNote?.position || null,
    jurisdiction: structuredNote?.jurisdiction || null,
    law_as_on: await repo.overallLawAsOn(),
    note_schema_version: structuredNote ? "v2" : null,
  });

  return { outcome: result.outcome as BuildAnswerResult["outcome"], discardedCount: result.discardedCount, reason: result.reason, topScore: result.topScore };
}

// outcome is persisted onto research_queries right after it's actually known (build time), in
// every case (answered/partial/not_found) -- a query inserted as "answered" (from the raw
// retrieval score alone, before the paragraph-class/relevance gates run) that downgraded to
// "partial" during build must have research_queries.outcome corrected, or the My Research list
// / report read the stale value.
async function buildPersistAndSyncOutcome(query: ResearchQueryRowDto, scored: repo.ScoredChunkRow[], locale: string): Promise<void> {
  const { outcome, reason, topScore } = await buildAndPersistAnswer(query, scored, locale);
  await repo.syncQueryOutcome(query.id, outcome, outcome === "not_found" ? reason : null, topScore);
}

/** Loads a report in the exact shape the frontend expects, purely from already-persisted rows -- no regeneration. */
async function loadReport(queryId: string): Promise<ResearchReportDto | null> {
  const query = await repo.findQueryById(queryId);
  if (!query) return null;

  if (query.outcome === "not_found") {
    return { status: "done", query, outcome: "not_found", segments: [], aiSummary: null, relatedSearches: [], relatedCases: [], discardedCount: 0 } as ResearchReportDto;
  }

  const answer = await repo.findLatestAnswer(queryId);
  // The query row exists (retrieve() ran) but the answer build hasn't finished yet -- e.g. a
  // search still mid-flight from another tab. Let the client poll briefly instead of erroring.
  if (!answer) return { status: "processing", query } as ResearchReportDto;

  const [segmentRows, chunkScoreRows] = await Promise.all([repo.listAnswerSegmentsWithChunkAndDocument(answer.id), repo.listQueryChunkScores(queryId)]);
  const scoreByChunkId = new Map(chunkScoreRows.map((r) => [r.chunk_id, r.score]));

  const caseCardsByChunk = (answer.case_cards || {}) as Record<string, Record<string, unknown>>;
  const segments = segmentRows.map((row) => {
    const chunk = row.chunk as Record<string, unknown> | null;
    const doc = (chunk?.document as Record<string, unknown> | null) ?? null;
    const card = (chunk?.id ? caseCardsByChunk[chunk.id as string] : undefined) || {};
    return {
      chunkId: chunk?.id as string | undefined,
      documentId: doc?.id as string | undefined,
      text: row.text as string,
      score: chunk?.id ? scoreByChunkId.get(chunk.id as string) ?? null : null,
      documentTitle: doc?.title as string | undefined,
      citation: (doc?.citation as string | null) ?? null,
      court: (doc?.court as string | null) ?? null,
      source: doc?.source as string | undefined,
      url: (doc?.canonical_url as string | null) ?? null,
      paragraphClass: chunk?.paragraph_class as never,
      sectionLabel: (chunk?.section_label as string | null) ?? null,
      gloss: (card.gloss as string | null) ?? null,
      facts: (card.facts as string | null) ?? null,
      issues: (card.issues as string | null) ?? null,
      held: (card.held as string | null) ?? null,
      ratio: (card.ratio as string | null) ?? null,
      outcome: (card.outcome as string | undefined) ?? "not_stated",
      keyParagraph: (card.keyParagraph as string | null) ?? null,
    };
  });

  const relatedCases = await repo.listRelatedCases(answer.related_case_ids || []);

  return {
    status: "done",
    query,
    answer,
    outcome: query.outcome,
    threshold: query.threshold,
    segments,
    aiSummary: answer.summary,
    relatedSearches: answer.related_searches || [],
    relatedCases,
    discardedCount: 0,
    note:
      answer.note_schema_version === "v2"
        ? {
            sections: (answer.sections || []) as never,
            authorities: (answer.authorities || []) as never,
            position: answer.position || { label: null, note: "" },
            jurisdiction: answer.jurisdiction,
            lawAsOn: answer.law_as_on,
          }
        : null,
  } as unknown as ResearchReportDto;
}

export interface RetrieveResultShape {
  retrievalId: string;
  threshold: number;
  fetchedNewSources: boolean;
  chunks: Array<Record<string, unknown>>;
}

// Step 1: retrieve -- a separate callable step, so the client sees retrieval before any answer exists.
export async function retrieveStep(user: { id: string }, input: RetrieveResearchInput): Promise<RetrieveResultShape> {
  const accountId = input.accountId || (await defaultAccountId(user.id));
  if (!accountId) throw new HttpError(400, "accountId is required.");
  await assertAccountMember(user.id, accountId);

  const threshold = relevanceThreshold();
  const normalizedText = normalizeQueryText(input.text);
  const [{ fetchedNewSources, liveFetch, results: scored }, locale] = await Promise.all([
    retrieve(input.text, { sourcesEnabled: input.sourcesEnabled }),
    detectLanguage(input.text),
  ]);
  const outcome = scored.some((s: { score: number }) => s.score >= threshold) ? "answered" : "not_found";
  const liveFetchIngestFailed = liveFetch.ingestErrors > 0;

  // Re-running the exact same question (ignoring case/punctuation) updates the existing "My
  // Research" card in place -- new timestamp, a bumped re-run count -- instead of piling up
  // another copy of it.
  const existing = await repo.findActiveQueryByNormalizedText(accountId, normalizedText);

  let query: ResearchQueryRowDto;
  if (existing) {
    await repo.clearPriorAnswer(existing.id);
    query = await repo.updateQueryRetrieval(existing.id, {
      locale,
      sourcesEnabled: input.sourcesEnabled || [],
      threshold,
      modelVersion: MODEL_VERSION,
      outcome,
      topScore: scored[0]?.score ?? null,
      liveFetchIngestFailed,
      rerunCount: (existing.rerun_count || 1) + 1,
    });
  } else {
    query = await repo.insertQuery({
      accountId,
      text: input.text,
      normalizedText,
      title: deriveTitle(input.text),
      locale,
      sourcesEnabled: input.sourcesEnabled || [],
      threshold,
      modelVersion: MODEL_VERSION,
      outcome,
      topScore: scored[0]?.score ?? null,
      liveFetchIngestFailed,
    });
  }

  await repo.insertQueryChunks(query.id, scored);

  return {
    retrievalId: query.id,
    threshold,
    fetchedNewSources,
    chunks: scored.map((s: { score: number; chunk: Record<string, any> }) => ({
      chunkId: s.chunk.id,
      score: s.score,
      kept: s.score >= threshold,
      text: s.chunk.text,
      paragraphClass: s.chunk.paragraph_class,
      sectionLabel: s.chunk.section_label,
      documentTitle: s.chunk.document?.title,
      source: s.chunk.document?.source,
      url: s.chunk.document?.canonical_url,
    })),
  };
}

// Step 2: answer -- takes a retrieval id, NEVER a bare question.
export async function answerStep(user: { id: string }, input: AnswerResearchInput): Promise<ResearchReportDto> {
  const query = await loadOwnedQuery(user, input.retrievalId);
  const queryChunks = await repo.listQueryChunksWithChunkAndDocument(query.id);
  const scored = queryChunks.map((qc) => ({ chunk: qc.chunk, score: qc.score }));

  await buildPersistAndSyncOutcome(query, scored, query.locale);

  // Re-fetch the just-built report in its saved shape so this response and a later GET
  // .../report are byte-identical -- one code path for both.
  const report = await loadReport(query.id);
  if (!report) throw new HttpError(404, "Unknown research query id.");
  return report;
}

export async function getReport(user: { id: string }, id: string): Promise<ResearchReportDto> {
  await loadQueryForReport(user, id); // 404s on bad id / no access before touching anything else
  const report = await loadReport(id);
  if (!report) throw new HttpError(404, "Unknown research query id.");
  return report;
}

export interface ListQueriesParams {
  accountId?: string;
  examplesOnly: boolean;
  pinnedOnly: boolean;
  tag?: string;
  textSearch?: string;
}

// "My Research" -- past searches for one account, newest first (or seeded showcase reports
// when examplesOnly). caseCount/topCourt reflect the actual answer actually shown for this
// query -- NOT every candidate research_query_chunks happened to retrieve (that list includes
// below-threshold, uncitable passages kept around only so the UI can show what was dropped).
export async function listQueries(user: { id: string }, params: ListQueriesParams): Promise<Array<Record<string, unknown>>> {
  let accountId: string | null = null;
  if (!params.examplesOnly) {
    accountId = params.accountId || (await defaultAccountId(user.id));
    await assertAccountMember(user.id, accountId);
  }

  const queries = await repo.listQueries({ accountId, pinnedOnly: params.pinnedOnly, tag: params.examplesOnly ? "example" : params.tag, textSearch: params.textSearch });

  const answeredIds = queries.filter((r) => r.outcome !== "not_found").map((r) => r.id as string);
  const caseCount: Record<string, number> = {};
  const courtCounts: Record<string, Map<string, number>> = {};
  if (answeredIds.length > 0) {
    const answers = await repo.listAnswersForQueries(answeredIds);
    const latestAnswerIdByQuery = new Map<string, string>();
    for (const a of answers) if (!latestAnswerIdByQuery.has(a.query_id)) latestAnswerIdByQuery.set(a.query_id, a.id);
    const queryIdByAnswerId = new Map([...latestAnswerIdByQuery.entries()].map(([queryId, answerId]) => [answerId, queryId]));
    const answerIds = [...latestAnswerIdByQuery.values()];

    if (answerIds.length > 0) {
      const segRows = await repo.listSegmentsWithCourtForAnswers(answerIds);
      for (const row of segRows) {
        const queryId = queryIdByAnswerId.get(row.research_answer_id);
        if (!queryId) continue;
        caseCount[queryId] = (caseCount[queryId] || 0) + 1;
        const court = row.chunk?.document?.court || null;
        if (!court) continue;
        const counts = courtCounts[queryId] || (courtCounts[queryId] = new Map());
        counts.set(court, (counts.get(court) || 0) + 1);
      }
    }
  }

  // The court shown is the one most of the cited cases are actually from, not whichever chunk
  // happened to be retrieved/scored first.
  const topCourt: Record<string, string | null> = {};
  for (const [queryId, counts] of Object.entries(courtCounts)) {
    let best: string | null = null;
    let bestCount = 0;
    for (const [court, count] of counts) {
      if (count > bestCount) {
        best = court;
        bestCount = count;
      }
    }
    topCourt[queryId] = best;
  }

  return queries.map((r) => ({
    ...r,
    caseCount: r.outcome === "not_found" ? 0 : caseCount[r.id as string] || 0,
    topCourt: r.outcome === "not_found" ? null : topCourt[r.id as string] || null,
  }));
}

export async function patchQuery(user: { id: string }, id: string, input: PatchResearchQueryInput): Promise<ResearchQueryRowDto> {
  await loadOwnedQuery(user, id);
  const patch: { pinned_at?: string | null; tags?: string[] } = {};
  if (typeof input.pinned === "boolean") patch.pinned_at = input.pinned ? new Date().toISOString() : null;
  if (Array.isArray(input.tags)) patch.tags = input.tags.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim().slice(0, 40));
  return repo.patchQuery(id, patch);
}

export async function deleteQuery(user: { id: string }, id: string): Promise<void> {
  await loadOwnedQuery(user, id);
  const chainIds = await repo.collectSupersededChain(id);
  await repo.deleteQueryChain(chainIds);
}

export interface RefreshResult {
  searchId: string;
}

// Re-runs the same question through live retrieval, as a NEW query row -- the old one is kept
// (linked via superseded_by) so history never silently disappears.
export async function refreshQuery(user: { id: string }, id: string): Promise<RefreshResult> {
  const query = await loadOwnedQuery(user, id);
  const threshold = relevanceThreshold();
  const [{ liveFetch, results: scored }, locale] = await Promise.all([
    retrieve(query.text, { sourcesEnabled: query.sources_enabled }),
    detectLanguage(query.text),
  ]);

  const newQuery = await repo.insertQuery({
    accountId: query.account_id,
    text: query.text,
    normalizedText: query.normalized_text || normalizeQueryText(query.text),
    title: query.title || deriveTitle(query.text),
    locale,
    sourcesEnabled: query.sources_enabled,
    threshold,
    modelVersion: MODEL_VERSION,
    outcome: scored.some((s: { score: number }) => s.score >= threshold) ? "answered" : "not_found",
    topScore: scored[0]?.score ?? null,
    liveFetchIngestFailed: liveFetch.ingestErrors > 0,
    rerunCount: query.rerun_count || 1,
  });

  await repo.insertQueryChunks(newQuery.id, scored);
  await repo.supersede(query.id, newQuery.id);
  await buildPersistAndSyncOutcome(newQuery, scored, locale);
  return { searchId: newQuery.id };
}

// Follow-up chat scoped to ONE report's own evidence -- never a fresh retrieval.
export async function askFollowUp(user: { id: string }, id: string, input: AskResearchFollowUpInput): Promise<Record<string, unknown>> {
  const query = await loadOwnedQuery(user, id);
  const answer = await repo.findLatestAnswer(query.id);
  if (!answer) throw new HttpError(409, "This report has no answer yet to ask follow-ups about.");

  const [segmentRows, priorRows] = await Promise.all([repo.listAnswerSegmentsWithChunkAndDocument(answer.id), repo.listChatTurns(query.id)]);
  const segments = segmentRows.map((r) => ({
    chunkId: (r.chunk as Record<string, unknown> | null)?.id as string,
    text: r.text as string,
    documentTitle: ((r.chunk as Record<string, unknown> | null)?.document as Record<string, unknown> | null)?.title as string | undefined,
  }));
  const priorTurns = priorRows.map((r) => ({ question: r.question as string, answer: r.answer as { text: string | null } }));

  const result = await answerFollowUp(input.question, segments as Array<{ chunkId: string; text: string; documentTitle: string }>, { language: query.locale, priorTurns });
  const citations = (result.citedIndexes as number[]).map((i: number) => segments[i - 1]).filter(Boolean);
  return repo.insertChatTurn(query.id, input.question, { text: result.text, citations });
}

export async function getChatTurns(user: { id: string }, id: string): Promise<Array<Record<string, unknown>>> {
  await loadOwnedQuery(user, id);
  return repo.listChatTurns(id);
}

export async function exportPdf(user: { id: string }, id: string): Promise<{ pdf: Buffer; filename: string }> {
  const query = await loadOwnedQuery(user, id);
  const report = await loadReport(id);
  if (!report || report.status !== "done") throw new HttpError(409, "This report isn't ready yet.");

  const pdf = await renderResearchReportPdf({
    title: query.title || query.text,
    question: query.text,
    date: new Date(query.created_at).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" }),
    summary: report.aiSummary,
    cases: report.segments.map((s) => ({
      title: s.documentTitle,
      citation: s.citation,
      court: s.court,
      outcome: s.outcome,
      facts: s.facts,
      issues: s.issues,
      held: s.held,
      ratio: s.ratio,
      keyParagraph: s.keyParagraph,
      url: s.url,
    })) as Array<{ title: string; citation: string | null; court: string | null; outcome: string | null; facts: string | null; issues: string | null; held: string | null; ratio: string | null; keyParagraph: string | null; url: string | null }>,
    relatedSearches: report.relatedSearches,
    // Not in renderResearchReportPdf's JSDoc param type (a pre-existing gap in that function's
    // documentation -- it belongs to the not-yet-converted drafting/contract-review slice) but
    // the implementation does destructure and use it.
    note: report.note,
  } as Parameters<typeof renderResearchReportPdf>[0] & { note: typeof report.note });
  return { pdf, filename: `research-${query.id}.pdf` };
}

// ---- corpus browse (Research library's default, no-query view) ----

export const listCorpusDocuments = repo.listCorpusDocuments;

export async function getCorpusDocument(id: string): Promise<Record<string, unknown>> {
  const doc = await repo.findCorpusDocument(id);
  if (!doc) throw new HttpError(404, "Not found");
  return doc;
}

export const getCorpusDocumentChunks = repo.listCorpusChunksForDocument;

export async function getCorpusChunk(id: string): Promise<CorpusChunkDetailDto> {
  const chunk = await repo.findCorpusChunkWithContext(id);
  if (!chunk) throw new HttpError(404, "Not found");
  return chunk as unknown as CorpusChunkDetailDto;
}

export async function getCorpusStatus(): Promise<Record<string, unknown>> {
  const [bySource, chunkCount] = await Promise.all([repo.corpusDocumentStatsBySource(), repo.countCorpusChunks()]);
  const lawAsOn = (bySource || []).reduce<string | null>((latest, s) => (s.indexed_at && (!latest || s.indexed_at > latest) ? s.indexed_at : latest), null);
  let vectorIndex: Record<string, unknown>;
  try {
    vectorIndex = await knowledgeBaseStats();
  } catch (err) {
    vectorIndex = { enabled: true, error: err instanceof Error ? err.message : String(err) };
  }
  return { bySource, lawAsOn, chunkCount, vectorIndex, asOf: new Date().toISOString().slice(0, 10) };
}
