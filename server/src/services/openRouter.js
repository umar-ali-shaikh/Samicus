// Thin OpenRouter chat-completions client shared by every service that needs an LLM call
// (query understanding, grounded answer generation). Centralised here so auth/error
// handling behaves identically everywhere instead of being copy-pasted per call site.
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

function getToken() {
  const token = process.env.OPENROUTER_API_KEY;
  if (!token) throw new OpenRouterAuthError();
  return token;
}

async function callModel(model, messages, jsonMode, token) {
  const body = { model, messages };
  if (jsonMode) body.response_format = { type: "json_object" };

  let res;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    throw new OpenRouterApiError(`Network error calling OpenRouter: ${networkErr.message}`, 0);
  }

  if (res.status === 401 || res.status === 403) throw new OpenRouterAuthError();

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new OpenRouterApiError(`OpenRouter API error ${res.status}${text ? `: ${text}` : ""}`, res.status);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
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
      // Only a rate limit is worth trying the next model for — an auth problem or a
      // non-429 API error will fail the same way on every model in the chain.
      if (err.status !== 429) throw err;
    }
  }
  throw lastErr;
}
