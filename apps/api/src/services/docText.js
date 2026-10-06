// Text extraction for uploaded contracts (PDF with a text layer, DOCX, TXT). Scanned/image
// documents are rejected rather than silently producing an empty "review" — there is no OCR.
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

export class UnreadableDocumentError extends Error {
  constructor(message) {
    super(message);
    this.status = 422;
    this.expose = true;
  }
}

const MIN_CHARS = 200;

export async function extractDocumentText(buffer, mime) {
  let text = "";
  if (mime === "application/pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    ({ text } = await extractText(pdf, { mergePages: true }));
  } else if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    ({ value: text } = await mammoth.extractRawText({ buffer }));
  } else if (mime === "text/plain") {
    text = buffer.toString("utf8");
  } else {
    throw new UnreadableDocumentError("Contract review supports PDF, DOCX and TXT files.");
  }
  text = String(text || "").replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").trim();
  if (text.length < MIN_CHARS) {
    throw new UnreadableDocumentError("We couldn't read text from this file. Scanned or image-only documents aren't supported — upload a text PDF or a DOCX.");
  }
  return text;
}

const HEADING = /^\s*(?:(?:clause|article|section)\s+\d+[.:)]?|\d+(?:\.\d+)*[.)]\s+\S|\([a-z0-9]{1,3}\)\s+\S|[A-Z][A-Z0-9 ,&'\-]{4,60}$)/i;

/**
 * Splits contract text into clause-sized segments (numbered headings first, paragraphs
 * otherwise). A new numbered/headed line always starts its OWN segment once anything has
 * been accumulated — it used to only split once the accumulated buffer already held
 * `minChars`, which silently merged consecutive SHORT clauses together (a one-sided rental
 * agreement's clauses are often one-liners well under 120 chars) and dropped a short final
 * clause entirely. `minChars` now only floors out genuinely trivial fragments (a stray
 * heading with nothing under it), not legitimate short clauses.
 */
export function segmentContract(text, { minChars = 20, maxChars = 1800, maxSegments = 80 } = {}) {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const segments = [];
  let cur = "";
  const push = () => {
    const t = cur.trim();
    if (t.length >= minChars) segments.push(t);
    cur = "";
  };
  for (const line of lines) {
    const startsClause = HEADING.test(line) && line.length < 200;
    if ((startsClause && cur) || cur.length + line.length > maxChars) push();
    cur += (cur ? "\n" : "") + line;
  }
  push();
  return segments.slice(0, maxSegments).map((t) => (t.length > maxChars ? `${t.slice(0, maxChars)}…` : t));
}
