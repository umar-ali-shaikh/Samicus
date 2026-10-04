// Thin OpenRouter chat-completions client shared by every service that needs an LLM call
// (query understanding, grounded answer generation). Centralised here so auth/error
// handling behaves identically everywhere instead of being copy-pasted per call site.
import { increment } from "../utils/callCounter.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// OpenRouter's free-tier catalogue changes; override via OPENROUTER_MODEL if this one
// gets retired or rate-limited.
export const DEFAULT_MODEL = "google/gemma-4-31b-it:free";

// Free models share a pool upstream and routinely 429 independent of our own OpenRouter
// account limit — each provider's shared pool fills up on its own schedule. Rather than
// manually swapping DEFAULT_MODEL every time the current one gets hit, fall through this
// chain (each a different upstream provider) until one responds.
const FALLBACK_MODELS = [
  "qwen/qwen3.8-27b:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "z-ai/glm-5.2:free",
  "inclusionai/ling-3.0-flash-vl:free",
];

export class OpenRouterAuthError extends Error {
  constructor(message = "AI generation is unavailable: invalid or missing OpenRouter API key") {
    super(message);
    this.name = "OpenRouterAuthError";
  }
}

export class OpenRouterApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "OpenRouterApiError";
    this.status = status;
  }
}

export function isOpenRouterConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

function getToken() {
  const token = process.env.OPENROUTER_API_KEY;
  if (!token) throw new OpenRouterAuthError();
  return token;
}

async function callModel(model, messages, jsonMode, token) {
  const body = { model, messages };
  if (jsonMode) body.response_format = { type: "json_object" };

  // Everything from the network call through parsing the body lives in one try/catch —
  // the AbortSignal timeout can fire just as easily while the body is still streaming in
  // (observed in production: a bare, unclassified DOMException [TimeoutError] out of
  // res.json() with no application frames in its stack) as during the initial fetch, and
  // both must come out as a retryable OpenRouterApiError, never escape raw.
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000), // a hung free-tier model must fail over to the next one, not block the request forever
    });

    if (res.status === 401 || res.status === 403) throw new OpenRouterAuthError();

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new OpenRouterApiError(`OpenRouter API error ${res.status}${text ? `: ${text}` : ""}`, res.status);
    }

    increment("openrouter");
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || "";
  } catch (err) {
    if (err instanceof OpenRouterAuthError || err instanceof OpenRouterApiError) throw err;
    // Network failure, or the timeout signal firing mid-response (headers already in,
    // body not yet) — same "worth trying the next model" treatment as any other
    // unreachable-provider failure (status 0), instead of an unclassified crash.
    throw new OpenRouterApiError(`Network error calling OpenRouter: ${err.message}`, 0);
  }
}

/**
 * @param {Array<{role: string, content: string}>} messages
 * @param {{model?: string, jsonMode?: boolean}} [opts] - jsonMode asks the model to return
 *   a JSON object; not every free model honours response_format, so callers must still
 *   parse defensively.
 * @returns {Promise<string>} the raw assistant message content.
 */
export async function chatCompletion(messages, opts = {}) {
  const token = getToken(); // outside the try/catch: a missing key is a config error, not a network failure
  const primary = opts.model || process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  // Only chain through fallbacks when the caller didn't pin an explicit model.
  const chain = opts.model ? [primary] : [primary, ...FALLBACK_MODELS.filter((m) => m !== primary)];

  let lastErr;
  for (const model of chain) {
    try {
      return await callModel(model, messages, opts.jsonMode, token);
    } catch (err) {
      lastErr = err;
      // Worth trying the next model for a rate limit, or a timeout/network failure (status
      // 0 — a hung/unreachable free-tier model) — an auth problem or a real non-429 API
      // error will fail the same way on every model in the chain, so only those stop the chain.
      if (err.status !== 429 && err.status !== 0) throw err;
    }
  }
  throw lastErr;
}
