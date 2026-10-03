// A small in-memory stand-in for the parts of supabase-js the app uses, so routes and services
// can be tested without a live project. It is deliberately simple:
//   - filters: eq neq in is not(is|in) ilike gte lte lt contains
//   - order / limit / single / maybeSingle / count+head
//   - insert / update / delete / upsert (with optional unique rules → Postgres error 23505)
//   - per-table column defaults via `defaults` (the real schema's DEFAULTs are not read)
//   - embedded selects ("alias:table(cols)") are resolved only through the `embeds` hints you pass
// It does NOT emulate RLS, triggers, defaults other than id/created_at, or RPC functions.
import crypto from "crypto";

export function createFakeSupabase({ tables = {}, defaults = {}, unique = {}, embeds = {}, rpc = {}, authUsers = {}, storage = {} } = {}) {
  const db = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
  const table = (name) => (db[name] ||= []);

  function matches(row, filters) {
    return filters.every((f) => {
      const v = row[f.col];
      switch (f.op) {
        case "eq": return v === f.val;
        case "neq": return v !== f.val;
        case "in": return f.val.includes(v);
        case "is": return f.val === null ? v === null || v === undefined : v === f.val;
        case "notis": return f.val === null ? v !== null && v !== undefined : v !== f.val;
        case "notin": return !f.val.includes(v);
        case "ilike": return typeof v === "string" && new RegExp(`^${f.val.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".")}$`, "i").test(v);
        case "gte": return v >= f.val;
        case "lte": return v <= f.val;
        case "lt": return v < f.val;
        case "contains": return Array.isArray(v) && f.val.every((x) => v.includes(x));
        default: throw new Error(`fake supabase: unsupported op ${f.op}`);
      }
    });
  }

  function splitTopLevel(str) {
    const parts = [];
    let depth = 0, cur = "";
    for (const ch of str) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) { parts.push(cur.trim()); cur = ""; } else cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts;
  }

  function embed(name, row, selectStr) {
    let out = { ...row };
    // Column projection: plain identifiers in the select list restrict the returned columns.
    const parts = splitTopLevel(String(selectStr || "*"));
    if (!parts.includes("*") && !parts.some((p) => p.startsWith("*"))) {
      const keep = parts.filter((p) => /^\w+$/.test(p));
      out = Object.fromEntries(Object.entries(out).filter(([k]) => keep.includes(k)));
    }
    for (const m of String(selectStr || "").matchAll(/(\w+):?(\w+)?(!inner)?\(/g)) {
      const alias = m[2] ? m[1] : m[1];
      const resolver = embeds[`${name}.${alias}`];
      if (resolver) out[alias] = resolver(row, db);
    }
    return out;
  }

  function builder(name, mode, payload, opts = {}) {
    const state = { filters: [], order: null, limit: null, single: null, select: "*", head: false, count: false, returning: false, onConflict: null };
    const api = {
      select(cols = "*", o = {}) {
        state.select = cols;
        if (o.head) state.head = true;
        if (o.count) state.count = true;
        if (mode !== "select") state.returning = true;
        return api;
      },
      eq: (col, val) => (state.filters.push({ col, op: "eq", val }), api),
      neq: (col, val) => (state.filters.push({ col, op: "neq", val }), api),
      in: (col, val) => (state.filters.push({ col, op: "in", val }), api),
      is: (col, val) => (state.filters.push({ col, op: "is", val }), api),
      not: (col, op, val) => {
        if (op === "is") state.filters.push({ col, op: "notis", val });
        else if (op === "in") state.filters.push({ col, op: "notin", val: String(val).replace(/[()]/g, "").split(",") });
        else throw new Error(`fake supabase: unsupported not ${op}`);
        return api;
      },
      ilike: (col, val) => (state.filters.push({ col, op: "ilike", val }), api),
      gte: (col, val) => (state.filters.push({ col, op: "gte", val }), api),
      lte: (col, val) => (state.filters.push({ col, op: "lte", val }), api),
      lt: (col, val) => (state.filters.push({ col, op: "lt", val }), api),
      contains: (col, val) => (state.filters.push({ col, op: "contains", val }), api),
      order: (col, o = {}) => ((state.order = { col, asc: o.ascending !== false }), api),
      limit: (n) => ((state.limit = n), api),
      single: () => ((state.single = "single"), api),
      maybeSingle: () => ((state.single = "maybe"), api),
      then(resolve, reject) {
        try {
          resolve(run());
        } catch (e) {
          reject(e);
        }
      },
    };

    function violatesUnique(candidate, ignoreRow) {
      for (const rule of unique[name] || []) {
        const cols = rule.cols;
        if (cols.some((c) => candidate[c] === null || candidate[c] === undefined)) continue;
        if (rule.when && !rule.when(candidate)) continue;
        const dup = table(name).find((r) => r !== ignoreRow && cols.every((c) => r[c] === candidate[c]) && (!rule.when || rule.when(r)));
        if (dup) return true;
      }
      return false;
    }

    function shape(rows) {
      let result = rows;
      if (state.order) {
        const { col, asc } = state.order;
        result = [...result].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1));
      }
      if (state.limit !== null) result = result.slice(0, state.limit);
      return result.map((r) => embed(name, r, state.select));
    }

    function respond(rows) {
      const data = shape(rows);
      if (state.single) {
        if (data.length === 0) return state.single === "maybe" ? { data: null, error: null } : { data: null, error: { code: "PGRST116", message: "No rows" } };
        if (data.length > 1 && state.single === "single") return { data: null, error: { code: "PGRST116", message: "Multiple rows" } };
        return { data: data[0], error: null };
      }
      return { data, error: null, count: rows.length };
    }

    function run() {
      if (mode === "select") {
        const rows = table(name).filter((r) => matches(r, state.filters));
        if (state.head) return { data: null, error: null, count: rows.length };
        return { ...respond(rows), count: rows.length };
      }
      if (mode === "insert" || mode === "upsert") {
        const inserted = [];
        for (const raw of Array.isArray(payload) ? payload : [payload]) {
          const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...(defaults[name] || {}), ...raw };
          if (mode === "upsert" && opts.onConflict) {
            const cols = opts.onConflict.split(",");
            const existing = table(name).find((r) => cols.every((c) => r[c] === row[c]));
            if (existing) {
              if (!opts.ignoreDuplicates) Object.assign(existing, raw);
              inserted.push(existing);
              continue;
            }
          }
          if (violatesUnique(row)) return { data: null, error: { code: "23505", message: `duplicate key value violates unique constraint on ${name}` } };
          table(name).push(row);
          inserted.push(row);
        }
        return state.returning ? respond(inserted) : { data: null, error: null };
      }
      if (mode === "update") {
        const rows = table(name).filter((r) => matches(r, state.filters));
        for (const r of rows) {
          const next = { ...r, ...payload };
          if (violatesUnique(next, r)) return { data: null, error: { code: "23505", message: `duplicate key value violates unique constraint on ${name}` } };
          Object.assign(r, payload, { updated_at: new Date().toISOString() });
        }
        return state.returning ? respond(rows) : { data: null, error: null };
      }
      if (mode === "delete") {
        const rows = table(name).filter((r) => matches(r, state.filters));
        db[name] = table(name).filter((r) => !rows.includes(r));
        return { data: null, error: null };
      }
      throw new Error(`fake supabase: unsupported mode ${mode}`);
    }
    return api;
  }

  const client = {
    from: (name) => ({
      select: (cols, o) => builder(name, "select").select(cols, o),
      insert: (payload) => builder(name, "insert", payload),
      update: (payload) => builder(name, "update", payload),
      delete: () => builder(name, "delete"),
      upsert: (payload, o) => builder(name, "upsert", payload, o),
    }),
    rpc: async (fn, args) => {
      if (!rpc[fn]) throw new Error(`fake supabase: rpc ${fn} not provided`);
      return { data: await rpc[fn](args, db), error: null };
    },
    auth: {
      getUser: async (token) => (authUsers[token] ? { data: { user: authUsers[token] }, error: null } : { data: { user: null }, error: { message: "invalid" } }),
      admin: { deleteUser: async () => ({ error: null }) },
    },
    storage: {
      listBuckets: async () => ({ data: [{ name: "documents" }], error: null }),
      from: () => ({
        upload: async (key, buf) => ((storage[key] = buf), { error: null }),
        download: async (key) => (storage[key] ? { data: new Blob([storage[key]]), error: null } : { data: null, error: { message: "not found" } }),
        createSignedUrl: async (key) => ({ data: { signedUrl: `https://signed.example/${key}?token=t` }, error: null }),
        remove: async (keys) => (keys.forEach((k) => delete storage[k]), { error: null }),
      }),
    },
  };
  return { client, db, storage };
}
