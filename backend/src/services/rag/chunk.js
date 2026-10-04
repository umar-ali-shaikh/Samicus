// Turns an Indian Kanoon document (HTML) into passage-sized chunks for embedding.
// Passages keep their paragraph class (facts / reasoning / holding / provision …) so the
// research layer can refuse to cite a party's *argument* as if it were the court's holding.

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " " };

export function decodeEntities(text) {
  return text
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
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

export function stripTags(html) {
  return decodeEntities(String(html || "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "))
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ ([,.;:)\]])/g, "$1") // a removed tag can leave a stray space before punctuation, e.g. "(<b>Lease</b>," -> "( Lease ,"
    .replace(/([(\[]) /g, "$1")
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
    if (!text || text.length < 3 || looksGarbled(text)) continue;
    const title = /title\s*=\s*"([^"]*)"/i.exec(attrs)?.[1];
    const id = /id\s*=\s*"p_(\d+)"/i.exec(attrs)?.[1] ?? null;
    out.push({ text, paraClass: classFromTitle(title, fallbackClass), paraNumber: id });
  }
  if (out.length === 0) {
    for (const line of stripTags(html).split(/\n{1,}/)) {
      const t = line.trim();
      if (t.length >= 3 && !looksGarbled(t)) out.push({ text: t, paraClass: fallbackClass, paraNumber: null });
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
  const normalized = decodeEntities(String(text || "")).trim();
  const blocks = normalized.split(/\n\s*\n+/).filter((b) => b.trim().length >= 3);
  const lines = blocks.length > 0 ? blocks : normalized.split(/\n+/).filter((l) => l.trim().length >= 3);
  return lines.filter((l) => !looksGarbled(l)).map((l) => ({ text: l.trim(), paraClass: fallbackClass, paraNumber: null }));
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
