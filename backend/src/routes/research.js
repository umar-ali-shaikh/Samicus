import { Router } from "express";
import { getSupabase } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
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
} from "../services/research.js";
import { renderResearchReportPdf } from "../services/draftRender.js";
import { assertAccountMember, defaultAccountId, HttpError } from "../services/access.js";
import { knowledgeBaseStats } from "../services/rag/retrieve.js";

const router = Router();

const MODEL_VERSION = "sentence-transformers/all-mpnet-base-v2+qdrant";
const TITLE_MAX = 80;
function deriveTitle(text) {
  const t = text.trim();
  return t.length > TITLE_MAX ? `${t.slice(0, TITLE_MAX - 1)}…` : t;
}

// Same normalization the de-dupe migration backfilled existing rows with — lowercase,
// trimmed, punctuation stripped — so "Kesavananda Bharati v. State of Kerala?" and
// "kesavananda bharati v state of kerala" collapse onto the same "My Research" card.
function normalizeQueryText(text) {
  return text.trim().toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ");
}

/** Deletes a query's old retrieval/answer rows so a re-run can rebuild them in place. */
async function clearPriorAnswer(supabase, queryId) {
  const { error: chunksError } = await supabase.from("research_query_chunks").delete().eq("query_id", queryId);
  if (chunksError) throw chunksError;
  const { data: oldAnswers, error: oldAnswersError } = await supabase.from("research_answers").select("id").eq("query_id", queryId);
  if (oldAnswersError) throw oldAnswersError;
  const oldAnswerIds = (oldAnswers || []).map((a) => a.id);
  if (oldAnswerIds.length > 0) {
    const { error: segError } = await supabase.from("research_answer_segments").delete().in("research_answer_id", oldAnswerIds);
    if (segError) throw segError;
    const { error: ansError } = await supabase.from("research_answers").delete().in("id", oldAnswerIds);
    if (ansError) throw ansError;
  }
}

/** Loads a research_queries row the caller may see, or throws a 404 (never a 403 — ids aren't probeable). */
async function loadOwnedQuery(req, id) {
  const { data: query, error } = await getSupabase().from("research_queries").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!query) throw new HttpError(404, "Unknown research query id.");
  await assertAccountMember(req.user.id, query.account_id).catch(() => {
    throw new HttpError(404, "Unknown research query id.");
  });
  return query;
}

/**
 * Builds the answer (extractive segments + AI insights + related cases) for an already-scored
 * retrieval and persists it — shared by POST /research/answer and the refresh endpoint so the
 * two never drift out of sync.
 * @returns {Promise<{outcome: string, discardedCount: number, reason: string|null, topScore: number|null}>}
 */
