import "server-only";
import { createServerSupabaseClient } from "./supabase";
import { env } from "./env";

/**
 * Typed server-side client for calling apps/api. Mirrors frontend/src/lib/api.js's ApiError
 * shape and method set (get/post/put/patch/delete) so error handling stays familiar, but runs
 * only on the server: reads the session from HttpOnly cookies, forwards the access token as
 * Authorization: Bearer, and adds X-Request-Id -- per docs/architecture/01-target-architecture.md
 * section 2 ("the browser never calls Express directly").
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly body?: unknown;

  constructor(message: string, status: number, code?: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

async function accessToken(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

type QueryValue = string | number | boolean | undefined | null;

interface RequestOptions {
  body?: unknown;
  query?: Record<string, QueryValue>;
}

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const token = await accessToken();
  const url = new URL(`${env.API_INTERNAL_URL}/api${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = { "X-Request-Id": crypto.randomUUID() };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0, "NETWORK");
  }

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const errBody = data as { error?: string; code?: string } | null;
    throw new ApiError(errBody?.error ?? `Request failed (${res.status})`, res.status, errBody?.code, data);
  }
  return data as T;
}

export const apiClient = {
  get: <T>(path: string, query?: RequestOptions["query"]) => request<T>("GET", path, { query }),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, { body: body ?? {} }),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, { body }),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
