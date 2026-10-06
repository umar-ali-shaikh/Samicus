// Thin OpenRouter chat-completions client shared by every service that needs an LLM call
// (query understanding, grounded answer generation). Centralised here so auth/error
// handling behaves identically everywhere instead of being copy-pasted per call site.
import { increment } from "../utils/callCounter.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// Paid models, deliberately — free-tier slugs get retired/rate-limited/renamed often
// enough to be unreliable in production. Override via OPENROUTER_MODEL if this one gets
// retired. gpt-oss-20b supports both response_format AND strict structured_outputs, plus
// adjustable reasoning_effort — this prompt's SYSTEM_PROMPT (legalAssistant.js) is long and
// multi-constraint (strict per-field JSON shape, mandatory sourceIds, 6-way script
// compliance, several numbered behavioural rules), and a model that only skims it tends to
// under-fill arrays like stepByStep/yourRights even when the evidence supports more —
// observed in production with qwen3.7-flash (which lacks structured_outputs) returning a
// single stepByStep/yourRights item despite 5 directly-on-point case law sources.
export const DEFAULT_MODEL = "openai/gpt-oss-20b";

// Each a different upstream provider, so a single provider's outage/rate-limit/retired
// model string doesn't take down the whole chain — see the "only stop early on a genuine
// auth failure" comment in chatCompletion below. All paid, all cheap (sub-$0.20/M tokens),
// and all support structured_outputs (amazon/nova-micro-v1 — tried first — does not
// support response_format at all, and was dropped for that reason).
const FALLBACK_MODELS = [
  "mistralai/mistral-small-24b-instruct-2501",
  "google/gemma-3-12b-it",
  "cohere/command-r7b-12-2024",
  "qwen/qwen3.7-flash",
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

async function callModel(model, messages, { jsonMode, maxTokens } = {}, token) {
  const body = { model, messages };
  if (jsonMode) body.response_format = { type: "json_object" };
  if (maxTokens) body.max_tokens = maxTokens;

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
    const choice = data.choices?.[0];
    const finishReason = choice?.finish_reason || null;
    // A response cut off mid-JSON (finish_reason "length") is exactly how a validated-
    // but-empty answer happens (salvageFields recovers summary/confidence from the start
    // of the object, but the array fields later in the JSON never arrived) — logged here,
    // at the one place every call site shares, rather than re-derived per caller.
    if (finishReason === "length") {
      console.warn(`OpenRouter: response truncated (finish_reason=length) for model ${model} — consider raising max_tokens.`);
    }
    return { content: choice?.message?.content?.trim() || "", finishReason, model };
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
 * @param {{model?: string, jsonMode?: boolean, maxTokens?: number}} [opts] - jsonMode asks
 *   the model to return a JSON object; not every free model honours response_format, so
 *   callers must still parse defensively. maxTokens raises the output cap above whatever
 *   the provider defaults to — non-Latin scripts (Devanagari, Perso-Arabic) take materially
 *   more tokens per character of meaning than English/Roman script, so callers generating
 *   long structured JSON in those scripts should pass a higher value.
 * @returns {Promise<{content: string, finishReason: string|null, model: string}>}
 */
export async function chatCompletionWithMeta(messages, opts = {}) {
  const token = getToken(); // outside the try/catch: a missing key is a config error, not a network failure
  const primary = opts.model || process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  // Only chain through fallbacks when the caller didn't pin an explicit model.
  const chain = opts.model ? [primary] : [primary, ...FALLBACK_MODELS.filter((m) => m !== primary)];

  let lastErr;
  for (const model of chain) {
    try {
      return await callModel(model, messages, opts, token);
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

/**
 * @param {Array<{role: string, content: string}>} messages
 * @param {{model?: string, jsonMode?: boolean, maxTokens?: number}} [opts]
 * @returns {Promise<string>} the raw assistant message content — see chatCompletionWithMeta
 *   for finish_reason/model when a caller needs to detect truncation.
 */
export async function chatCompletion(messages, opts = {}) {
  const { content } = await chatCompletionWithMeta(messages, opts);
  return content;
}