async function buildAndPersistAnswer(supabase, query, scored, locale) {
  if (scored.length === 0) return { outcome: "not_found", discardedCount: 0, reason: "corpus_gap", topScore: null };
  const result = await answerFromRetrieval(query.text, scored, { liveFetchIngestFailed: query.live_fetch_ingest_failed });
  if (result.outcome === "not_found") return { outcome: "not_found", discardedCount: result.discardedCount, reason: result.reason, topScore: result.topScore };

  const { data: answer, error: answerError } = await supabase
    .from("research_answers")
    .insert({ query_id: query.id, unsupported_span_count: result.unsupportedSpanCount })
    .select()
    .single();
  if (answerError) throw answerError;

  const { error: segmentsError } = await supabase
    .from("research_answer_segments")
    .insert(result.segments.map((s, i) => ({ research_answer_id: answer.id, position: i, text: s.text, chunk_id: s.chunkId })));
  if (segmentsError) throw segmentsError;

  // Pure enhancements over the extractive segments above — never required for the report to
  // be usable, so a failure in either just means the report shows passages without them.
  const [insights, relatedCaseIds, structuredNote] = await Promise.all([
    generateResearchInsights(query.text, result.segments, { language: locale }),
    findRelatedCases(
      result.segments[0],
      result.segments.map((s) => s.documentId).filter(Boolean)
    ),
    researchNoteV2Enabled() ? generateStructuredNote(query.text, result.segments, { language: locale }) : Promise.resolve(null),
  ]);
  const caseCards = {};
  for (const seg of result.segments) {
    caseCards[seg.chunkId] = { ...(insights.caseCards[seg.chunkId] || {}), gloss: insights.glosses[seg.chunkId] || null };
  }
  // A case-name mismatch is safety-relevant (telling the user their answer is grounded in a
  // DIFFERENT case than the one they asked about), so it's a server-constructed prefix,
  // never left to the model's own summary to mention or omit.
  const mismatchNote = caseMismatchNote(query.text, result.segments);
  const summary = mismatchNote ? `${mismatchNote} ${insights.summary || ""}`.trim() : insights.summary;
  const { error: updateError } = await supabase
    .from("research_answers")
    .update({
      summary,
      case_cards: caseCards,
      related_searches: insights.relatedSearches,
      related_case_ids: relatedCaseIds,
      sections: structuredNote?.sections || null,
      authorities: structuredNote?.authorities || null,
      position: structuredNote?.position || null,
      jurisdiction: structuredNote?.jurisdiction || null,
      law_as_on: await overallLawAsOn(supabase),
      note_schema_version: structuredNote ? "v2" : null,
    })
    .eq("id", answer.id);
  if (updateError) throw updateError;

  return { outcome: result.outcome, discardedCount: result.discardedCount, reason: result.reason, topScore: result.topScore };
}

