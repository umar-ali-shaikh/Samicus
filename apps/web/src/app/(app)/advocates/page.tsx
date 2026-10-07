import type { Metadata } from "next";
import Link from "next/link";
import { apiClient } from "@/server/apiClient";
import type { DirectoryItemDto } from "@vidhira/contracts";
import { AdvocateRow } from "@/components/advocates/AdvocateRow";
import { NoAdvocatesFallback } from "@/components/advocates/NoAdvocatesFallback";
import { EmptyState } from "@/components/ui";
import { DirectoryFilters } from "./DirectoryFilters";

export const metadata: Metadata = {
  title: "Find a lawyer — Vidhira",
  robots: { index: false, follow: false },
};

/**
 * Ported from frontend/src/screens/Find.jsx. "Browse by specialisation" pills (GET
 * /specialisations, from askLearn.js) are deferred to that domain's own Phase 3 slice --
 * not built here. "Book consultation" is likewise deferred to the consultations slice
 * (AdvocateRow only links to the profile for now).
 */
export default async function AdvocatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const issue = typeof params.issue === "string" ? params.issue : "";
  const availableOnly = params.available_today === "true";
  const page = typeof params.page === "string" ? Number(params.page) : 0;

  const { data: advocates, headers } = await apiClient.getWithHeaders<DirectoryItemDto[]>("/advocates", {
    q: q || undefined,
    issue: issue || undefined,
    available_today: availableOnly ? "true" : undefined,
    page,
  });
  const hasMore = headers.get("x-has-more") === "true";
  const total = Number(headers.get("x-total-count") ?? advocates.length);
  const hasFilters = Boolean(q || issue || availableOnly);

  function pageHref(targetPage: number) {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (issue) sp.set("issue", issue);
    if (availableOnly) sp.set("available_today", "true");
    if (targetPage > 0) sp.set("page", String(targetPage));
    const qs = sp.toString();
    return qs ? `/advocates?${qs}` : "/advocates";
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, padding: 24, maxWidth: 900 }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-serif)", margin: 0 }}>Find a lawyer</h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
          Every advocate listed here has been verified against Bar Council enrolment. Results are ordered by availability and experience only — no paid
          placement or bidding.
        </p>
      </div>

      <DirectoryFilters initialQ={q} initialAvailableOnly={availableOnly} />

      {advocates.length === 0 ? (
        hasFilters ? (
          <EmptyState title="No advocates match" body="Try widening or resetting your filters. New advocates appear here as soon as their enrolment is verified." />
        ) : (
          <NoAdvocatesFallback practiceAreaId={issue || undefined} />
        )
      ) : (
        <>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            {total} advocate{total === 1 ? "" : "s"} found
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {advocates.map((a) => (
              <AdvocateRow key={a.id} a={a} />
            ))}
          </div>
          {(page > 0 || hasMore) && (
            <div style={{ display: "flex", gap: 14, justifyContent: "center", fontSize: 13 }}>
              {page > 0 && <Link href={pageHref(page - 1)}>← Previous</Link>}
              {hasMore && <Link href={pageHref(page + 1)}>Next →</Link>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
