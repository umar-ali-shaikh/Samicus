// Thin Qdrant REST client (no SDK dependency). Works with Qdrant Cloud's free tier
// (1 GB, no card) or a self-hosted container: set QDRANT_URL (+ QDRANT_API_KEY for cloud).
//
// Budget design: 768-d Gemini embeddings, int8 scalar quantization (≈4× less RAM) and
// payloads on disk, so the free cluster comfortably holds a few hundred thousand passages.
import { increment } from "../../utils/callCounter.js";

export const VECTOR_SIZE = 768;

export class QdrantError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "QdrantError";
    this.status = status;
  }
}

export function isQdrantConfigured() {
  return Boolean(process.env.QDRANT_URL);
}

export function legalCollection() {
  return process.env.QDRANT_COLLECTION || "vidhira_legal";
}

export function clauseCollection() {
  return process.env.QDRANT_CLAUSE_COLLECTION || "vidhira_clauses";
}

async function qdrant(method, path, body, { allow404 = false } = {}) {
  const base = (process.env.QDRANT_URL || "").replace(/\/+$/, "");
  if (!base) throw new QdrantError("QDRANT_URL is not set", 0);
  const headers = { "Content-Type": "application/json" };
  if (process.env.QDRANT_API_KEY) headers["api-key"] = process.env.QDRANT_API_KEY;

  // Everything from the network call through parsing the body lives in one try/catch —
  // the AbortSignal timeout can fire just as easily while the body is still streaming in
  // as during the initial fetch, and both must come out as a QdrantError, never escape
  // raw (see the equivalent fix in openRouter.js/indianKanoon.js for the bug this guards).
  try {
    const res = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
    increment("qdrant");
    if (res.status === 404 && allow404) return { status: 404 };
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new QdrantError(`Qdrant ${method} ${path} failed (${res.status})${text ? `: ${text.slice(0, 300)}` : ""}`, res.status);
    }
    return await res.json();
  } catch (err) {
    if (err instanceof QdrantError) throw err;
    throw new QdrantError(`Network error calling Qdrant: ${err.message}`, 0);
  }
}

const ensured = new Map(); // collection -> keyword indexes it was created with

/** Creates the collection (and payload indexes) on first use. Idempotent. */
export async function ensureCollection(name, keywordIndexes = []) {
  if (ensured.has(name)) return;
  const existing = await qdrant("GET", `/collections/${name}`, undefined, { allow404: true });
  if (existing.status === 404) {
    await qdrant("PUT", `/collections/${name}`, {
      vectors: { size: VECTOR_SIZE, distance: "Cosine", on_disk: false },
      quantization_config: { scalar: { type: "int8", always_ram: true } },
      on_disk_payload: true,
    });
    for (const field of keywordIndexes) {
      await qdrant("PUT", `/collections/${name}/index?wait=true`, { field_name: field, field_schema: "keyword" });
    }
  }
  ensured.set(name, keywordIndexes);
}

/** @param {{id: string, vector: number[], payload: object}[]} points */
export async function upsertPoints(collection, points, batchSize = 64) {
  for (let i = 0; i < points.length; i += batchSize) {
    const body = { points: points.slice(i, i + batchSize) };
    try {
      await qdrant("PUT", `/collections/${collection}/points?wait=true`, body);
    } catch (err) {
      // The collection was deleted behind our back (e.g. the cluster was recreated): rebuild it once and retry.
      if (err.status !== 404 || !ensured.has(collection)) throw err;
      const indexes = ensured.get(collection);
      ensured.delete(collection);
      await ensureCollection(collection, indexes);
      await qdrant("PUT", `/collections/${collection}/points?wait=true`, body);
    }
  }
}

/** @returns {Promise<{id: string, score: number, payload: object}[]>} */
export async function queryPoints(collection, vector, { limit = 8, filter, scoreThreshold } = {}) {
  const res = await qdrant("POST", `/collections/${collection}/points/query`, {
    query: vector,
    limit,
    with_payload: true,
    ...(filter ? { filter } : {}),
    ...(scoreThreshold !== undefined ? { score_threshold: scoreThreshold } : {}),
  }, { allow404: true });
  if (res.status === 404) return [];
  return res.result?.points || [];
}

export async function deletePoints(collection, filter) {
  await qdrant("POST", `/collections/${collection}/points/delete?wait=true`, { filter });
}

export async function collectionStats(collection) {
  const res = await qdrant("GET", `/collections/${collection}`, undefined, { allow404: true });
  if (res.status === 404) return { exists: false, points: 0 };
  return { exists: true, points: res.result?.points_count ?? 0, status: res.result?.status };
}

export function matchFilter(key, value) {
  return { must: [{ key, match: { value } }] };
}
