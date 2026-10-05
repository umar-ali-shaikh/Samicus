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
  if (!found) return { rangeStart: 0, rangeEnd: 0, totalPages: 0, hasPrev: false, hasNext: false };
  const rangeStart = page * pageSize + 1;
  const rangeEnd = Math.min(found, rangeStart + docsShownOnThisPage - 1);
  return { rangeStart, rangeEnd, totalPages: Math.ceil(found / pageSize), hasPrev: page > 0, hasNext: rangeEnd < found };
}
