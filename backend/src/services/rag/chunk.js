// Turns an Indian Kanoon document (HTML) into passage-sized chunks for embedding.
// Passages keep their paragraph class (facts / reasoning / holding / provision …) so the
// research layer can refuse to cite a party's *argument* as if it were the court's holding.

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " " };

// Decimal numeric entities (&#39;) were handled here from the start, but HEX numeric
// entities (&#x27;) — which Indian Kanoon's HTML also emits for the same apostrophe —
// were not: the old regex only matched `&#(\d+);`, so `&#x27;` fell straight through
// unmatched and reached the UI as literal "&#x27;" text. Order matters: hex must run
// before the decimal pattern, since `&#x27;` would otherwise partially satisfy neither.
export function decodeEntities(text) {
  return String(text ?? "")
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

// Indian Kanoon's plain-text/PDF-derived documents carry layout artifacts that are never
// real content: a lone page number on its own line, and the site's own footer line
// ("Indian Kanoon - http://indiankanoon.org/doc/12345/") repeated on every page. Both
// would otherwise survive as their own nonsense "passage" once chunked.
const PAGE_ARTIFACT_RE = /^(?:page\s*)?\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?$|^indian\s*kanoon\b/i;

export function looksLikePageArtifact(text) {
  return PAGE_ARTIFACT_RE.test(String(text || "").trim());
}

// PDF-to-text extraction (and some Indian Kanoon plain-text sources) hard-wraps lines at a
// fixed column, breaking words across a hyphen and sentences across a line break that has
// nothing to do with the paragraph's real structure. Re-joining these BEFORE paragraph/
// sentence splitting keeps a sentence that was merely wrapped from being chunked as if it
// were two separate ones. A genuine paragraph break is a blank line, which this never touches
// (only single "\n"s are rewritten).
export function rejoinBrokenLines(text) {
  return String(text || "")
    .replace(/([a-zA-Z])-\n([a-zA-Z])/g, "$1$2") // de-hyphenate a word split across the line break
    .replace(/([a-z,;])\n(?=[a-z(])/g, "$1 "); // a line not ending a sentence: join with a space, not a break
}

// Some Indian Kanoon documents embed a scanned/OCR'd regional-language annexure whose PDF
// used a non-Unicode "ASCII hack" font (common with older Kannada/Telugu/Tamil/Malayalam
// typesetting) — converted without that font's private mapping, every glyph lands on the
// wrong Unicode codepoint and the result is unreadable garbage, already corrupted in
// Indian Kanoon's own source (not something our extraction can recover). This app's
// content is English/Hindi; a paragraph that's heavily South-Indian-script is almost
// certainly this failure mode, not a genuine untranslated quote, so it's dropped rather
// than shown as raw noise to the user.
const SOUTH_INDIAN_SCRIPT_RE = /[஀-௿ఀ-౿ಀ-೿ഀ-ൿ]/g;
const GARBLED_SCRIPT_RATIO = 0.1;

export function looksGarbled(text) {
  const s = String(text || "");
  if (s.length < 20) return false;
  const hits = s.match(SOUTH_INDIAN_SCRIPT_RE)?.length || 0;
  return hits / s.length > GARBLED_SCRIPT_RATIO;
}

// P3-3: Indian Kanoon's own source text occasionally carries a null end date left
// unformatted for an ongoing/open-ended period (a judge's tenure, an amendment's validity, a
// bench composition) e.g. "...served from 2015 to None." The null was never resolved to
// "present" before being embedded in the document text on their end; readable English never
// says "to None", so it's rewritten the same way looksLikePageArtifact/looksGarbled above
// clean up other known source-text artifacts, not left for the user to puzzle over.
const NULL_END_DATE_RE = new RegExp(String.raw`\bto\s+None\b`, "gi");

export function stripTags(html) {
  return rejoinBrokenLines(decodeEntities(String(html || "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")))
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ ([,.;:)\]])/g, "$1") // a removed tag can leave a stray space before punctuation, e.g. "(<b>Lease</b>," -> "( Lease ,"
    .replace(/([(\[]) /g, "$1")
    .replace(NULL_END_DATE_RE, "to present")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

// Indian Kanoon tags structural paragraphs with a `title` attribute (Fact, Issue, …).
const CLASS_BY_TITLE = [
  [/fact/i, "facts"],
  [/issue/i, "issues"],
  [/petitioner/i, "petitioner_arguments"],
  [/respondent/i, "respondent_arguments"],
  [/conclusion|holding|direction|order/i, "holding"],
  [/reasoning|analysis|precedent|ratio/i, "reasoning"],
  [/statute|section|provision/i, "provision"],
];

export function classFromTitle(title, fallback) {
  if (!title) return fallback;
  const hit = CLASS_BY_TITLE.find(([re]) => re.test(title));
  return hit ? hit[1] : fallback;
}

// Many Indian Kanoon documents carry no `title` attribute on most paragraphs (or a generic
// one the table above can't place) — which used to mean every one of them fell through to
// `fallbackClass`, in practice "reasoning" for every passage in a judgment no matter whether
// it was actually a quoted statute, a party's submission, or a quoted precedent. This is a
// second, content-based pass that only runs when the title attribute gave no confident
// signal, so a real "Court's Reasoning" title still wins outright. Ordered most to least
// specific; first match wins. A paragraph matching nothing keeps the caller's fallback —
// never guess a class the text doesn't actually signal.
const CONTENT_CLASS_PATTERNS = [
  [/(?:\((?:19|20)\d{2}\)\s*\d+\s*SCC|\bAIR\s*(?:19|20)\d{2}\b|\bSCC\s*OnLine\b|\(\d{4}\)\s*\d+\s*SCR\b)[\s\S]*["“]/, "quoted_precedent"],
  [/^(?:section|sec\.?)\s*\d+[a-z]*\b[\s\S]{0,40}(?:reads?(?:\s+as)?|provides?|states?)\s*[:—-]/i, "provision"],
  [/\b(?:the\s+)?(?:said\s+)?(?:provision|section)\s+(?:reads|is\s+(?:extracted|reproduced|set\s+out))\b/i, "provision"],
  [/\blearned\s+(?:senior\s+)?counsel\s+(?:appearing\s+)?for\s+the\s+(?:petitioner|appellant|plaintiff|applicant)\b[\s\S]{0,80}\b(?:submit|argu|contend)/i, "petitioner_arguments"],
  [/\bit\s+(?:was|is)\s+(?:submitted|argued|contended)\s+(?:by|on\s+behalf\s+of)\s+(?:the\s+)?(?:learned\s+(?:senior\s+)?counsel\s+(?:appearing\s+)?for\s+the\s+)?(?:petitioner|appellant|plaintiff|applicant)\b/i, "petitioner_arguments"],
  [/\blearned\s+(?:senior\s+)?counsel\s+(?:appearing\s+)?for\s+the\s+(?:respondent|defendant|state)\b[\s\S]{0,80}\b(?:submit|argu|contend)/i, "respondent_arguments"],
  [/\bit\s+(?:was|is)\s+(?:submitted|argued|contended)\s+(?:by|on\s+behalf\s+of)\s+(?:the\s+)?(?:learned\s+(?:senior\s+)?counsel\s+(?:appearing\s+)?for\s+the\s+)?(?:respondent|defendant|state)\b/i, "respondent_arguments"],
  [/^(?:the\s+)?(?:brief\s+)?facts\s+(?:of\s+the\s+case\s+)?(?:are|is)\b/i, "facts"],
  [/\b(?:it\s+is\s+)?(?:the\s+)?(?:undisputed\s+|admitted\s+)?case\s+of\s+the\s+(?:petitioner|appellant)\s+that\b/i, "facts"],
  [/^(?:the\s+)?questions?\s+(?:that\s+)?(?:arise|arises|for\s+(?:consideration|determination))\b/i, "issues"],
  [/^(?:the\s+)?issues?\s+(?:that\s+)?(?:arise|arises|for\s+(?:consideration|determination)|referred)\b/i, "issues"],
  [/^whether\b[\s\S]{0,200}\?\s*$/i, "issues"],
  [/\b(?:is|are)\s+directed\s+to\b/i, "directions"],
  [/\bthe\s+following\s+directions?\s+(?:is|are)\s+(?:issued|given)\b/i, "directions"],
  [/\bwe\s+(?:hold|are\s+of\s+the\s+(?:considered\s+)?(?:view|opinion))\s+that\b/i, "holding"],
  [/\bit\s+is(?:,?\s*therefore,?)?\s+held\s+that\b/i, "holding"],
  [/\bfor\s+the\s+(?:foregoing|aforesaid|above)\s+reasons\b/i, "holding"],
  [/\bin\s+the\s+result\b/i, "holding"],
  [/\baccordingly,?\s+the\s+(?:appeal|petition|writ|suit)\s+is\s+(?:allowed|dismissed|disposed)/i, "holding"],
];

export function classifyParagraphText(text, currentClass, fallback) {
  if (currentClass !== fallback) return currentClass; // the title attribute already gave a confident answer
  const hit = CONTENT_CLASS_PATTERNS.find(([re]) => re.test(text));
  return hit ? hit[1] : currentClass;
}

/**
 * @param {string} html
 * @param {{ fallbackClass?: string }} [opts]
 * @returns {{ text: string, paraClass: string, paraNumber: string|null }[]}
 */
export function htmlToParagraphs(html, { fallbackClass = "reasoning" } = {}) {
  const out = [];
  const re = /<(p|blockquote|h[1-4]|li)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = re.exec(html || ""))) {
    const attrs = match[2] || "";
    const text = stripTags(match[3]);
    if (!text || text.length < 3 || looksGarbled(text) || looksLikePageArtifact(text)) continue;
    const title = /title\s*=\s*"([^"]*)"/i.exec(attrs)?.[1];
    const id = /id\s*=\s*"p_(\d+)"/i.exec(attrs)?.[1] ?? null;
    const titleClass = classFromTitle(title, fallbackClass);
    out.push({ text, paraClass: classifyParagraphText(text, titleClass, fallbackClass), paraNumber: id });
  }
  if (out.length === 0) {
    for (const line of stripTags(html).split(/\n{1,}/)) {
      const t = line.trim();
      if (t.length >= 3 && !looksGarbled(t) && !looksLikePageArtifact(t)) out.push({ text: t, paraClass: classifyParagraphText(t, fallbackClass, fallbackClass), paraNumber: null });
    }
  }
  return out;
}

