"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Pill } from "@/components/ui";

// Ported from frontend/src/screens/Find.jsx's search/filter row -- URL-driven here (query
// params) instead of local-only state, since this is now a real, shareable/bookmarkable route.
export function DirectoryFilters({ initialQ, initialAvailableOnly }: { initialQ: string; initialAvailableOnly: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(initialQ);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function updateParams(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page"); // any filter change resets to the first page
    router.push(`${pathname}?${params.toString()}`);
  }

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (q === initialQ) return;
    debounceRef.current = setTimeout(() => updateParams({ q: q || undefined }), 400);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <input
        placeholder="Search by name, city or keyword"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ flex: 1, minWidth: 220, padding: 10, borderRadius: 9, border: "1px solid var(--color-border)" }}
      />
      <Pill active={initialAvailableOnly} onClick={() => updateParams({ available_today: initialAvailableOnly ? undefined : "true" })}>
        Available now only
      </Pill>
      <button
        onClick={() => {
          setQ("");
          router.push(pathname);
        }}
        style={{ background: "none", border: "none", color: "var(--color-rust)", cursor: "pointer", fontSize: 12.5 }}
      >
        Reset
      </button>
    </div>
  );
}
