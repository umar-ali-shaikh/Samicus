// Shared pagination math for Indian Kanoon result lists (Case law search) -- ported from
// frontend/src/lib/pagination.js, same behaviour.
export const PAGE_SIZE = 10;

export interface PaginationInfo {
  rangeStart: number;
  rangeEnd: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
}

/**
 * @param found - total matching results Indian Kanoon reports.
 * @param page - 0-based current page.
 * @param docsShownOnThisPage - how many result rows actually came back this page.
 */
export function paginationInfo(found: number, page: number, docsShownOnThisPage: number, pageSize = PAGE_SIZE): PaginationInfo {
  const total = Number(found);
  if (!total || !Number.isFinite(total)) return { rangeStart: 0, rangeEnd: 0, totalPages: 0, hasPrev: false, hasNext: false };
  const rangeStart = page * pageSize + 1;
  const rangeEnd = Math.min(total, rangeStart + docsShownOnThisPage - 1);
  return { rangeStart, rangeEnd, totalPages: Math.ceil(total / pageSize), hasPrev: page > 0, hasNext: rangeEnd < total };
}
