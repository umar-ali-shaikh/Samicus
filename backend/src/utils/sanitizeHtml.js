import sanitizeHtml from "sanitize-html";

// Indian Kanoon's "doc" and "headline" fields contain judgment HTML (paragraphs, bold,
// citations, highlighted search terms). Allow enough tags to preserve that formatting
// without allowing scripts, event handlers, iframes, or anything else XSS-capable.
const OPTIONS = {
  allowedTags: [
    "p", "br", "b", "strong", "i", "em", "u", "sup", "sub", "blockquote",
    "span", "div", "ol", "ul", "li", "table", "thead", "tbody", "tr", "td", "th",
    "a", "h1", "h2", "h3", "h4", "font", "center", "pre",
  ],
  allowedAttributes: {
    a: ["href", "name"],
    span: ["class"],
    div: ["class"],
    font: ["size", "color"],
  },
  allowedSchemes: ["http", "https"],
  allowProtocolRelative: false,
};

/** Sanitizes a judgment HTML fragment (doc/headline) for safe rendering. Pass-through for empty input. */
export function sanitizeJudgmentHtml(html) {
  if (!html) return html;
  return sanitizeHtml(html, OPTIONS);
}
