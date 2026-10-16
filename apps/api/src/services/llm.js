// The one seam between the app and a chat-completion provider. LLM_PROVIDER picks it:
// "openrouter" (default) or "anthropic". Every caller imports from here, never from a provider
// module directly, so switching providers is an env change, not a code change. Both providers
// throw the same error classes (OpenRouterAuthError / OpenRouterApiError -- named for the
// original provider, kept to avoid churning every caller's catch blocks).
//
// Embeddings are not part of this switch: they stay on OpenRouter (@vidhira/rag/embeddings),
// since Qdrant's stored vectors are tied to that embedding model.
import { chatCompletionWithMeta as openRouterChat, isOpenRouterConfigured } from "./openRouter.js";
import { chatCompletionWithMeta as anthropicChat, isAnthropicConfigured } from "./anthropic.js";

export { OpenRouterAuthError, OpenRouterApiError } from "./openRouter.js";

const useAnthropic = () => process.env.LLM_PROVIDER === "anthropic";

/** Whether the selected provider has a key configured. */
export function isLlmConfigured() {
  return useAnthropic() ? isAnthropicConfigured() : isOpenRouterConfigured();
}

/**
 * @param {Array<{role: string, content: string}>} messages
 * @param {{model?: string, jsonMode?: boolean, maxTokens?: number}} [opts]
 * @returns {Promise<{content: string, finishReason: string|null, model: string}>}
 */
export function chatCompletionWithMeta(messages, opts = {}) {
  return useAnthropic() ? anthropicChat(messages, opts) : openRouterChat(messages, opts);
}

/**
 * @param {Array<{role: string, content: string}>} messages
 * @param {{model?: string, jsonMode?: boolean, maxTokens?: number}} [opts]
 * @returns {Promise<string>}
 */
export async function chatCompletion(messages, opts = {}) {
  const { content } = await chatCompletionWithMeta(messages, opts);
  return content;
}