/**
 * Plain-text counterpart to htmlToParagraphs, for sources with no markup (e.g. Tavily's
 * extracted page text) — splits on blank lines, falling back to single newlines.
 * @param {string} text
 * @param {{ fallbackClass?: string }} [opts]
 * @returns {{ text: string, paraClass: string, paraNumber: string|null }[]}
 */
export function textToParagraphs(text, { fallbackClass = "provision" } = {}) {
  const normalized = rejoinBrokenLines(decodeEntities(String(text || ""))).trim();
  const blocks = normalized.split(/\n\s*\n+/).filter((b) => b.trim().length >= 3);
  const lines = blocks.length > 0 ? blocks : normalized.split(/\n+/).filter((l) => l.trim().length >= 3);
  return lines
    .map((l) => l.trim())
    .filter((l) => !looksGarbled(l) && !looksLikePageArtifact(l))
    .map((l) => ({ text: l, paraClass: classifyParagraphText(l, fallbackClass, fallbackClass), paraNumber: null }));
}

function splitLong(text, max) {
  if (text.length <= max) return [text];
  const sentences = text.match(/[^.!?।]+[.!?।]+["')\]]*\s*|[^.!?।]+$/g) || [text];
  const parts = [];
  let cur = "";
  for (const s of sentences) {
    if ((cur + s).length > max && cur) {
      parts.push(cur.trim());
      cur = "";
    }
    // A single sentence longer than max is hard-split.
    if (s.length > max) {
      for (let i = 0; i < s.length; i += max) parts.push(s.slice(i, i + max).trim());
    } else {
      cur += s;
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

/**
 * Greedily merges consecutive paragraphs of the same class up to ~`target` chars, never
 * exceeding `max`. Returns at most `maxChunks` chunks.
 * @returns {{ ordinal: number, text: string, paraClass: string, paraNumber: string|null }[]}
 */
export function chunkParagraphs(paragraphs, { target = 900, max = 1600, maxChunks = 80 } = {}) {
  const chunks = [];
  let cur = null;
  const flush = () => {
    if (cur && cur.text.trim()) chunks.push({ ordinal: chunks.length, text: cur.text.trim(), paraClass: cur.paraClass, paraNumber: cur.paraNumber });
    cur = null;
  };
  for (const p of paragraphs) {
    for (const piece of splitLong(p.text, max)) {
      if (cur && (cur.paraClass !== p.paraClass || cur.text.length + piece.length + 1 > target)) flush();
      if (!cur) cur = { text: piece, paraClass: p.paraClass, paraNumber: p.paraNumber };
      else cur.text += `\n${piece}`;
      if (chunks.length >= maxChunks) return chunks;
    }
  }
  flush();
  return chunks.slice(0, maxChunks);
}

export function mapDocSource(docsource = "") {
  if (/supreme court/i.test(docsource)) return "supreme_court";
  if (/high court/i.test(docsource)) return "high_court";
  if (/tribunal|commission|board|authority/i.test(docsource)) return "tribunal";
  if (/act|rules|regulation|constitution|code|ordinance/i.test(docsource)) return "bare_act";
  return "other";
}
