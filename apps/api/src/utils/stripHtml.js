// Strips HTML tags entirely for plain-text extraction (e.g. feeding a judgment's HTML
// headline/doc field into an LLM prompt, where formatting markup is unwanted, as opposed to
// utils/sanitizeHtml.js's sanitizeJudgmentHtml(), which PRESERVES safe formatting for browser
// rendering -- a genuinely different job, not a duplicate of this one).
export function stripHtml(html) {
  return (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