/** Overall "law as on" date shown in the Research page chip — the most recent indexed_at across the whole corpus. */
async function overallLawAsOn(supabase) {
  const { data, error } = await supabase.from("corpus_documents").select("indexed_at").order("indexed_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data?.indexed_at || null;
}

// outcome is persisted onto research_queries right after it's actually known (build time),
// in every case (answered/partial/not_found) — previously only the not_found case patched
// it back, so a query inserted as "answered" (from the raw retrieval score alone, before the
// paragraph-class/relevance gates run) that downgraded to "partial" during build never had
// research_queries.outcome corrected, and the My Research list / report read the stale value.
async function buildPersistAndSyncOutcome(supabase, query, scored, locale) {
  const { outcome, discardedCount, reason, topScore } = await buildAndPersistAnswer(supabase, query, scored, locale);
  const { error: updateError } = await supabase
    .from("research_queries")
    .update({ outcome, not_found_reason: outcome === "not_found" ? reason : null, top_score: topScore })
    .eq("id", query.id);
  if (updateError) throw updateError;
  return { outcome, discardedCount };
}

// Step 1: retrieve — a separate callable step, so the client sees retrieval before any answer exists.
router.post("/research/retrieve", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const { text, sourcesEnabled } = req.body || {};
  if (typeof text !== "string" || text.trim().length < 5 || text.length > 1000) throw new HttpError(400, "Enter a question of 5–1,000 characters.");
  const accountId = req.body.accountId || (await defaultAccountId(req.user.id));
  await assertAccountMember(req.user.id, accountId);
  const threshold = relevanceThreshold();
  const normalizedText = normalizeQueryText(text);
  const [{ fetchedNewSources, liveFetch, results: scored }, locale] = await Promise.all([retrieve(text, { sourcesEnabled }), detectLanguage(text)]);
  const outcome = scored.some((s) => s.score >= threshold) ? "answered" : "not_found";
  const liveFetchIngestFailed = liveFetch.ingestErrors > 0;

  // Re-running the exact same question (ignoring case/punctuation) updates the existing
  // "My Research" card in place — new timestamp, a bumped re-run count — instead of piling
  // up another copy of it.
  const { data: existing, error: existingError } = await supabase
    .from("research_queries")
    .select("*")
    .eq("account_id", accountId)
    .eq("normalized_text", normalizedText)
    .is("superseded_by", null)
    .maybeSingle();
  if (existingError) throw existingError;

  let query;
  if (existing) {
    await clearPriorAnswer(supabase, existing.id);
    const { data: updated, error: updateError } = await supabase
      .from("research_queries")
      .update({
        locale,
        sources_enabled: sourcesEnabled || [],
        threshold,
        model_version: MODEL_VERSION,
        outcome,
        top_score: scored[0]?.score ?? null,
        live_fetch_ingest_failed: liveFetchIngestFailed,
        rerun_count: (existing.rerun_count || 1) + 1,
      })
      .eq("id", existing.id)
      .select()
      .single();
    if (updateError) throw updateError;
    query = updated;
  } else {
    const { data: inserted, error } = await supabase
      .from("research_queries")
      .insert({
        account_id: accountId,
        text,
        normalized_text: normalizedText,
        title: deriveTitle(text),
        locale,
        sources_enabled: sourcesEnabled || [],
        threshold,
        model_version: MODEL_VERSION,
        outcome,
        top_score: scored[0]?.score ?? null,
        live_fetch_ingest_failed: liveFetchIngestFailed,
      })
      .select()
      .single();
    if (error) throw error;
    query = inserted;
  }

  if (scored.length > 0) {
    const { error: chunksError } = await supabase
      .from("research_query_chunks")
      .insert(scored.map((s, i) => ({ query_id: query.id, chunk_id: s.chunk.id, score: s.score, position: i })));
    if (chunksError) throw chunksError;
  }

  res.json({
    retrievalId: query.id,
    threshold,
    fetchedNewSources,
    chunks: scored.map((s) => ({
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
  });
});

// Step 2: answer — takes a retrieval id, NEVER a bare question.
router.post("/research/answer", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const { retrievalId } = req.body || {};
  const query = await loadOwnedQuery(req, retrievalId);

  const { data: queryChunks, error: chunksError } = await supabase
    .from("research_query_chunks")
    .select("score, position, chunk:corpus_chunks(*, document:corpus_documents(*))")
    .eq("query_id", query.id)
    .order("position", { ascending: true });
  if (chunksError) throw chunksError;
  const scored = queryChunks.map((qc) => ({ chunk: qc.chunk, score: qc.score }));

  await buildPersistAndSyncOutcome(supabase, query, scored, query.locale);

  // Re-fetch the just-built report in its saved shape so this response and a later
  // GET /research/queries/:id/report are byte-identical — one code path for both.
  res.json(await loadReport(supabase, query.id));
});

/** Loads a report in the exact shape the frontend expects, purely from already-persisted rows — no regeneration. */
async function loadReport(supabase, queryId) {
  const { data: query, error } = await supabase.from("research_queries").select("*").eq("id", queryId).maybeSingle();
  if (error) throw error;
  if (!query) return null;

  if (query.outcome === "not_found") {
    return { status: "done", query, outcome: "not_found", segments: [], aiSummary: null, relatedSearches: [], relatedCases: [], discardedCount: 0 };
  }

  const { data: answer, error: answerError } = await supabase
    .from("research_answers")
    .select("*")
    .eq("query_id", queryId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (answerError) throw answerError;
  // The query row exists (retrieve() ran) but /answer hasn't finished yet — e.g. a search
  // still mid-flight from another tab. Let the client poll briefly instead of erroring.
  if (!answer) return { status: "processing", query };

  const [{ data: segmentRows, error: segmentsError }, { data: chunkScoreRows, error: chunkScoreError }] = await Promise.all([
    supabase
      .from("research_answer_segments")
      .select("position, text, chunk:corpus_chunks(id, paragraph_class, section_label, document:corpus_documents(id, title, citation, court, source, canonical_url))")
      .eq("research_answer_id", answer.id)
      .order("position", { ascending: true }),
    supabase.from("research_query_chunks").select("chunk_id, score").eq("query_id", queryId),
  ]);
  if (segmentsError) throw segmentsError;
  if (chunkScoreError) throw chunkScoreError;
  const scoreByChunkId = new Map((chunkScoreRows || []).map((r) => [r.chunk_id, r.score]));

  const caseCardsByChunk = answer.case_cards || {};
  const segments = segmentRows.map((row) => {
    const chunk = row.chunk;
    const doc = chunk?.document;
    const card = caseCardsByChunk[chunk?.id] || {};
    return {
      chunkId: chunk?.id,
      documentId: doc?.id,
      text: row.text,
      score: scoreByChunkId.get(chunk?.id) ?? null,
      documentTitle: doc?.title,
      citation: doc?.citation,
      court: doc?.court,
      source: doc?.source,
      url: doc?.canonical_url,
      paragraphClass: chunk?.paragraph_class,
      sectionLabel: chunk?.section_label,
      gloss: card.gloss || null,
      facts: card.facts || null,
      issues: card.issues || null,
      held: card.held || null,
      ratio: card.ratio || null,
      outcome: card.outcome || "not_stated",
      keyParagraph: card.keyParagraph || null,
    };
  });

  let relatedCases = [];
  if ((answer.related_case_ids || []).length > 0) {
    const { data: relatedDocs, error: relatedError } = await supabase
      .from("corpus_documents")
      .select("id, title, citation, court, source, canonical_url")
      .in("id", answer.related_case_ids);
    if (relatedError) throw relatedError;
    relatedCases = relatedDocs;
  }

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
    // Samicus Research "Step 2" structured note — null on rows built before RESEARCH_NOTE_V2
    // or when generation failed; the frontend falls back to aiSummary/segments in that case.
    note:
      answer.note_schema_version === "v2"
        ? {
            sections: answer.sections || [],
            authorities: answer.authorities || [],
            position: answer.position || { label: null, note: "" },
            jurisdiction: answer.jurisdiction,
            lawAsOn: answer.law_as_on,
          }
        : null,
  };
}

// Seeded example reports (tags contains "example") have no owning account — they're meant
// to be visible to every signed-in user as a cold-start showcase — so they skip the normal
// account-membership check. Anything else still goes through loadOwnedQuery's real check.
async function loadQueryForReport(req, id) {
  const { data: query, error } = await getSupabase().from("research_queries").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!query) throw new HttpError(404, "Unknown research query id.");
  if ((query.tags || []).includes("example")) return query;
  await assertAccountMember(req.user.id, query.account_id).catch(() => {
    throw new HttpError(404, "Unknown research query id.");
  });
  return query;
}

// The critical "instant reopen" endpoint — clicking a past search must load the FULL saved
// report from here, never replay /retrieve + /answer.
router.get("/research/queries/:id/report", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  await loadQueryForReport(req, req.params.id); // 404s on bad id / no access before touching anything else
  res.json(await loadReport(supabase, req.params.id));
});

