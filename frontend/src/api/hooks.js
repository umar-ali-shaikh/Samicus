import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useUI } from "../state/UIState";

/** GET with caching. `path` + `query` form the cache key, so any screen sharing them shares the data. */
export function useGet(path, query, options = {}) {
  return useQuery({ queryKey: [path, query || null], queryFn: () => api.get(path, query), ...options });
}

/**
 * Mutation that surfaces failures as toasts and refreshes the listed GET paths on success.
 * @param {(vars: any) => Promise<any>} fn
 * `invalidate` takes path prefixes: "/matters" also refreshes "/matters/:id".
 * @param {{ invalidate?: string[], success?: string | ((data:any, vars:any)=>string), onSuccess?: Function, silent?: boolean }} [opts]
 */
export function useMut(fn, { invalidate = [], success, onSuccess, silent } = {}) {
  const qc = useQueryClient();
  const { showToast } = useUI();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data, vars) => {
      for (const path of invalidate) qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith(path) });
      const msg = typeof success === "function" ? success(data, vars) : success;
      if (msg) showToast(msg);
      onSuccess?.(data, vars);
    },
    onError: (err) => { if (!silent) showToast(err.message); },
  });
}

export const useConfig = () => useGet("/config", undefined, { staleTime: 5 * 60 * 1000 });
