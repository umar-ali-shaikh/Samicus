// One-off maintenance pass over passages indexed BEFORE the entity-decoding, page-artifact-
// stripping, and paragraph-classification fixes existed (chunk.js) — applies the same fixes
// to already-stored corpus_chunks rows, so the 1,369 passages indexed under the old pipeline
// get the benefit without having to re-fetch and re-ingest every source document from
// scratch. Run via `node src/utils/rag.js reprocess`.
import { getSupabase } from "../../config/db.js";
import { classifyParagraphText, decodeEntities, looksLikePageArtifact, rejoinBrokenLines } from "./chunk.js";
import { embedAndStore } from "./ingest.js";

function cleanText(text) {
  return rejoinBrokenLines(decodeEntities(text)).trim();
}

/**
 * @returns {Promise<{ scanned: number, textChanged: number, reclassified: number, dropped: number }>}
 */
export async function reprocessExistingPassages({ pageSize = 200 } = {}) {
  const supabase = getSupabase();
  let scanned = 0, textChanged = 0, reclassified = 0, dropped = 0;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("corpus_chunks")
      .select("id, text, paragraph_class, document:corpus_documents(id, external_id, title, citation, source, court, canonical_url)")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data.length) break;

    const toReembedByDoc = new Map();
    for (const row of data) {
      scanned++;
      const cleaned = cleanText(row.text);
      if (looksLikePageArtifact(cleaned) || cleaned.length < 3) {
        // A stray page number/footer that slipped in under the old pipeline — there's
        // nowhere useful to re-home this chunk's citations, so it's left as-is rather than
        // deleted (deleting would orphan any research_answer_segments already pointing at
        // it); it simply won't be picked for anything new since retrieval re-scores on the
        // (now-decoded) text.
        dropped++;
        continue;
      }
      // Only paragraphs stored as "reasoning" are candidates for reclassification — it's
      // both the most common genuine class and the universal ingestion fallback, so this
      // may legitimately leave some real reasoning passages unchanged; that's correct, not
      // a miss. classifyParagraphText only overrides when the text itself gives a strong
      // signal (a quoted precedent, a party's submission, etc.) — see chunk.js.
      const newClass = row.paragraph_class === "reasoning" ? classifyParagraphText(cleaned, "reasoning", "reasoning") : row.paragraph_class;

      const textDiffers = cleaned !== row.text;
      const classDiffers = newClass !== row.paragraph_class;
      if (!textDiffers && !classDiffers) continue;
      if (textDiffers) textChanged++;
      if (classDiffers) reclassified++;

      const { error: updateError } = await supabase.from("corpus_chunks").update({ text: cleaned, paragraph_class: newClass }).eq("id", row.id);
      if (updateError) throw updateError;

      const doc = row.document;
      if (!doc) continue;
      const list = toReembedByDoc.get(doc.id) || { doc, chunks: [] };
      list.chunks.push({ id: row.id, text: cleaned, paraClass: newClass, paraNumber: null });
      toReembedByDoc.set(doc.id, list);
    }

    // Keep Qdrant's payload (text/para_class) in sync with what changed — cheap relative to
    // the full corpus since only rows that actually changed are re-embedded.
    for (const { doc, chunks } of toReembedByDoc.values()) await embedAndStore(chunks, doc);

    from += pageSize;
  }
  return { scanned, textChanged, reclassified, dropped };
}
