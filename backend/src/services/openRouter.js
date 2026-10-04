// Thin OpenRouter chat-completions client shared by every service that needs an LLM call
// (query understanding, grounded answer generation). Centralised here so auth/error
// handling behaves identically everywhere instead of being copy-pasted per call site.
import { increment } from "../utils/callCounter.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// Paid models, deliberately — free-tier slugs get retired/rate-limited/renamed often
// enough to be unreliable in production. Override via OPENROUTER_MODEL if this one gets
// retired. qwen3.7-flash is cheap (~$0.03/$0.13 per M tokens), has a 1M context window,
// and is strong at multilingual (Hindi/Marathi/Urdu) instruction-following.
export const DEFAULT_MODEL = "qwen/qwen3.7-flash";

// Each a different upstream provider, so a single provider's outage/rate-limit/retired
// model string doesn't take down the whole chain — see the "only stop early on a genuine
// auth failure" comment in chatCompletion below. All paid, all cheap (sub-$0.20/M tokens).
const FALLBACK_MODELS = [
  "openai/gpt-oss-20b",
  "mistralai/mistral-small-24b-instruct-2501",
  "google/gemma-3-12b-it",
  "amazon/nova-micro-v1",
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
      // Only a genuine auth failure (bad/missing key) is account-wide and will recur
      // identically on every model, so only that stops the chain early. Everything else —
      // a rate limit, a timeout/network failure (status 0), a 404 because this particular
      // model string was retired/renamed upstream, a provider-side 5xx — is specific to
      // the one model that just failed, so it's always worth trying the next one.
      if (err instanceof OpenRouterAuthError) throw err;
    }
  }
  throw lastErr;
}
