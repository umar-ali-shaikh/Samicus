/**
 * DB access for the research-library domain. Ported from routes/research.js's inline Supabase
 * calls -- same queries, same behaviour, including the supersede-chain walk and the
 * caseCount/topCourt aggregation for the "My Research" list. Row shapes mirror
 * apps/api/src/db/schema.sql's column lists (see packages/contracts/src/research.ts).
 */
import { getSupabase } from "../../config/db.js";
import type { ResearchAnswerRowDto, ResearchQueryRowDto } from "@vidhira/contracts";

export async function findActiveQueryByNormalizedText(accountId: string, normalizedText: string): Promise<ResearchQueryRowDto | null> {
  const { data, error } = await getSupabase()
    .from("research_queries")
    .select("*")
    .eq("account_id", accountId)
    .eq("normalized_text", normalizedText)
    .is("superseded_by", null)
    .maybeSingle();
  if (error) throw error;
  return data as ResearchQueryRowDto | null;
}

export async function findQueryById(id: string): Promise<ResearchQueryRowDto | null> {
  const { data, error } = await getSupabase().from("research_queries").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as ResearchQueryRowDto | null;
}

export interface NewQueryInput {
  accountId: string | null;
  text: string;
  normalizedText: string;
  title: string;
  locale: string;
  sourcesEnabled: string[];
  threshold: number;
  modelVersion: string;
  outcome: "answered" | "not_found";
  topScore: number | null;
  liveFetchIngestFailed: boolean;
  rerunCount?: number;
}

export async function insertQuery(input: NewQueryInput): Promise<ResearchQueryRowDto> {
  const { data, error } = await getSupabase()
    .from("research_queries")
    .insert({
      account_id: input.accountId,
      text: input.text,
      normalized_text: input.normalizedText,
      title: input.title,
      locale: input.locale,
      sources_enabled: input.sourcesEnabled,
      threshold: input.threshold,
      model_version: input.modelVersion,
      outcome: input.outcome,
      top_score: input.topScore,
      live_fetch_ingest_failed: input.liveFetchIngestFailed,
      ...(input.rerunCount !== undefined ? { rerun_count: input.rerunCount } : {}),
    })
    .select()
    .single();
  if (error) throw error;
  return data as ResearchQueryRowDto;
}

