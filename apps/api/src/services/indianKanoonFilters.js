// Turns a structured filter object into the `formInput` filter tokens Indian Kanoon
// expects, appended after the free-text query. See api.indiankanoon.org/documentation.

/**
 * @typedef {Object} CaseLawFilters
 * @property {string|string[]} [court] - doctype(s), e.g. "supremecourt" or ["bombay","delhi"].
 * @property {string} [fromDate] - "DD-MM-YYYY"
 * @property {string} [toDate] - "DD-MM-YYYY"
 * @property {string} [title]
 * @property {string} [cite]
 * @property {string} [author] - judge name
 * @property {string} [bench] - judge name
 */

function quoteIfNeeded(value) {
  return /\s/.test(value) ? `"${value}"` : value;
}

/**
 * @param {string} query - free-text query; may already contain ANDD/ORR/NOTT/"phrase" operators.
 * @param {CaseLawFilters} [filters]
 * @returns {string} the full `formInput` value to send to Indian Kanoon.
 */
export function buildFormInput(query, filters = {}) {
  const parts = [];
  if (query && query.trim()) parts.push(query.trim());

  const { court, fromDate, toDate, title, cite, author, bench } = filters;

  if (court) {
    const doctypes = Array.isArray(court) ? court.join(",") : court;
    if (doctypes) parts.push(`doctypes:${doctypes}`);
  }
  if (fromDate) parts.push(`fromdate:${fromDate}`);
  if (toDate) parts.push(`todate:${toDate}`);
  if (title) parts.push(`title:${quoteIfNeeded(title)}`);
  if (cite) parts.push(`cite:${quoteIfNeeded(cite)}`);
  if (author) parts.push(`author:${quoteIfNeeded(author)}`);
  if (bench) parts.push(`bench:${quoteIfNeeded(bench)}`);

  return parts.join(" ");
}
