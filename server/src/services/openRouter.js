// Thin OpenRouter chat-completions client shared by every service that needs an LLM call
// (query understanding, grounded answer generation). Centralised here so auth/error
// handling behaves identically everywhere instead of being copy-pasted per call site.
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// OpenRouter's free-tier catalogue changes; override via OPENROUTER_MODEL if this one
// gets retired or rate-limited.
export const DEFAULT_MODEL = "deepseek/deepseek-v4-flash-0731:free";

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

/**
 * @param {Array<{role: string, content: string}>} messages
 * @param {{model?: string, jsonMode?: boolean}} [opts] - jsonMode asks the model to return
 *   a JSON object; not every free model honours response_format, so callers must still
 *   parse defensively.
 * @returns {Promise<string>} the raw assistant message content.
 */
export async function chatCompletion(messages, opts = {}) {
  const token = getToken(); // outside the try/catch: a missing key is a config error, not a network failure
  const model = opts.model || process.env.OPENROUTER_MODEL || DEFAULT_MODEL;

  const body = { model, messages };
  if (opts.jsonMode) body.response_format = { type: "json_object" };

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
