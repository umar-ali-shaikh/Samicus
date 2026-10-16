// Anthropic (Claude) chat provider, selected with LLM_PROVIDER=anthropic -- see services/llm.js.
// Same call shape as openRouter.js's chatCompletionWithMeta (OpenAI-style {role, content}
// messages in, {content, finishReason, model} out) and the same error classes, so every caller
// keeps its existing error handling unchanged.
import Anthropic from "@anthropic-ai/sdk";
import { increment } from "../utils/callCounter.js";
import { OpenRouterAuthError, OpenRouterApiError } from "./openRouter.js";

const DEFAULT_CLAUDE_MODEL = "claude-opus-5-5";
// Opus 5.5 defaults to "medium" effort; set it explicitly so a model change doesn't silently
// change spend. CLAUDE_EFFORT overrides it (low | medium | high | xhigh | max).
const DEFAULT_EFFORT = "medium";
// Thinking is always on for current Claude models and counts against max_tokens, so callers'
// output caps (sized for OpenRouter models that don't think) are raised to at least this.
const MIN_MAX_TOKENS = 16000;

const JSON_INSTRUCTION = "Respond with a single JSON object only — no prose before or after it, no code fences.";

let client;

export function isAnthropicConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) throw new OpenRouterAuthError("AI generation is unavailable: invalid or missing Anthropic API key");
  client ||= new Anthropic({ timeout: 60_000, maxRetries: 1 });
  return client;
}

// Test-only: lets a test inject a stub client (and reset to a fresh real one).
export function __setAnthropicClientForTests(stub) {
  client = stub;
}

// SDK errors -> the shared provider error classes every caller already handles.
function toProviderError(err) {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new OpenRouterAuthError("AI generation is unavailable: invalid or missing Anthropic API key");
  }
  if (err instanceof Anthropic.APIConnectionError) return new OpenRouterApiError(`Network error calling Anthropic: ${err.message}`, 0);
  if (err instanceof Anthropic.APIError) return new OpenRouterApiError(`Anthropic API error ${err.status}: ${err.message}`, err.status ?? 0);
  return err;
}

/**
 * OpenAI-style messages -> Messages API request: system turns are lifted into `system`
 * (the API has no "system" role at the top of `messages`), everything else passes through.
 */
function toRequest(messages, opts) {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content);
  if (opts.jsonMode) system.push(JSON_INSTRUCTION);
  return {
    system: system.join("\n\n") || undefined,
    messages: messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
  };
}

/**
 * @param {Array<{role: string, content: string}>} messages
 * @param {{model?: string, jsonMode?: boolean, maxTokens?: number}} [opts] - `model` is only
 *   honoured when it names a Claude model; an OpenRouter slug pinned by a caller (e.g.
 *   OPENROUTER_FALLBACK_MODEL) is ignored in favour of CLAUDE_MODEL.
 * @returns {Promise<{content: string, finishReason: string|null, model: string}>}
 */
export async function chatCompletionWithMeta(messages, opts = {}) {
  const anthropic = getClient(); // outside the try/catch: a missing key is a config error
  const model = opts.model?.startsWith("claude-") ? opts.model : process.env.CLAUDE_MODEL || DEFAULT_CLAUDE_MODEL;
  const { system, messages: turns } = toRequest(messages, opts);

  let response;
  try {
    response = await anthropic.beta.messages.create({
      model,
      max_tokens: Math.max(opts.maxTokens || 0, MIN_MAX_TOKENS),
      ...(system ? { system } : {}),
      messages: turns,
      output_config: { effort: process.env.CLAUDE_EFFORT || DEFAULT_EFFORT },
      // On a safety decline the API re-runs the request on a fallback model it picks by
      // refusal category, inside the same call -- no model list to maintain here.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  } catch (err) {
    throw toProviderError(err);
  }

  await increment("anthropic");
  // Even after fallbacks, the whole chain can decline -- surfaced as an API error so callers
  // take the same "generation failed" path they already have, rather than showing empty text.
  if (response.stop_reason === "refusal") {
    throw new OpenRouterApiError(`Anthropic declined the request${response.stop_details?.category ? ` (${response.stop_details.category})` : ""}`, 200);
  }
  const content = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  const finishReason = response.stop_reason === "max_tokens" ? "length" : response.stop_reason;
  if (finishReason === "length") console.warn(`Anthropic: response truncated (stop_reason=max_tokens) for model ${response.model} — consider raising max_tokens.`);
  return { content, finishReason, model: response.model };
}

const TRANSCRIBE_INSTRUCTION =
  "Transcribe all of the text in this document verbatim, in reading order, page by page. Keep clause numbers and headings on their own lines. Output only the document's text — no commentary, no summary, no markdown.";

/**
 * OCR for scanned/image-only PDFs (services/docText.js, opt-in via DOCUMENT_OCR=anthropic):
 * Claude reads the PDF pages directly and returns a verbatim transcription. Streamed, since a
 * long contract's transcription can be large. Throws the same error classes as
 * chatCompletionWithMeta.
 * @param {Buffer} buffer
 * @returns {Promise<string>}
 */
export async function transcribePdf(buffer) {
  const anthropic = getClient();
  let response;
  try {
    response = await anthropic.beta.messages
      .stream({
        model: process.env.CLAUDE_MODEL || DEFAULT_CLAUDE_MODEL,
        max_tokens: 64000,
        output_config: { effort: "low" }, // transcription, not reasoning
        messages: [
          {
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") } },
              { type: "text", text: TRANSCRIBE_INSTRUCTION },
            ],
          },
        ],
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      })
      .finalMessage();
  } catch (err) {
    throw toProviderError(err);
  }
  await increment("anthropic");
  if (response.stop_reason === "refusal") throw new OpenRouterApiError("Anthropic declined to transcribe this document", 200);
  return response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}