// "My Research" — past searches for one account, newest first. Superseded (refreshed-away)
// versions are hidden; only the current head of each refresh chain shows. ?tag=example is a
// special case: seeded showcase reports with no owning account, visible to every user.
router.get("/research/queries", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const isExamplesQuery = req.query.tag === "example";
  let accountId = null;
  if (!isExamplesQuery) {
    accountId = req.query.accountId || (await defaultAccountId(req.user.id));
    await assertAccountMember(req.user.id, accountId);
  }

  let q = supabase
    .from("research_queries")
    .select("id, title, text, outcome, not_found_reason, top_score, pinned_at, tags, locale, created_at, updated_at, rerun_count")
    .is("superseded_by", null)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (accountId) q = q.eq("account_id", accountId);
  if (req.query.pinned === "true") q = q.not("pinned_at", "is", null);
  if (req.query.tag) q = q.contains("tags", [req.query.tag]);
  if (req.query.q) q = q.ilike("text", `%${req.query.q}%`);
  const { data: queries, error } = await q;
  if (error) throw error;

  // caseCount/topCourt must reflect the actual answer actually shown for this query — NOT
  // every candidate research_query_chunks happened to retrieve (that list includes
  // below-threshold, uncitable passages kept around only so the UI can show what was
  // dropped). Reading research_answer_segments instead means a "No match" query can never
  // also claim "N cases", and the court shown is the one the report actually cites.
  const answeredIds = queries.filter((r) => r.outcome !== "not_found").map((r) => r.id);
  const caseCount = {};
  const courtCounts = {};
  if (answeredIds.length > 0) {
    const { data: answers, error: answersError } = await supabase
      .from("research_answers")
      .select("id, query_id, created_at")
      .in("query_id", answeredIds)
      .order("created_at", { ascending: false });
    if (answersError) throw answersError;
    const latestAnswerIdByQuery = new Map();
    for (const a of answers) if (!latestAnswerIdByQuery.has(a.query_id)) latestAnswerIdByQuery.set(a.query_id, a.id);
    const queryIdByAnswerId = new Map([...latestAnswerIdByQuery.entries()].map(([queryId, answerId]) => [answerId, queryId]));
    const answerIds = [...latestAnswerIdByQuery.values()];

    if (answerIds.length > 0) {
      const { data: segRows, error: segError } = await supabase
        .from("research_answer_segments")
        .select("research_answer_id, chunk:corpus_chunks(document:corpus_documents(court))")
        .in("research_answer_id", answerIds);
      if (segError) throw segError;
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

  // The court shown is the one most of the cited cases are actually from, not whichever
  // chunk happened to be retrieved/scored first.
  const topCourt = {};
  for (const [queryId, counts] of Object.entries(courtCounts)) {
    let best = null, bestCount = 0;
    for (const [court, count] of counts) if (count > bestCount) { best = court; bestCount = count; }
    topCourt[queryId] = best;
  }

  res.json(
    queries.map((r) => ({
      ...r,
      caseCount: r.outcome === "not_found" ? 0 : caseCount[r.id] || 0,
      topCourt: r.outcome === "not_found" ? null : topCourt[r.id] || null,
    }))
  );
});

router.patch("/research/queries/:id", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  await loadOwnedQuery(req, req.params.id);

  const patch = {};
  if (typeof req.body?.pinned === "boolean") patch.pinned_at = req.body.pinned ? new Date().toISOString() : null;
  if (Array.isArray(req.body?.tags)) patch.tags = req.body.tags.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim().slice(0, 40));
  if (Object.keys(patch).length === 0) throw new HttpError(400, "Nothing to update — pass pinned and/or tags.");

  const { data: updated, error } = await supabase.from("research_queries").update(patch).eq("id", req.params.id).select().single();
  if (error) throw error;
  res.json(updated);
});

