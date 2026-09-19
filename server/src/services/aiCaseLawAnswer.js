// Grounds an AI-generated answer in real Indian Kanoon search results: search first,
// then hand the top hits to an LLM (via OpenRouter's free tier) as its only context, so
// the model can cite real cases instead of inventing them.
import { search } from "./indianKanoon.js";
import { chatCompletion, OpenRouterAuthError, OpenRouterApiError } from "./openRouter.js";
import { createCache } from "../utils/cache.js";

const ANSWER_TTL_MS = 60 * 60 * 1000; // 1h — matches search's TTL, same staleness tradeoff

const cache = createCache();

export { OpenRouterAuthError, OpenRouterApiError };

function buildMessages(question, docs) {
  const context = docs.map((d, i) => `[${i + 1}] ${d.title} (${d.docsource})\n${d.headline.replace(/<[^>]+>/g, "")}`).join("\n\n");

  return [
    {
      role: "system",
      content:
        "You are a legal research assistant for Indian law. Answer the question using ONLY the numbered case excerpts provided as context — never rely on outside knowledge. Cite sources inline like [1], [2]. If the excerpts don't contain enough to answer, say so plainly instead of guessing.",
    },
    { role: "user", content: `Question: ${question}\n\nCase excerpts:\n${context}` },
  ];
}

/**
 * Search Indian Kanoon for `question`, then ask an LLM to answer it grounded in the
 * top results.
 * @param {string} question
 * @param {import("./indianKanoonFilters.js").CaseLawFilters} [filters]
 * @param {number} [topN=5]
 * @returns {Promise<{outcome: "answered"|"not_found", answer: string, sources: Array<{tid: number, title: string, docsource: string}>}>}
 */
export async function answerCaseLawQuestion(question, filters = {}, topN = 5) {
  const cacheKey = `answer:${question}:${JSON.stringify(filters)}:${topN}`;

  return cache.getOrSet(cacheKey, ANSWER_TTL_MS, async () => {
    const { docs } = await search(question, filters, 0, 1);
    const top = (docs || []).slice(0, topN);

    if (top.length === 0) {
      return { outcome: "not_found", answer: "", sources: [] };
    }

    const answer = await chatCompletion(buildMessages(question, top));

    return {
      outcome: "answered",
      answer,
      sources: top.map((d) => ({ tid: d.tid, title: d.title, docsource: d.docsource })),
    };
  });
}

// Test-only: clears the module-level cache so tests don't leak state into each other.
export function __resetCacheForTests() {
  cache.clear();
}
