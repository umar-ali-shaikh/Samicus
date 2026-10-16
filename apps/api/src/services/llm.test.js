// services/llm.js's provider switch and services/anthropic.js's adapter, against a stub
// Anthropic client -- no real API call, no key needed.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { chatCompletion, chatCompletionWithMeta, isLlmConfigured, OpenRouterAuthError, OpenRouterApiError } from "./llm.js";
import { __setAnthropicClientForTests } from "./anthropic.js";

const saved = { LLM_PROVIDER: process.env.LLM_PROVIDER, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY, CLAUDE_MODEL: process.env.CLAUDE_MODEL };
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  __setAnthropicClientForTests(undefined);
});

function stubClient(respond) {
  const calls = [];
  return {
    calls,
    beta: {
      messages: {
        create: async (req) => {
          calls.push(req);
          return respond(req);
        },
      },
    },
  };
}

const ok = (text, extra = {}) => ({ model: "claude-opus-5-5", stop_reason: "end_turn", stop_details: null, content: [{ type: "thinking", thinking: "" }, { type: "text", text }], ...extra });

test("isLlmConfigured follows the selected provider's key", () => {
  delete process.env.LLM_PROVIDER;
  process.env.OPENROUTER_API_KEY = "or-key";
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(isLlmConfigured(), true);
  process.env.LLM_PROVIDER = "anthropic";
  assert.equal(isLlmConfigured(), false, "OpenRouter's key doesn't count for the anthropic provider");
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  assert.equal(isLlmConfigured(), true);
});

test("anthropic: system turns are lifted into `system`, jsonMode adds a JSON instruction, thinking blocks are dropped from the text", async () => {
  process.env.LLM_PROVIDER = "anthropic";
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  const stub = stubClient(() => ok('{"a":1}'));
  __setAnthropicClientForTests(stub);

  const out = await chatCompletion([{ role: "system", content: "Be brief." }, { role: "user", content: "Hi" }], { jsonMode: true, maxTokens: 4000 });
  assert.equal(out, '{"a":1}');
  const req = stub.calls[0];
  assert.equal(req.model, "claude-opus-5-5");
  assert.match(req.system, /^Be brief\.\n\n.*single JSON object/s);
  assert.deepEqual(req.messages, [{ role: "user", content: "Hi" }]);
  assert.equal(req.max_tokens, 16000, "callers' small caps are raised, since thinking counts against max_tokens");
  assert.deepEqual(req.output_config, { effort: "medium" });
  assert.equal(req.fallbacks, "default");
  assert.deepEqual(req.betas, ["server-side-fallback-2026-07-01"]);
});

test("anthropic: an OpenRouter model pinned by a caller is ignored; CLAUDE_MODEL wins; a claude- model is honoured", async () => {
  process.env.LLM_PROVIDER = "anthropic";
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  process.env.CLAUDE_MODEL = "claude-sonnet-5-5";
  const stub = stubClient(() => ok("x"));
  __setAnthropicClientForTests(stub);
  await chatCompletion([{ role: "user", content: "q" }], { model: "openai/gpt-oss-20b" });
  await chatCompletion([{ role: "user", content: "q" }], { model: "claude-haiku-5-5" });
  assert.deepEqual(stub.calls.map((c) => c.model), ["claude-sonnet-5-5", "claude-haiku-5-5"]);
});

test("anthropic: max_tokens maps to finishReason 'length'; a refusal becomes an OpenRouterApiError", async () => {
  process.env.LLM_PROVIDER = "anthropic";
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  __setAnthropicClientForTests(stubClient(() => ok("partial", { stop_reason: "max_tokens" })));
  const meta = await chatCompletionWithMeta([{ role: "user", content: "q" }]);
  assert.equal(meta.finishReason, "length");

  __setAnthropicClientForTests(stubClient(() => ok("", { stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber", explanation: null } })));
  await assert.rejects(chatCompletion([{ role: "user", content: "q" }]), (err) => err instanceof OpenRouterApiError && /declined.*cyber/.test(err.message));
});

test("anthropic: a missing key or a 401 is an OpenRouterAuthError; other API errors keep their status", async () => {
  process.env.LLM_PROVIDER = "anthropic";
  delete process.env.ANTHROPIC_API_KEY;
  await assert.rejects(chatCompletion([{ role: "user", content: "q" }]), OpenRouterAuthError);

  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  const headers = new Headers();
  __setAnthropicClientForTests(stubClient(() => { throw new Anthropic.AuthenticationError(401, { type: "error", error: { type: "authentication_error", message: "bad key" } }, "bad key", headers); }));
  await assert.rejects(chatCompletion([{ role: "user", content: "q" }]), OpenRouterAuthError);

  __setAnthropicClientForTests(stubClient(() => { throw new Anthropic.RateLimitError(429, { type: "error", error: { type: "rate_limit_error", message: "slow down" } }, "slow down", headers); }));
  await assert.rejects(chatCompletion([{ role: "user", content: "q" }]), (err) => err instanceof OpenRouterApiError && err.status === 429);
});
