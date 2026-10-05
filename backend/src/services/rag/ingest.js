// Ingestion: document → paragraphs → chunks → OpenRouter embeddings → Qdrant, with the text
// and metadata kept in Postgres (corpus_documents / corpus_chunks) so citations resolve and
// the vector index can always be rebuilt. The point id in Qdrant IS the corpus_chunks row id.
import crypto from "crypto";
import { getSupabase } from "../../config/db.js";
import { embedMany, isOpenRouterEmbeddingsConfigured } from "../openRouterEmbeddings.js";
import { chunkParagraphs, htmlToParagraphs, mapDocSource, stripTags, textToParagraphs } from "./chunk.js";
import { deletePoints, ensureCollection, isQdrantConfigured, legalCollection, matchFilter, upsertPoints } from "./qdrant.js";

export function ragEnabled() {
  return isQdrantConfigured() && isOpenRouterEmbeddingsConfigured();
}

export const PAYLOAD_INDEXES = ["source", "document_id", "para_class"];

const inFlight = new Map();

function indianKanoonUrl(tid) {
  return `https://indiankanoon.org/doc/${tid}/`;
}

export async function embedAndStore(chunks, doc) {
  const vectors = await embedMany(chunks.map((c) => c.text), "RETRIEVAL_DOCUMENT");
  await ensureCollection(legalCollection(), PAYLOAD_INDEXES);
  await upsertPoints(
    legalCollection(),
    chunks.map((c, i) => ({
      id: c.id,
      vector: vectors[i],
      payload: {
        document_id: doc.id,
        external_id: doc.external_id,
        title: doc.title,
        citation: doc.citation,
        source: doc.source,
        court: doc.court,
        url: doc.canonical_url,
        para_class: c.paraClass,
        para_number: c.paraNumber,
        ordinal: c.ordinal,
        text: c.text,
      },
    }))
  );
  const { error } = await getSupabase().from("corpus_chunks").update({ embedded_at: new Date().toISOString() }).in("id", chunks.map((c) => c.id));
  if (error) throw error;
}

/**
 * Indexes one Indian Kanoon document. Returns { documentId, chunks, skipped }.
 * Safe to call repeatedly: a document that is already fully embedded is skipped.
 */
