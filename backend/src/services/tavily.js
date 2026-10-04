// Thin Tavily web-search client — Stage 4 of the legal assistant's evidence pipeline
// (see legalAssistant.js). Tavily fills in practical details Indian Kanoon's case-law/
// bare-act corpus doesn't carry: procedure, helplines, free legal aid, forms, time
// limits. Restricted to a trusted-domain allowlist so the pipeline never grounds an
// answer in an arbitrary web page. Genuinely optional: unset TAVILY_API_KEY and this
// stage is skipped, same pattern as Qdrant/Gemini/Razorpay elsewhere in the app.
import { increment } from "../utils/callCounter.js";

const TAVILY_URL = "https://api.tavily.com/search";

// Official/authoritative Indian legal and government sources only — never a random
// blog, forum, or law-firm marketing page. Override per-call if a narrower set fits.
export const TRUSTED_DOMAINS = [
  "indiacode.nic.in",
  "legislative.gov.in",
  "sci.gov.in",
  "nalsa.gov.in",
  "consumerhelpline.gov.in",
  "ecourts.gov.in",
  "indiankanoon.org",
];

export class TavilyAuthError extends Error {
  constructor(message = "Web search is unavailable: invalid or missing TAVILY_API_KEY") {
    super(message);
    this.name = "TavilyAuthError";
  }
}

export class TavilyApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "TavilyApiError";
    this.status = status;
  }
}

export function isTavilyConfigured() {
  return Boolean(process.env.TAVILY_API_KEY);
}

/**
 * @param {string} query
 * @param {{ maxResults?: number, domains?: string[] }} [opts]
 * @returns {Promise<{title: string, url: string, content: string, score: number|null}[]>}
 */
export async function searchTavily(query, { maxResults = 5, domains = TRUSTED_DOMAINS } = {}) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new TavilyAuthError();

  let res;
  try {
    res = await fetch(TAVILY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query,
        search_depth: "advanced",
        max_results: maxResults,
        include_domains: domains,
        include_answer: false,
        include_raw_content: false,
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (networkErr) {
    throw new TavilyApiError(`Network error calling Tavily: ${networkErr.message}`, 0);
  }

  if (res.status === 401 || res.status === 403) throw new TavilyAuthError();
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new TavilyApiError(`Tavily API error ${res.status}${text ? `: ${text}` : ""}`, res.status);
  }

  increment("tavily");
  const data = await res.json();
  // Web text is untrusted data, never instructions — plain string fields only, nothing
  // from this response is ever interpreted as control flow.
  return (data.results || []).map((r) => ({
    title: String(r.title || r.url || "").trim(),
    url: String(r.url || ""),
    content: String(r.content || "").trim(),
    score: typeof r.score === "number" ? r.score : null,
  }));
}
