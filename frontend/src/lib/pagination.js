// Shared pagination math for Indian Kanoon result lists (Case law search) — pulled out of
// the component so the "1-10 of 9836" range/page-count arithmetic can be unit tested
// without a browser.
export const PAGE_SIZE = 10;

/**
 * @param {number} found - total matching results Indian Kanoon reports.
 * @param {number} page - 0-based current page.
 * @param {number} docsShownOnThisPage - how many result rows actually came back this page
 *   (the last page is usually shorter than pageSize).
 * @param {number} [pageSize]
 * @returns {{ rangeStart: number, rangeEnd: number, totalPages: number, hasPrev: boolean, hasNext: boolean }}
 */
export function paginationInfo(found, page, docsShownOnThisPage, pageSize = PAGE_SIZE) {
  // The backend (services/indianKanoon.js) already parses Indian Kanoon's occasional
  // "1 - 10 of 9,836" range-string `found` into a real number before this ever runs — this
  // Number() coercion is a defensive backstop so a still-malformed/unparseable value (NaN,
  // not a clean numeric string) degrades to the same safe "no results" shape instead of
  // producing NaN-laced range text or breaking the `found / pageSize` math below.
  const total = Number(found);
  if (!total || !Number.isFinite(total)) return { rangeStart: 0, rangeEnd: 0, totalPages: 0, hasPrev: false, hasNext: false };
  const rangeStart = page * pageSize + 1;
  const rangeEnd = Math.min(total, rangeStart + docsShownOnThisPage - 1);
  return { rangeStart, rangeEnd, totalPages: Math.ceil(total / pageSize), hasPrev: page > 0, hasNext: rangeEnd < total };
}