/**
 * Walks research_queries.superseded_by BACKWARD from `headId` — every older row that was
 * superseded into this one, however many "Refresh" hops deep — and returns every id in the
 * chain including headId itself. Deleting just headId alone 500s with a foreign-key
 * violation the moment any history exists: an older row's superseded_by still points AT
 * headId, and research_queries_superseded_by_fkey has no ON DELETE action, so Postgres
 * refuses to drop a row something else still references. The whole chain is really one
 * "My Research" entry's history, so deleting it deletes all of it together.
 */
async function collectSupersededChain(supabase, headId) {
  const ids = new Set([headId]);
  let frontier = [headId];
  while (frontier.length > 0) {
    const { data, error } = await supabase.from("research_queries").select("id").in("superseded_by", frontier);
    if (error) throw error;
    frontier = (data || []).map((r) => r.id).filter((id) => !ids.has(id));
    for (const id of frontier) ids.add(id);
  }
  return [...ids];
}

router.delete("/research/queries/:id", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  await loadOwnedQuery(req, req.params.id);
  const chainIds = await collectSupersededChain(supabase, req.params.id);

  const { data: answers, error: answersError } = await supabase.from("research_answers").select("id").in("query_id", chainIds);
  if (answersError) throw answersError;
  const answerIds = answers.map((a) => a.id);
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
  // One statement deleting every row in the chain together — Postgres defers a NO ACTION
  // self-referencing FK check to the end of the statement, so rows that reference each
  // other via superseded_by can be removed together even though neither could be deleted
  // alone first.
  const { error: deleteError } = await supabase.from("research_queries").delete().in("id", chainIds);
  if (deleteError) throw deleteError;

  res.json({ deleted: true });
});

