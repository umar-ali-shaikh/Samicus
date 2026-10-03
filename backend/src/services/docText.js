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

/** Splits contract text into clause-sized segments (numbered headings first, paragraphs otherwise). */
export function segmentContract(text, { minChars = 120, maxChars = 1800, maxSegments = 60 } = {}) {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const segments = [];
  let cur = "";
  const push = () => {
    if (cur.trim().length >= minChars) segments.push(cur.trim());
    cur = "";
  };
  for (const line of lines) {
    const startsClause = HEADING.test(line) && line.length < 200;
    if ((startsClause && cur.length >= minChars) || cur.length + line.length > maxChars) push();
    cur += (cur ? "\n" : "") + line;
  }
  push();
  return segments.slice(0, maxSegments).map((t) => (t.length > maxChars ? `${t.slice(0, maxChars)}…` : t));
}
