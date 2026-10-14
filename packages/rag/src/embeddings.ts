// OpenRouter embeddings client — used to re-rank Indian Kanoon search candidates by actual
// semantic meaning instead of only TF-IDF term overlap, and to embed chunks/queries for the
// Qdrant knowledge base (see ingest.ts, retrieve.ts, clauses.ts).
//
// This is a genuinely OPTIONAL enhancement for relevance ranking (callers can fall back to
// local TF-IDF), but a hard dependency for the RAG knowledge base itself — ragEnabled() gates
// on isOpenRouterEmbeddingsConfigured() the same way it used to gate on Gemini.

const OPENROUTER_EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings";
// all-mpnet-base-v2 is a well-established, general-purpose sentence-embedding model —
// chosen specifically because its native output is 768-dim, matching qdrant.ts's
// VECTOR_SIZE exactly, so switching providers never requires resizing/recreating the
// existing Qdrant collection(s). Override via OPENROUTER_EMBEDDING_MODEL if needed, but any
// replacement with a different native dimension requires recreating the Qdrant
// collection(s) and a full reindex — see docs/RAG.md.
export const DEFAULT_EMBEDDING_MODEL = "sentence-transformers/all-mpnet-base-v2";
export const EMBEDDING_DIMENSIONS = 768;

export class OpenRouterEmbeddingAuthError extends Error {
  constructor(message = "Embeddings unavailable: invalid or missing OPENROUTER_API_KEY") {
    super(message);
    this.name = "OpenRouterEmbeddingAuthError";
  }
}

export class OpenRouterEmbeddingApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "OpenRouterEmbeddingApiError";
    this.status = status;
  }
}

// Same per-app-injected hook pattern as qdrant.ts's setQdrantRequestHook -- the app that
// extracted this package tracks per-provider call counts for an admin cost dashboard, but
// that's the app's concern, not this package's.
let onRequest: (() => void) | null = null;

export function setEmbeddingsRequestHook(hook: (() => void) | null): void {
  onRequest = hook;
}

export function isOpenRouterEmbeddingsConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

// Comfortably under all-mpnet-base-v2's 512-token context window — ~4-4.5 chars/token for
// English legal text, so 1500 chars lands around 330-375 tokens with headroom.
const INPUT_CHAR_LIMIT = 1500;

/**
 * Batch-embeds `texts` in a single request. `taskType` is accepted for interface
 * compatibility with call sites written for Gemini's asymmetric (query vs document)
 * embeddings, but is unused here — all-mpnet-base-v2 is a symmetric model with no
 * query/document distinction.
 */
export async function embedTexts(texts: string[], _taskType?: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT"): Promise<number[][]> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new OpenRouterEmbeddingAuthError();
  if (texts.length === 0) return [];

  const model = process.env.OPENROUTER_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
  const body = { model, input: texts.map((text) => text.slice(0, INPUT_CHAR_LIMIT)) };

  // Everything from the network call through parsing the body lives in one try/catch — the
  // AbortSignal timeout can fire just as easily while the body is still streaming in as
  // during the initial fetch, and both must come out as an OpenRouterEmbeddingApiError,
  // never escape raw (see the equivalent fix in openRouter.js/indianKanoon.js).
  try {
    const res = await fetch(OPENROUTER_EMBEDDINGS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });

    if (res.status === 401 || res.status === 403) throw new OpenRouterEmbeddingAuthError();

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new OpenRouterEmbeddingApiError(`OpenRouter embeddings API error ${res.status}${text ? `: ${text}` : ""}`, res.status);
    }

    onRequest?.(); // separate bucket from chat completions — very different per-call cost
    const data = (await res.json()) as { data?: { embedding?: number[] }[] };
    return (data.data || []).map((e) => e.embedding || []);
  } catch (err) {
    if (err instanceof OpenRouterEmbeddingAuthError || err instanceof OpenRouterEmbeddingApiError) throw err;
    throw new OpenRouterEmbeddingApiError(`Network error calling OpenRouter embeddings: ${(err as Error).message}`, 0);
  }
}

const MAX_BATCH = 64;
const MAX_ATTEMPTS = 6;
const RETRY_BASE_MS = 2000;

/**
 * Like embedTexts, but splits large inputs into API-sized batches and retries 429/5xx with
 * backoff. Order of the returned vectors matches `texts`.
 */
export async function embedMany(texts: string[], taskType?: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT"): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    const batch = texts.slice(i, i + MAX_BATCH);
    for (let attempt = 1; ; attempt++) {
      try {
        out.push(...(await embedTexts(batch, taskType)));
        break;
      } catch (err) {
        const retryable = err instanceof OpenRouterEmbeddingApiError && (err.status === 429 || err.status >= 500 || err.status === 0);
        if (!retryable || attempt >= MAX_ATTEMPTS) throw err;
        await new Promise((r) => setTimeout(r, RETRY_BASE_MS * 2 ** (attempt - 1)));
      }
    }
  }
  return out;
}