// Re-runs the same question through live retrieval, as a NEW query row — the old one is kept
// (linked via superseded_by) so history never silently disappears.
router.post("/research/queries/:id/refresh", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const query = await loadOwnedQuery(req, req.params.id);

  const threshold = relevanceThreshold();
  const [{ liveFetch, results: scored }, locale] = await Promise.all([retrieve(query.text, { sourcesEnabled: query.sources_enabled }), detectLanguage(query.text)]);

  const { data: newQuery, error: insertError } = await supabase
    .from("research_queries")
    .insert({
      account_id: query.account_id,
      text: query.text,
      normalized_text: query.normalized_text || normalizeQueryText(query.text),
      title: query.title || deriveTitle(query.text),
      locale,
      sources_enabled: query.sources_enabled,
      threshold,
      model_version: MODEL_VERSION,
      outcome: scored.some((s) => s.score >= threshold) ? "answered" : "not_found",
      top_score: scored[0]?.score ?? null,
      live_fetch_ingest_failed: liveFetch.ingestErrors > 0,
      rerun_count: query.rerun_count || 1,
    })
    .select()
    .single();
  if (insertError) throw insertError;

  if (scored.length > 0) {
    const { error: chunksError } = await supabase
      .from("research_query_chunks")
      .insert(scored.map((s, i) => ({ query_id: newQuery.id, chunk_id: s.chunk.id, score: s.score, position: i })));
    if (chunksError) throw chunksError;
  }

  const { error: supersedeError } = await supabase.from("research_queries").update({ superseded_by: newQuery.id }).eq("id", query.id);
  if (supersedeError) throw supersedeError;

  await buildPersistAndSyncOutcome(supabase, newQuery, scored, locale);
  res.json({ searchId: newQuery.id });
});

// Follow-up chat scoped to ONE report's own evidence — never a fresh retrieval.
router.post("/research/queries/:id/ask", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const query = await loadOwnedQuery(req, req.params.id);
  const { question } = req.body || {};
  if (typeof question !== "string" || question.trim().length < 3 || question.length > 500) throw new HttpError(400, "Enter a question of 3–500 characters.");

  const { data: answer, error: answerError } = await supabase
    .from("research_answers")
    .select("id")
    .eq("query_id", query.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (answerError) throw answerError;
  if (!answer) throw new HttpError(409, "This report has no answer yet to ask follow-ups about.");

  const [{ data: segmentRows, error: segError }, { data: priorRows, error: priorError }] = await Promise.all([
    supabase
      .from("research_answer_segments")
      .select("position, text, chunk_id, chunk:corpus_chunks(document:corpus_documents(title))")
      .eq("research_answer_id", answer.id)
      .order("position", { ascending: true }),
    supabase.from("research_chat_turns").select("question, answer, created_at").eq("research_query_id", query.id).order("created_at", { ascending: true }),
  ]);
  if (segError) throw segError;
  if (priorError) throw priorError;

  const segments = segmentRows.map((r) => ({ chunkId: r.chunk_id, text: r.text, documentTitle: r.chunk?.document?.title }));
  const result = await answerFollowUp(question, segments, { language: query.locale, priorTurns: priorRows });

  const citations = result.citedIndexes.map((i) => segments[i - 1]).filter(Boolean);
  const { data: turn, error: turnError } = await supabase
    .from("research_chat_turns")
    .insert({ research_query_id: query.id, question, answer: { text: result.text, citations } })
    .select()
    .single();
  if (turnError) throw turnError;

  res.json(turn);
});