export async function ingestIndianKanoonDoc({ tid, title, docsource, html }, { maxChunks = 80 } = {}) {
  // Indian Kanoon wraps the search term it matched in <b> inside titles/headlines (its
  // own result-highlighting markup) — never meant to reach a document's permanent title.
  title = stripTags(title);
  const key = `ik:${tid}`;
  if (inFlight.has(key)) return inFlight.get(key);
  const job = (async () => {
    const supabase = getSupabase();
    let { data: existing, error } = await supabase.from("corpus_documents").select("id").eq("external_id", key).maybeSingle();
    if (error) throw error;

    // Indian Kanoon sometimes lists the same judgment under two different document ids
    // (e.g. a re-indexed/reposted copy) — same title, different tid. Dedupe on title too,
    // not just external_id, so the same case doesn't end up ingested (and surfaced) twice.
    if (!existing) {
      // .limit(1) rather than .maybeSingle() — titles can already have more than one row
      // (pre-existing duplicates from before this check existed), which .maybeSingle() errors on.
      const { data: byTitle, error: titleError } = await supabase.from("corpus_documents").select("id").eq("title", title).limit(1);
      if (titleError) throw titleError;
      if (byTitle?.[0]) return { documentId: byTitle[0].id, chunks: 0, skipped: true };
    }

    const source = mapDocSource(docsource);
    const paragraphs = htmlToParagraphs(html, { fallbackClass: source === "bare_act" ? "provision" : "reasoning" });
    const chunks = chunkParagraphs(paragraphs, { maxChunks }).map((c) => ({ ...c, id: crypto.randomUUID() }));
    if (chunks.length === 0) return { documentId: existing?.id || null, chunks: 0, skipped: true };

    let doc = existing;
    if (existing) {
      const { count, error: countError } = await supabase.from("corpus_chunks").select("*", { count: "exact", head: true }).eq("document_id", existing.id).is("embedded_at", null);
      if (countError) throw countError;
      const { count: total, error: totalError } = await supabase.from("corpus_chunks").select("*", { count: "exact", head: true }).eq("document_id", existing.id);
      if (totalError) throw totalError;
      if (total > 0 && count === 0) return { documentId: existing.id, chunks: total, skipped: true };
      // Partially indexed earlier (e.g. the embedding call failed): rebuild this document's chunks.
      await ensureCollection(legalCollection(), PAYLOAD_INDEXES);
      await deletePoints(legalCollection(), matchFilter("document_id", existing.id));
      const { error: delError } = await supabase.from("corpus_chunks").delete().eq("document_id", existing.id);
      if (delError) throw delError;
      ({ data: doc } = await supabase.from("corpus_documents").select("*").eq("id", existing.id).single());
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("corpus_documents")
        .insert({
          external_id: key,
          source,
          citation: title,
          title,
          court: source === "supreme_court" || source === "high_court" || source === "tribunal" ? docsource : null,
          act_name: source === "bare_act" ? docsource : null,
          canonical_url: indianKanoonUrl(tid),
        })
        .select()
        .single();
      if (insertError) {
        // Lost a race with another instance: treat as already ingested.
        if (insertError.code === "23505") return { documentId: null, chunks: 0, skipped: true };
        throw insertError;
      }
      doc = inserted;
    }

    const { error: chunkError } = await supabase.from("corpus_chunks").insert(
      chunks.map((c) => ({
        id: c.id,
        document_id: doc.id,
        ordinal: c.ordinal,
        text: c.text,
        paragraph_class: c.paraClass,
        para_number: c.paraNumber,
        deep_link: c.paraNumber ? `${doc.canonical_url}#p_${c.paraNumber}` : doc.canonical_url,
        token_count: Math.round(c.text.length / 4),
      }))
    );
    if (chunkError) throw chunkError;

    await embedAndStore(chunks, doc);
    return { documentId: doc.id, chunks: chunks.length, skipped: false };
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return job;
}

/**
 * Indexes one trusted-domain web page found via Tavily (Stage 4 of the legal assistant
 * pipeline). Mirrors ingestIndianKanoonDoc's shape/dedupe behavior; the only differences
 * are the source ('web'), the dedupe key (a hash of the URL, Tavily has no stable doc id),
 * and plain-text paragraph splitting instead of Indian Kanoon's HTML.
 * Returns { documentId, chunks, skipped }.
 */
export async function ingestWebDoc({ url, title, text }, { maxChunks = 40 } = {}) {
  if (!url || !text?.trim()) return { documentId: null, chunks: 0, skipped: true };
  const key = `web:${crypto.createHash("sha256").update(url).digest("hex").slice(0, 32)}`;
  if (inFlight.has(key)) return inFlight.get(key);
  const job = (async () => {
    const supabase = getSupabase();
    const { data: existing, error } = await supabase.from("corpus_documents").select("id").eq("external_id", key).maybeSingle();
    if (error) throw error;

    const paragraphs = textToParagraphs(text);
    const chunks = chunkParagraphs(paragraphs, { maxChunks }).map((c) => ({ ...c, id: crypto.randomUUID() }));
    if (chunks.length === 0) return { documentId: existing?.id || null, chunks: 0, skipped: true };

    let doc = existing;
    if (existing) {
      const { count, error: countError } = await supabase.from("corpus_chunks").select("*", { count: "exact", head: true }).eq("document_id", existing.id).is("embedded_at", null);
      if (countError) throw countError;
      const { count: total, error: totalError } = await supabase.from("corpus_chunks").select("*", { count: "exact", head: true }).eq("document_id", existing.id);
      if (totalError) throw totalError;
      if (total > 0 && count === 0) return { documentId: existing.id, chunks: total, skipped: true };
      await ensureCollection(legalCollection(), PAYLOAD_INDEXES);
      await deletePoints(legalCollection(), matchFilter("document_id", existing.id));
      const { error: delError } = await supabase.from("corpus_chunks").delete().eq("document_id", existing.id);
      if (delError) throw delError;
      ({ data: doc } = await supabase.from("corpus_documents").select("*").eq("id", existing.id).single());
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("corpus_documents")
        .insert({ external_id: key, source: "web", citation: title || url, title: title || url, canonical_url: url })
        .select()
        .single();
      if (insertError) {
        if (insertError.code === "23505") return { documentId: null, chunks: 0, skipped: true };
        throw insertError;
      }
      doc = inserted;
    }

    const { error: chunkError } = await supabase.from("corpus_chunks").insert(
      chunks.map((c) => ({
        id: c.id,
        document_id: doc.id,
        ordinal: c.ordinal,
        text: c.text,
        paragraph_class: c.paraClass,
        para_number: c.paraNumber,
        deep_link: doc.canonical_url,
        token_count: Math.round(c.text.length / 4),
      }))
    );
    if (chunkError) throw chunkError;

    await embedAndStore(chunks, doc);
    return { documentId: doc.id, chunks: chunks.length, skipped: false };
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return job;
}

/** Re-embeds every chunk that never got a vector (used by `npm run rag:reindex`). */
export async function reindexPending({ pageSize = 200 } = {}) {
  const supabase = getSupabase();
  let total = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("corpus_chunks")
      .select("id, ordinal, text, paragraph_class, para_number, document:corpus_documents(id, external_id, title, citation, source, court, canonical_url)")
      .is("embedded_at", null)
      .limit(pageSize);
    if (error) throw error;
    if (data.length === 0) break;
    const byDoc = new Map();
    for (const row of data) {
      const list = byDoc.get(row.document.id) || { doc: row.document, chunks: [] };
      list.chunks.push({ id: row.id, ordinal: row.ordinal, text: row.text, paraClass: row.paragraph_class, paraNumber: row.para_number });
      byDoc.set(row.document.id, list);
    }
    for (const { doc, chunks } of byDoc.values()) {
      await embedAndStore(chunks, doc);
      total += chunks.length;
    }
  }
  return total;
}