export async function updateQueryRetrieval(
  id: string,
  patch: { locale: string; sourcesEnabled: string[]; threshold: number; modelVersion: string; outcome: "answered" | "not_found"; topScore: number | null; liveFetchIngestFailed: boolean; rerunCount: number }
): Promise<ResearchQueryRowDto> {
  const { data, error } = await getSupabase()
    .from("research_queries")
    .update({
      locale: patch.locale,
      sources_enabled: patch.sourcesEnabled,
      threshold: patch.threshold,
      model_version: patch.modelVersion,
      outcome: patch.outcome,
      top_score: patch.topScore,
      live_fetch_ingest_failed: patch.liveFetchIngestFailed,
      rerun_count: patch.rerunCount,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as ResearchQueryRowDto;
}

export async function syncQueryOutcome(id: string, outcome: "answered" | "partial" | "not_found", notFoundReason: string | null, topScore: number | null): Promise<void> {
  const { error } = await getSupabase().from("research_queries").update({ outcome, not_found_reason: notFoundReason, top_score: topScore }).eq("id", id);
  if (error) throw error;
}

export async function patchQuery(id: string, patch: { pinned_at?: string | null; tags?: string[] }): Promise<ResearchQueryRowDto> {
  const { data, error } = await getSupabase().from("research_queries").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data as ResearchQueryRowDto;
}

export async function supersede(oldId: string, newId: string): Promise<void> {
  const { error } = await getSupabase().from("research_queries").update({ superseded_by: newId }).eq("id", oldId);
  if (error) throw error;
}

export interface ScoredChunkRow {
  chunk: object;
  score: number;
}

export async function insertQueryChunks(queryId: string, scored: ScoredChunkRow[]): Promise<void> {
  if (scored.length === 0) return;
  const { error } = await getSupabase()
    .from("research_query_chunks")
    .insert(scored.map((s, i) => ({ query_id: queryId, chunk_id: (s.chunk as { id: string }).id, score: s.score, position: i })));
  if (error) throw error;
}

export async function listQueryChunksWithChunkAndDocument(queryId: string): Promise<Array<{ score: number; position: number; chunk: Record<string, unknown> }>> {
  const { data, error } = await getSupabase()
    .from("research_query_chunks")
    .select("score, position, chunk:corpus_chunks(*, document:corpus_documents(*))")
    .eq("query_id", queryId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Array<{ score: number; position: number; chunk: Record<string, unknown> }>;
}

export async function listQueryChunkScores(queryId: string): Promise<Array<{ chunk_id: string; score: number }>> {
  const { data, error } = await getSupabase().from("research_query_chunks").select("chunk_id, score").eq("query_id", queryId);
  if (error) throw error;
  return (data ?? []) as Array<{ chunk_id: string; score: number }>;
}

export async function clearPriorAnswer(queryId: string): Promise<void> {
  const supabase = getSupabase();
  const { error: chunksError } = await supabase.from("research_query_chunks").delete().eq("query_id", queryId);
  if (chunksError) throw chunksError;
  const { data: oldAnswers, error: oldAnswersError } = await supabase.from("research_answers").select("id").eq("query_id", queryId);
  if (oldAnswersError) throw oldAnswersError;
  const oldAnswerIds = (oldAnswers || []).map((a: { id: string }) => a.id);
  if (oldAnswerIds.length > 0) {
    const { error: segError } = await supabase.from("research_answer_segments").delete().in("research_answer_id", oldAnswerIds);
    if (segError) throw segError;
    const { error: ansError } = await supabase.from("research_answers").delete().in("id", oldAnswerIds);
    if (ansError) throw ansError;
  }
}

export async function insertAnswer(queryId: string, unsupportedSpanCount: number): Promise<{ id: string }> {
  const { data, error } = await getSupabase().from("research_answers").insert({ query_id: queryId, unsupported_span_count: unsupportedSpanCount }).select().single();
  if (error) throw error;
  return data as { id: string };
}

export async function insertAnswerSegments(answerId: string, segments: Array<{ position: number; text: string; chunkId: string }>): Promise<void> {
  const { error } = await getSupabase()
    .from("research_answer_segments")
    .insert(segments.map((s) => ({ research_answer_id: answerId, position: s.position, text: s.text, chunk_id: s.chunkId })));
  if (error) throw error;
}

export interface AnswerUpdatePatch {
  summary: string | null;
  case_cards: Record<string, unknown>;
  related_searches: string[];
  related_case_ids: string[];
  sections: unknown[] | null;
  authorities: unknown[] | null;
  position: { label: string | null; note: string } | null;
  jurisdiction: string | null;
  law_as_on: string | null;
  note_schema_version: string | null;
}

export async function updateAnswer(answerId: string, patch: AnswerUpdatePatch): Promise<void> {
  const { error } = await getSupabase().from("research_answers").update(patch).eq("id", answerId);
  if (error) throw error;
}

export async function findLatestAnswer(queryId: string): Promise<ResearchAnswerRowDto | null> {
  const { data, error } = await getSupabase().from("research_answers").select("*").eq("query_id", queryId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data as ResearchAnswerRowDto | null;
}

export async function listAnswerSegmentsWithChunkAndDocument(answerId: string): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await getSupabase()
    .from("research_answer_segments")
    .select("position, text, chunk:corpus_chunks(id, paragraph_class, section_label, document:corpus_documents(id, title, citation, court, source, canonical_url))")
    .eq("research_answer_id", answerId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Array<Record<string, unknown>>;
}

export async function listRelatedCases(ids: string[]): Promise<Array<Record<string, unknown>>> {
  if (ids.length === 0) return [];
  const { data, error } = await getSupabase().from("corpus_documents").select("id, title, citation, court, source, canonical_url").in("id", ids);
  if (error) throw error;
  return (data ?? []) as Array<Record<string, unknown>>;
}

export async function overallLawAsOn(): Promise<string | null> {
  const { data, error } = await getSupabase().from("corpus_documents").select("indexed_at").order("indexed_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return (data as { indexed_at: string } | null)?.indexed_at ?? null;
}

export interface ListQueriesFilters {
  accountId: string | null;
  pinnedOnly: boolean;
  tag?: string;
  textSearch?: string;
}

export async function listQueries(filters: ListQueriesFilters): Promise<Array<Record<string, unknown>>> {
  let q = getSupabase()
    .from("research_queries")
    .select("id, title, text, outcome, not_found_reason, top_score, pinned_at, tags, locale, created_at, updated_at, rerun_count")
    .is("superseded_by", null)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (filters.accountId) q = q.eq("account_id", filters.accountId);
  if (filters.pinnedOnly) q = q.not("pinned_at", "is", null);
  if (filters.tag) q = q.contains("tags", [filters.tag]);
  if (filters.textSearch) q = q.ilike("text", `%${filters.textSearch}%`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Array<Record<string, unknown>>;
}

export async function listAnswersForQueries(queryIds: string[]): Promise<Array<{ id: string; query_id: string; created_at: string }>> {
  if (queryIds.length === 0) return [];
  const { data, error } = await getSupabase().from("research_answers").select("id, query_id, created_at").in("query_id", queryIds).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; query_id: string; created_at: string }>;
}

export async function listSegmentsWithCourtForAnswers(answerIds: string[]): Promise<Array<{ research_answer_id: string; chunk: { document: { court: string | null } | null } | null }>> {
  if (answerIds.length === 0) return [];
  const { data, error } = await getSupabase()
    .from("research_answer_segments")
    .select("research_answer_id, chunk:corpus_chunks(document:corpus_documents(court))")
    .in("research_answer_id", answerIds);
  if (error) throw error;
  return (data ?? []) as unknown as Array<{ research_answer_id: string; chunk: { document: { court: string | null } | null } | null }>;
}

/**
 * Walks research_queries.superseded_by BACKWARD from `headId` and returns every id in the
 * chain including headId itself -- see routes/research.js's original doc comment for why
 * deleting just headId alone would 500 with a foreign-key violation once any history exists.
 */
export async function collectSupersededChain(headId: string): Promise<string[]> {
  const ids = new Set([headId]);
  let frontier = [headId];
  while (frontier.length > 0) {
    const { data, error } = await getSupabase().from("research_queries").select("id").in("superseded_by", frontier);
    if (error) throw error;
    frontier = (data || []).map((r: { id: string }) => r.id).filter((id: string) => !ids.has(id));
    for (const id of frontier) ids.add(id);
  }
  return [...ids];
}

export async function deleteQueryChain(chainIds: string[]): Promise<void> {
  const supabase = getSupabase();
  const { data: answers, error: answersError } = await supabase.from("research_answers").select("id").in("query_id", chainIds);
  if (answersError) throw answersError;
  const answerIds = (answers || []).map((a: { id: string }) => a.id);
  if (answerIds.length > 0) {
    const { error: segError } = await supabase.from("research_answer_segments").delete().in("research_answer_id", answerIds);
    if (segError) throw segError;
    const { error: ansError } = await supabase.from("research_answers").delete().in("id", answerIds);
    if (ansError) throw ansError;
  }
  const { error: chatError } = await supabase.from("research_chat_turns").delete().in("research_query_id", chainIds);
  if (chatError) throw chatError;
  const { error: chunksError } = await supabase.from("research_query_chunks").delete().in("query_id", chainIds);
  if (chunksError) throw chunksError;
  const { error: deleteError } = await supabase.from("research_queries").delete().in("id", chainIds);
  if (deleteError) throw deleteError;
}

export async function insertChatTurn(queryId: string, question: string, answer: { text: string | null; citations: unknown[] }): Promise<Record<string, unknown>> {
  const { data, error } = await getSupabase().from("research_chat_turns").insert({ research_query_id: queryId, question, answer }).select().single();
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function listChatTurns(queryId: string): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await getSupabase().from("research_chat_turns").select("*").eq("research_query_id", queryId).order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Array<Record<string, unknown>>;
}

export async function listCorpusDocuments(): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await getSupabase()
    .from("corpus_documents")
    .select("id, title, source, citation, court, canonical_url, indexed_at")
    .order("indexed_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as Array<Record<string, unknown>>;
}

export async function findCorpusDocument(id: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await getSupabase().from("corpus_documents").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Record<string, unknown> | null;
}

export async function listCorpusChunksForDocument(documentId: string): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await getSupabase()
    .from("corpus_chunks")
    .select("id, ordinal, text, paragraph_class, para_number")
    .eq("document_id", documentId)
    .order("ordinal", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Array<Record<string, unknown>>;
}

const CONTEXT_WINDOW = 2;

export async function findCorpusChunkWithContext(id: string): Promise<Record<string, unknown> | null> {
  const supabase = getSupabase();
  const { data: chunk, error } = await supabase.from("corpus_chunks").select("*, document:corpus_documents(*)").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!chunk) return null;

  const { data: context, error: contextError } = await supabase
    .from("corpus_chunks")
    .select("id, ordinal, text, paragraph_class, para_number")
    .eq("document_id", (chunk as { document_id: string }).document_id)
    .gte("ordinal", (chunk as { ordinal: number }).ordinal - CONTEXT_WINDOW)
    .lte("ordinal", (chunk as { ordinal: number }).ordinal + CONTEXT_WINDOW)
    .order("ordinal", { ascending: true });
  if (contextError) throw contextError;

  return { ...(chunk as Record<string, unknown>), context: context ?? [] };
}

export async function corpusDocumentStatsBySource(): Promise<Array<{ source: string; count: number; indexed_at: string | null }>> {
  const { data, error } = await getSupabase().rpc("corpus_document_stats_by_source");
  if (error) throw error;
  return (data ?? []) as Array<{ source: string; count: number; indexed_at: string | null }>;
}

export async function countCorpusChunks(): Promise<number> {
  const { count, error } = await getSupabase().from("corpus_chunks").select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}