router.get("/research/queries/:id/chat", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  await loadOwnedQuery(req, req.params.id);
  const { data, error } = await supabase
    .from("research_chat_turns")
    .select("*")
    .eq("research_query_id", req.params.id)
    .order("created_at", { ascending: true });
  if (error) throw error;
  res.json(data);
});

router.get("/research/queries/:id/export.pdf", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const query = await loadOwnedQuery(req, req.params.id);
  const report = await loadReport(supabase, req.params.id);
  if (report.status !== "done") throw new HttpError(409, "This report isn't ready yet.");

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
    })),
    relatedSearches: report.relatedSearches,
    note: report.note,
  });
  res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="research-${query.id}.pdf"` });
  res.send(pdf);
});

// Browse list for the Research library's default (no-query) view — so the page never looks
// empty just because the user hasn't typed a search yet.
router.get("/corpus/documents", requireAuth, async (req, res) => {
  const { data, error } = await getSupabase()
    .from("corpus_documents")
    .select("id, title, source, citation, court, canonical_url, indexed_at")
    .order("indexed_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  res.json(data);
});

router.get("/corpus/documents/:id", requireAuth, async (req, res) => {
  const { data: doc, error } = await getSupabase().from("corpus_documents").select("*").eq("id", req.params.id).maybeSingle();
  if (error) throw error;
  if (!doc) return res.status(404).json({ error: "Not found" });
  res.json(doc);
});

// Every passage indexed for one document, in reading order — lets the browse list ("already
// indexed" view) be read in-app instead of only linking out to the external source. Verbatim,
// same as everywhere else in this library — never an LLM summary written from memory.
router.get("/corpus/documents/:id/chunks", requireAuth, async (req, res) => {
  const { data, error } = await getSupabase()
    .from("corpus_chunks")
    .select("id, ordinal, text, paragraph_class, para_number")
    .eq("document_id", req.params.id)
    .order("ordinal", { ascending: true });
  if (error) throw error;
  res.json(data);
});

// A couple of neighbouring chunks (same document, adjacent ordinal) give the reader more
// surrounding text than the single retrieved passage alone — useful when that passage is a
// short, isolated paragraph (e.g. one reasoning line sandwiched between differently-classed
// ones, so chunkParagraphs couldn't merge it with anything).
const CONTEXT_WINDOW = 2;

router.get("/corpus/chunks/:id", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const { data: chunk, error } = await supabase
    .from("corpus_chunks")
    .select("*, document:corpus_documents(*)")
    .eq("id", req.params.id)
    .maybeSingle();
  if (error) throw error;
  if (!chunk) return res.status(404).json({ error: "Not found" });

  const { data: context, error: contextError } = await supabase
    .from("corpus_chunks")
    .select("id, ordinal, text, paragraph_class, para_number")
    .eq("document_id", chunk.document_id)
    .gte("ordinal", chunk.ordinal - CONTEXT_WINDOW)
    .lte("ordinal", chunk.ordinal + CONTEXT_WINDOW)
    .order("ordinal", { ascending: true });
  if (contextError) throw contextError;

  res.json({ ...chunk, context });
});

router.get("/corpus/status", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  // See corpus_document_stats_by_source() in schema.sql — count plus each source's most
  // recently indexed document, for the Samicus Research corpus cards' "indexed to <date>" line.
  const { data: bySource, error } = await supabase.rpc("corpus_document_stats_by_source");
  if (error) throw error;
  const { count: chunkCount, error: countError } = await supabase.from("corpus_chunks").select("*", { count: "exact", head: true });
  if (countError) throw countError;
  const lawAsOn = (bySource || []).reduce((latest, s) => (s.indexed_at && (!latest || s.indexed_at > latest) ? s.indexed_at : latest), null);
  res.json({
    bySource,
    lawAsOn,
    chunkCount,
    vectorIndex: await knowledgeBaseStats().catch((e) => ({ enabled: true, error: e.message })),
    asOf: new Date().toISOString().slice(0, 10),
  });
});

export default router;
