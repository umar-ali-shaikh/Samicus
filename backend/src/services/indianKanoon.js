// Indian Kanoon API client (api.indiankanoon.org/documentation). Every function here
// costs real money per call — always goes through the cache in this file, and callers
// must never bypass it by hitting BASE_URL directly.
import { buildFormInput } from "./indianKanoonFilters.js";
import { createCache } from "../utils/cache.js";
import { sanitizeJudgmentHtml } from "../utils/sanitizeHtml.js";
import { increment } from "../utils/callCounter.js";

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
    let res;
    try {
      res = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Token ${token}`,
          Accept: "application/json",
        },
      });
    } catch (networkErr) {
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_BASE_DELAY_MS * (attempt + 1));
        attempt += 1;
        continue;
      }
      throw new IndianKanoonApiError(`Network error calling Indian Kanoon: ${networkErr.message}`, 0);
    }

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
    return res.json();
  }
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
    docs: (result.docs || []).map((doc) => ({ ...doc, headline: sanitizeJudgmentHtml(doc.headline) })),
  };
}

/**
 * Full judgment text plus top citations.
 * @param {string|number} docid
 * @param {number} [maxcites] - up to 50.
 * @param {number} [maxcitedby] - up to 50.
 * @returns {Promise<{doc: string, title: string, citeList: any[], citedbyList: any[]}>}
 */
export async function getDocument(docid, maxcites, maxcitedby) {
  const params = new URLSearchParams();
  if (maxcites) params.set("maxcites", String(Math.min(maxcites, 50)));
  if (maxcitedby) params.set("maxcitedby", String(Math.min(maxcitedby, 50)));
  const qs = params.toString();

  const cacheKey = `doc:${docid}:${qs}`;
  const result = await cache.getOrSet(cacheKey, DOC_TTL_MS, () => postToIndianKanoon(`/doc/${docid}/${qs ? `?${qs}` : ""}`));

  return { ...result, doc: sanitizeJudgmentHtml(result.doc) };
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
