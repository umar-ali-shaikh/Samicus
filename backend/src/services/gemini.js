// Google Gemini embeddings client — used to re-rank Indian Kanoon search candidates by
// actual semantic meaning instead of only TF-IDF term overlap (see utils/tfidf.js and
// services/relevanceRanking.js). Google AI Studio issues free-tier API keys with no
// credit card and a generous free quota (https://aistudio.google.com/apikey).
//
// This is a genuinely OPTIONAL enhancement, never a hard dependency: if GEMINI_API_KEY
// isn't set, or this call fails for any reason (network, rate limit, bad key),
// relevanceRanking.js falls back to the always-available local TF-IDF ranker — the RAG
// pipeline must keep working with zero external cost if the caller never configures this.
import { increment } from "../utils/callCounter.js";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
// Stable, text-only, well-documented rate limits — deliberately not the newer
// multimodal gemini-embedding-2 preview, which this app has no use for (text only).
export const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001";
// Google's docs recommend 768/1536/3072; 768 keeps the cosine-similarity math and
// per-request payload small without a meaningful quality loss for this use case
// (re-ranking a handful of short search headlines, not large-scale retrieval).
const OUTPUT_DIMENSIONS = 768;

export class GeminiAuthError extends Error {
  constructor(message = "Gemini embeddings unavailable: invalid or missing GEMINI_API_KEY") {
    super(message);
    this.name = "GeminiAuthError";
  }
}

export class GeminiApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "GeminiApiError";
    this.status = status;
  }
}

export function isGeminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

/**
 * Batch-embeds `texts` in a single request. `taskType` must match how the text will be
 * compared — Gemini's embeddings are task-tuned/asymmetric, so a search query and the
 * documents it's compared against need different task types to be meaningfully
 * comparable via cosine similarity.
 * @param {string[]} texts
 * @param {"RETRIEVAL_QUERY"|"RETRIEVAL_DOCUMENT"} taskType
 * @returns {Promise<number[][]>} one embedding vector per input text, same order
 */
const MAX_BATCH = 64;
// Free-tier embedContent quota is ~100/min and a single 64-text batch already uses most of
// it, so the second batch in a reindex run reliably hits 429 — Google's RetryInfo asks for
// ~50s. 6 attempts at a 2s-base exponential backoff accumulate ~62s of waiting, enough to
// clear the per-minute window instead of giving up inside it.
const MAX_ATTEMPTS = 6;
const RETRY_BASE_MS = 2000;

/**
 * Like embedTexts, but splits large inputs into API-sized batches and retries 429/5xx with
 * backoff (the free tier rate-limits bursts). Order of the returned vectors matches `texts`.
 */
export async function embedMany(texts, taskType) {
  const out = [];
  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    const batch = texts.slice(i, i + MAX_BATCH);
    for (let attempt = 1; ; attempt++) {
      try {
        out.push(...(await embedTexts(batch, taskType)));
        break;
      } catch (err) {
        const retryable = err instanceof GeminiApiError && (err.status === 429 || err.status >= 500 || err.status === 0);
        if (!retryable || attempt >= MAX_ATTEMPTS) throw err;
        await new Promise((r) => setTimeout(r, RETRY_BASE_MS * 2 ** (attempt - 1)));
      }
    }
  }
  return out;
}

export const EMBEDDING_DIMENSIONS = OUTPUT_DIMENSIONS;

export async function embedTexts(texts, taskType) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiAuthError();
  if (texts.length === 0) return [];

  const model = process.env.GEMINI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
  const body = {
    requests: texts.map((text) => ({
      model: `models/${model}`,
      content: { parts: [{ text: text.slice(0, 2000) }] }, // keep well under the model's input limit
      taskType,
      outputDimensionality: OUTPUT_DIMENSIONS,
    })),
  };

  // Everything from the network call through parsing the body lives in one try/catch —
  // the AbortSignal timeout can fire just as easily while the body is still streaming in
  // as during the initial fetch, and both must come out as a GeminiApiError, never escape
  // raw (see the equivalent fix in openRouter.js/indianKanoon.js for the bug this guards).
  try {
    const res = await fetch(`${GEMINI_URL}/${model}:batchEmbedContents`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });

    if (res.status === 401 || res.status === 403) throw new GeminiAuthError();

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new GeminiApiError(`Gemini API error ${res.status}${text ? `: ${text}` : ""}`, res.status);
    }

    increment("gemini");
    const data = await res.json();
    return (data.embeddings || []).map((e) => e.values || []);
  } catch (err) {
    if (err instanceof GeminiAuthError || err instanceof GeminiApiError) throw err;
    throw new GeminiApiError(`Network error calling Gemini: ${err.message}`, 0);
  }
}
