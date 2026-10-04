# RAG architecture (Qdrant + OpenRouter + Supabase)

Vidhira answers legal questions from **retrieved passages**, never from model memory. Three stores
share the work:

| Store | Holds | Why |
|---|---|---|
| **Supabase Postgres** | `corpus_documents` (one row per source document) and `corpus_chunks` (the passage text, paragraph class, deep link) | Source of truth. Citations resolve against it and the vector index can always be rebuilt from it. |
| **Qdrant** | One vector per chunk (768-d, cosine, int8-quantised, payload on disk) in collection `vidhira_legal`; the clause library in `vidhira_clauses` | Fast semantic search. The point id **is** the `corpus_chunks.id`. |
| **OpenRouter `sentence-transformers/all-mpnet-base-v2`** (`services/openRouterEmbeddings.js`) | Embeddings for both passages and questions (symmetric model, no query/document distinction) | Paid per call, but sub-cent — chosen specifically because its native 768-dim output matches Qdrant's `VECTOR_SIZE`, so it's a drop-in for whatever embedding model preceded it as long as the corpus is fully re-embedded (see below). Override via `OPENROUTER_EMBEDDING_MODEL`. |

**Changing the embedding model is not a config-only change.** Two different embedding models
produce vectors in different, incomparable coordinate spaces — a vector from the old model next to
a vector from the new model is not meaningfully comparable by cosine similarity, even if both
happen to be 768-dim. After changing `OPENROUTER_EMBEDDING_MODEL` (or swapping providers
entirely), run `npm run rag:reembed-all` to force every existing chunk to be re-embedded with the
new model before trusting retrieval results again. If the new model's native dimension differs
from 768, you also need to delete and recreate the Qdrant collection(s) (`vidhira_legal`,
`vidhira_clauses`) with the new `vectors.size` — see `services/rag/qdrant.js`'s `VECTOR_SIZE`.

MongoDB is not used: relational data already lives in Postgres, and a document store would add a
third database without solving anything Qdrant + Postgres don't.

## Ingestion — the knowledge base grows from real usage

There is no seeded corpus. Whenever the AI assistant's live Indian Kanoon search surfaces a
document, `services/rag/ingest.js`:

1. fetches the full document HTML (`getDocumentRaw` — unsanitised, server-side only, so Indian
   Kanoon's `title="Fact" / "Issue" / "Court's Reasoning" / "Conclusion"` paragraph markers survive),
2. splits it into paragraphs and merges same-class neighbours into ~900-character chunks
   (`services/rag/chunk.js`; a party's *argument* stays its own chunk class),
3. writes `corpus_documents` + `corpus_chunks` (deduplicated by `external_id = "ik:<tid>"`),
4. embeds the chunks in batches (retrying 429/5xx) and upserts them to Qdrant,
5. marks `embedded_at`. A failed embedding leaves the rows un-embedded; `npm run rag:reindex`
   (in `backend/`) finishes the job.

> **Check Indian Kanoon's API terms** before relying on this persistent index. Set
> `QDRANT_URL=` empty to switch the knowledge base off entirely; the assistant then behaves exactly
> as before (live search + in-memory cache).

## Retrieval — `answerLegalQuestion`

```
question ─▶ understand (language, search query, emergency?)
        ─▶ Qdrant: top passages for the distilled query            (free)
        ├─ enough passages ≥ RAG_SKIP_LIVE_SEARCH_SCORE?  ─▶ answer from the KB, NO paid IK call
        └─ otherwise: live Indian Kanoon search ─▶ rank ─▶ ingest the hits ─▶ re-query Qdrant
        ─▶ evidence = best passages, each labelled (statutory provision / court's reasoning / …)
        ─▶ LLM answers strictly from the numbered evidence ─▶ citations resolved server-side
```

Consequences worth knowing:

* **Cost falls as the KB grows**: confident questions never touch the paid API.
* **Resilience**: if the live search fails but the KB has passages, the answer is still produced.
* **Provenance is returned** (`retrieval.mode`, `passages`, `servedFromKnowledgeBase`) and shown in the UI.
* **Safety text is not model output**: the disclaimer and emergency banner are fixed server strings.

## Research library (`/api/research/*`)

Two explicit steps, like the original design: `retrieve` returns scored passages (kept vs. below
`RAG_MIN_SCORE`), `answer` takes a **retrieval id, never a bare question**, and assembles an
*extractive* note — every segment is a retrieved passage, so every citation resolves by
construction. Argument-class passages can be shown but are never cited as law.

## Contract review

The curated `clause_library` is embedded into `vidhira_clauses` (on boot if missing, or
`npm run rag:reindex`). An uploaded contract is text-extracted (PDF text layer / DOCX / TXT — scanned
documents are refused, there is no OCR), split into clauses, matched to the nearest baseline clause of
the chosen contract type, and each matched pair is compared by the LLM using only the two clauses and
the library's rationale note. Clauses with no close baseline are reported as *not assessed*.

## Tuning

`RAG_MIN_SCORE`, `RAG_SKIP_LIVE_SEARCH_SCORE` and `RAG_SKIP_LIVE_MIN_PASSAGES` are starting points,
not calibrated constants — adjust them against real questions. `GET /api/corpus/status` and
`npm run rag:status` show document / passage / vector counts; the founder "AI performance" tab
lists the topics the assistant could not answer (the gaps worth indexing first).
