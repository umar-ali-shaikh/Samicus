import { Router } from "express";
import { getSupabase } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { retrieve, answerFromRetrieval, relevanceThreshold } from "../services/research.js";
import { assertAccountMember, defaultAccountId, HttpError } from "../services/access.js";
import { knowledgeBaseStats } from "../services/rag/retrieve.js";

const router = Router();

// Step 1: retrieve — a separate callable step, so the client sees retrieval before any answer exists.
router.post("/research/retrieve", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  const { text, sourcesEnabled } = req.body || {};
  if (typeof text !== "string" || text.trim().length < 5 || text.length > 1000) throw new HttpError(400, "Enter a question of 5–1,000 characters.");
  const accountId = req.body.accountId || (await defaultAccountId(req.user.id));
  await assertAccountMember(req.user.id, accountId);
  const threshold = relevanceThreshold();
  const scored = await retrieve(text, { sourcesEnabled });

  const { data: query, error } = await supabase
    .from("research_queries")
    .insert({
      account_id: accountId,
      text,
      sources_enabled: sourcesEnabled || [],
      threshold,
      model_version: "gemini-embedding-001+qdrant",
      outcome: scored.some((s) => s.score >= threshold) ? "answered" : "not_found",
    })
    .select()
    .single();
  if (error) throw error;

  if (scored.length > 0) {
    const { error: chunksError } = await supabase
      .from("research_query_chunks")
      .insert(scored.map((s, i) => ({ query_id: query.id, chunk_id: s.chunk.id, score: s.score, position: i })));
    if (chunksError) throw chunksError;
  }

  res.json({
    retrievalId: query.id,
    threshold,
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
  const { data: query, error } = await supabase.from("research_queries").select("*").eq("id", retrievalId).maybeSingle();
  if (error) throw error;
  if (!query) return res.status(404).json({ error: "Unknown retrieval id" });
  await assertAccountMember(req.user.id, query.account_id).catch(() => { throw new HttpError(404, "Unknown retrieval id"); });

  const { data: queryChunks, error: chunksError } = await supabase
    .from("research_query_chunks")
    .select("score, position, chunk:corpus_chunks(*, document:corpus_documents(*))")
    .eq("query_id", query.id)
    .order("position", { ascending: true });
  if (chunksError) throw chunksError;

  const scored = queryChunks.map((qc) => ({ chunk: qc.chunk, score: qc.score }));
  const result = await answerFromRetrieval(scored);

  if (result.outcome === "not_found") {
    const { error: updateError } = await supabase.from("research_queries").update({ outcome: "not_found" }).eq("id", query.id);
    if (updateError) throw updateError;
    return res.json({ outcome: "not_found", segments: [], discardedCount: result.discardedCount });
  }

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

  res.json({ outcome: result.outcome, answer, segments: result.segments, discardedCount: result.discardedCount });
});

router.get("/corpus/documents/:id", requireAuth, async (req, res) => {
  const { data: doc, error } = await getSupabase().from("corpus_documents").select("*").eq("id", req.params.id).maybeSingle();
  if (error) throw error;
  if (!doc) return res.status(404).json({ error: "Not found" });
  res.json(doc);
});

router.get("/corpus/chunks/:id", requireAuth, async (req, res) => {
  const { data: chunk, error } = await getSupabase()
    .from("corpus_chunks")
    .select("*, document:corpus_documents(*)")
    .eq("id", req.params.id)
    .maybeSingle();
  if (error) throw error;
  if (!chunk) return res.status(404).json({ error: "Not found" });
  res.json(chunk);
});

router.get("/corpus/status", requireAuth, async (req, res) => {
  const supabase = getSupabase();
  // See corpus_document_counts_by_source() in schema.sql.
  const { data: bySource, error } = await supabase.rpc("corpus_document_counts_by_source");
  if (error) throw error;
  const { count: chunkCount, error: countError } = await supabase.from("corpus_chunks").select("*", { count: "exact", head: true });
  if (countError) throw countError;
  res.json({ bySource, chunkCount, vectorIndex: await knowledgeBaseStats().catch((e) => ({ enabled: true, error: e.message })), asOf: new Date().toISOString().slice(0, 10) });
});

export default router;
