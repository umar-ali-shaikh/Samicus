// Indian Kanoon API client (api.indiankanoon.org/documentation). Every function here
// costs real money per call — always goes through the cache in this file, and callers
// must never bypass it by hitting BASE_URL directly.
import { buildFormInput } from "./indianKanoonFilters.js";
import { createCache } from "../utils/cache.js";
import { sanitizeJudgmentHtml } from "../utils/sanitizeHtml.js";
import { increment } from "../utils/callCounter.js";
import { stripTags } from "./rag/chunk.js";

const BASE_URL = "https://api.indiankanoon.org";

// Case content is effectively immutable once published; search result sets can shift
// as new judgments are indexed, so they get a shorter TTL.
const DOC_TTL_MS = 24 * 60 * 60 * 1000; // 24h — doc/origdoc/docmeta
const SEARCH_TTL_MS = 60 * 60 * 1000; // 1h — search/docfragment

const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 300;

const cache = createCache();

export class IndianKanoonAuthError extends Error {
  constructor(message = "Indian Kanoon API rejected the request: invalid or missing API token") {
    super(message);
    this.name = "IndianKanoonAuthError";
  }
}

export class IndianKanoonApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "IndianKanoonApiError";
    this.status = status;
  }
}

function getToken() {
  const token = process.env.IK_API_TOKEN;
  if (!token) throw new IndianKanoonAuthError("Missing IK_API_TOKEN environment variable");
  return token;
}

export function isIndianKanoonConfigured() {
  return Boolean(process.env.IK_API_TOKEN);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

// POSTs to `path` with retry on network errors and 5xx (never on 4xx — those won't
// succeed on retry, and 403 specifically means "bad token", not "try again").
async function postToIndianKanoon(path) {
  const token = getToken(); // outside the retry loop's try/catch: a missing token is a
  // config error, not a network failure, and must never be retried or miscategorized.
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Everything from the network call through parsing the body lives in one try/catch —
    // the AbortSignal timeout can fire just as easily while the body is still streaming in
    // (observed in production: a bare, unclassified DOMException [TimeoutError] out of
    // res.json() with no application frames in its stack) as during the initial fetch,
    // and both must be retried/classified the same way, never escape raw.
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Token ${token}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(20000),
      });

      if (res.status === 403) {
        throw new IndianKanoonAuthError();
      }

      if (res.status >= 500 && attempt < MAX_RETRIES) {
        await sleep(RETRY_BASE_DELAY_MS * (attempt + 1));
        attempt += 1;
        continue;
      }

      if (!res.ok) {
        const body = await safeText(res);
        throw new IndianKanoonApiError(`Indian Kanoon API error ${res.status}${body ? `: ${body}` : ""}`, res.status);
      }

      increment("indianKanoon"); // only successful, cache-missed calls are the ones actually billed
      return await res.json();
    } catch (err) {
      if (err instanceof IndianKanoonAuthError || err instanceof IndianKanoonApiError) throw err;
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_BASE_DELAY_MS * (attempt + 1));
        attempt += 1;
        continue;
      }
      throw new IndianKanoonApiError(`Network error calling Indian Kanoon: ${err.message}`, 0);
    }
  }
}

