// Thin Qdrant REST client (no SDK dependency). Works with Qdrant Cloud's free tier
// (1 GB, no card) or a self-hosted container: set QDRANT_URL (+ QDRANT_API_KEY for cloud).
//
// Budget design: 768-d embeddings, int8 scalar quantization (≈4× less RAM) and
// payloads on disk, so the free cluster comfortably holds a few hundred thousand passages.

export const VECTOR_SIZE = 768;

export class QdrantError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "QdrantError";
    this.status = status;
  }
}

export interface QdrantPoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

export interface QdrantHit {
  id: string;
  score: number;
  payload: Record<string, unknown>;
}

export interface QdrantFilter {
  must: { key: string; match: { value: unknown } }[];
}

// Every network call here is a billed Qdrant request -- the app this package was extracted
// from tracks per-provider call counts for an admin cost dashboard, but that tracker is the
// app's own concern, not this package's. Each app wires its own hook once at boot (or leaves
// it unset, a no-op) instead of this package importing a specific app's observability code.
let onRequest: (() => void) | null = null;

export function setQdrantRequestHook(hook: (() => void) | null): void {
  onRequest = hook;
}

export function isQdrantConfigured(): boolean {
  return Boolean(process.env.QDRANT_URL);
}

export function legalCollection(): string {
  return process.env.QDRANT_COLLECTION || "vidhira_legal";
}

export function clauseCollection(): string {
  return process.env.QDRANT_CLAUSE_COLLECTION || "vidhira_clauses";
}

async function qdrant(method: string, path: string, body?: unknown, { allow404 = false }: { allow404?: boolean } = {}): Promise<any> {
  const base = (process.env.QDRANT_URL || "").replace(/\/+$/, "");
  if (!base) throw new QdrantError("QDRANT_URL is not set", 0);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.QDRANT_API_KEY) headers["api-key"] = process.env.QDRANT_API_KEY;

  // Everything from the network call through parsing the body lives in one try/catch —
  // the AbortSignal timeout can fire just as easily while the body is still streaming in
  // as during the initial fetch, and both must come out as a QdrantError, never escape
  // raw (see the equivalent fix in openRouter.js/indianKanoon.js for the bug this guards).
  try {
    const res = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
    onRequest?.();
    if (res.status === 404 && allow404) return { status: 404 };
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new QdrantError(`Qdrant ${method} ${path} failed (${res.status})${text ? `: ${text.slice(0, 300)}` : ""}`, res.status);
    }
    return await res.json();
  } catch (err) {
    if (err instanceof QdrantError) throw err;
    throw new QdrantError(`Network error calling Qdrant: ${(err as Error).message}`, 0);
  }
}

const ensured = new Map<string, string[]>(); // collection -> keyword indexes it was created with

/** Creates the collection (and payload indexes) on first use. Idempotent. */
export async function ensureCollection(name: string, keywordIndexes: string[] = []): Promise<void> {
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

export async function upsertPoints(collection: string, points: QdrantPoint[], batchSize = 64): Promise<void> {
  for (let i = 0; i < points.length; i += batchSize) {
    const body = { points: points.slice(i, i + batchSize) };
    try {
      await qdrant("PUT", `/collections/${collection}/points?wait=true`, body);
    } catch (err) {
      // The collection was deleted behind our back (e.g. the cluster was recreated): rebuild it once and retry.
      if ((err as QdrantError).status !== 404 || !ensured.has(collection)) throw err;
      const indexes = ensured.get(collection)!;
      ensured.delete(collection);
      await ensureCollection(collection, indexes);
      await qdrant("PUT", `/collections/${collection}/points?wait=true`, body);
    }
  }
}

export async function queryPoints(
  collection: string,
  vector: number[],
  { limit = 8, filter, scoreThreshold }: { limit?: number; filter?: QdrantFilter; scoreThreshold?: number } = {}
): Promise<QdrantHit[]> {
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

export async function deletePoints(collection: string, filter: QdrantFilter): Promise<void> {
  await qdrant("POST", `/collections/${collection}/points/delete?wait=true`, { filter });
}

export async function collectionStats(collection: string): Promise<{ exists: boolean; points: number; status?: string }> {
  const res = await qdrant("GET", `/collections/${collection}`, undefined, { allow404: true });
  if (res.status === 404) return { exists: false, points: 0 };
  return { exists: true, points: res.result?.points_count ?? 0, status: res.result?.status };
}

export function matchFilter(key: string, value: unknown): QdrantFilter {
  return { must: [{ key, match: { value } }] };
}
