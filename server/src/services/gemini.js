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

  let res;
  try {
    res = await fetch(`${GEMINI_URL}/${model}:batchEmbedContents`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    throw new GeminiApiError(`Network error calling Gemini: ${networkErr.message}`, 0);
  }

  if (res.status === 401 || res.status === 403) throw new GeminiAuthError();

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GeminiApiError(`Gemini API error ${res.status}${text ? `: ${text}` : ""}`, res.status);
  }

  increment("gemini");
  const data = await res.json();
  return (data.embeddings || []).map((e) => e.values || []);
}
