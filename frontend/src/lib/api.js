import { supabase } from "./supabase";

// Always same-origin "/api": in production the server serves the built client and the API from one
// process; in development Vite proxies /api to the backend (see vite.config.js), so there is no CORS
// to configure. Override with VITE_API_BASE_URL only for a split deployment.
export const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

export class ApiError extends Error {
  constructor(message, status, code, body) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

const listeners = new Set();
/** Called when the API says the session is gone/unverified, so the shell can react. */
export function onAuthFailure(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function accessToken() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

async function request(method, path, { body, query, form, raw } = {}) {
  const token = await accessToken();
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);

  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res;
  try {
    res = await fetch(url, { method, headers, body: form || (body !== undefined ? JSON.stringify(body) : undefined) });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0, "NETWORK");
  }
  if (raw && res.ok) return res;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new ApiError(data?.error || `Request failed (${res.status})`, res.status, data?.code, data);
    if (res.status === 401 || err.code === "EMAIL_NOT_VERIFIED") listeners.forEach((fn) => fn(err));
    throw err;
  }
  return data;
}

export const api = {
  get: (path, query) => request("GET", path, { query }),
  post: (path, body) => request("POST", path, { body: body ?? {} }),
  put: (path, body) => request("PUT", path, { body }),
  patch: (path, body) => request("PATCH", path, { body }),
  delete: (path) => request("DELETE", path, {}),
  upload: (path, form) => request("POST", path, { form }),
  /** Downloads an authenticated binary (DOCX/PDF) and hands it to the browser as a file. */
  async download(path, filename, method = "GET") {
    const res = await request(method, path, { raw: true });
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  },
};