// Indian Kanoon's `found` is documented as a count but the live API sometimes returns a
// range string instead (e.g. "1 - 10 of 9836") — `results?.found || 0` (and the equivalent
// raw pass-through here) then sees a non-numeric value, `Number("1 - 10 of 9836")` is NaN,
// and every numeric comparison downstream (pagination.js's `found > PAGE_SIZE`, "found
// results" text) silently breaks: CaseLaw.jsx showed "0 results" and hid the Previous/Next
// controls even with thousands of real hits. Take the trailing number (the actual total)
// out of either shape and always return a real number.
function parseFound(found) {
  if (typeof found === "number") return found;
  const match = String(found ?? "").replace(/,/g, "").match(/(\d+)\s*$/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Full-text case search.
 * @param {string} query - free text; may include ANDD/ORR/NOTT/"phrase" operators.
 * @param {import("./indianKanoonFilters.js").CaseLawFilters} [filters]
 * @param {number} [pagenum=0] - 0-based page number.
 * @param {number} [maxpages] - fetch multiple pages in one call (hard cap 1000; billed per page returned).
 * @returns {Promise<{found: number, docs: Array<{tid: number, title: string, headline: string, docsource: string, docsize: number}>, categories: any[]}>}
 */
export async function search(query, filters = {}, pagenum = 0, maxpages) {
  const formInput = buildFormInput(query, filters);
  const params = new URLSearchParams({ formInput, pagenum: String(pagenum) });
  if (maxpages) params.set("maxpages", String(Math.min(maxpages, 1000)));

  const cacheKey = `search:${params.toString()}`;
  const result = await cache.getOrSet(cacheKey, SEARCH_TTL_MS, () => postToIndianKanoon(`/search/?${params.toString()}`));

  return {
    ...result,
    found: parseFound(result.found),
    // Indian Kanoon wraps the search term it matched in <b> inside `title` the same way it
    // does `headline` — but unlike headline (rendered as sanitized HTML, see
    // sanitizeJudgmentHtml), every consumer of `title` (CaseLaw.jsx, the AI Assistant's
    // evidence/sources list) renders it as plain text, so a literal "<b>" would show up as
    // visible characters rather than bolding. Strip it fully here, once, for every caller —
    // CaseLaw search, and legalAssistant.js's Stage 3 Indian Kanoon fallback both go through
    // this same function.
    docs: (result.docs || []).map((doc) => ({ ...doc, title: stripTags(doc.title), headline: sanitizeJudgmentHtml(doc.headline) })),
  };
}

/**
 * Full judgment text plus top citations.
 * @param {string|number} docid
 * @param {number} [maxcites] - up to 50.
 * @param {number} [maxcitedby] - up to 50.
 * @returns {Promise<{doc: string, title: string, citeList: any[], citedbyList: any[]}>}
 */
async function fetchDocument(docid, maxcites, maxcitedby) {
  const params = new URLSearchParams();
  if (maxcites) params.set("maxcites", String(Math.min(maxcites, 50)));
  if (maxcitedby) params.set("maxcitedby", String(Math.min(maxcitedby, 50)));
  const qs = params.toString();

  const cacheKey = `doc:${docid}:${qs}`;
  return cache.getOrSet(cacheKey, DOC_TTL_MS, () => postToIndianKanoon(`/doc/${docid}/${qs ? `?${qs}` : ""}`));
}

export async function getDocument(docid, maxcites, maxcitedby) {
  const result = await fetchDocument(docid, maxcites, maxcitedby);
  return { ...result, title: stripTags(result.title), doc: sanitizeJudgmentHtml(result.doc) };
}

/**
 * Un-sanitized document HTML for server-side indexing only (never send this to a browser):
 * the sanitizer strips the `title` attributes that mark Fact / Issue / Reasoning paragraphs.
 */
export async function getDocumentRaw(docid) {
  return fetchDocument(docid);
}

/**
 * The original scanned court copy (as opposed to Indian Kanoon's transcribed HTML).
 * @param {string|number} docid
 */
export async function getOriginalDocument(docid) {
  const cacheKey = `origdoc:${docid}`;
  const result = await cache.getOrSet(cacheKey, DOC_TTL_MS, () => postToIndianKanoon(`/origdoc/${docid}/`));
  return result.doc !== undefined ? { ...result, doc: sanitizeJudgmentHtml(result.doc) } : result;
}

/**
 * Matching snippets for a query within one document.
 * @param {string|number} docid
 * @param {string} query
 */
export async function getFragment(docid, query) {
  const params = new URLSearchParams({ formInput: query });
  const cacheKey = `docfragment:${docid}:${params.toString()}`;
  const result = await cache.getOrSet(cacheKey, SEARCH_TTL_MS, () => postToIndianKanoon(`/docfragment/${docid}/?${params.toString()}`));

  if (Array.isArray(result.headlines)) {
    return { ...result, headlines: result.headlines.map((h) => sanitizeJudgmentHtml(h)) };
  }
  return result.headline !== undefined ? { ...result, headline: sanitizeJudgmentHtml(result.headline) } : result;
}

/**
 * Metadata only (no judgment text) — the cheapest call.
 * @param {string|number} docid
 */
export async function getMetainfo(docid) {
  const cacheKey = `docmeta:${docid}`;
  return cache.getOrSet(cacheKey, DOC_TTL_MS, () => postToIndianKanoon(`/docmeta/${docid}/`));
}

// Test-only: clears the module-level cache so tests don't leak state into each other.
export function __resetCacheForTests() {
  cache.clear();
}
