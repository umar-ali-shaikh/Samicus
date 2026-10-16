// docText.js's opt-in OCR fallback for scanned/image-only PDFs, against a stub Anthropic client
// -- no real API call.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { extractDocumentText, UnreadableDocumentError } from "./docText.js";
import { __setAnthropicClientForTests } from "./anthropic.js";

// A valid one-page PDF with no text layer at all -- what a scanner's image-only PDF looks like
// to a text extractor.
function blankPdf() {
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>"];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const TRANSCRIPT = "1. Term. This agreement runs for eleven months from the start date.\n".repeat(5);
const saved = { DOCUMENT_OCR: process.env.DOCUMENT_OCR, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY };
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  __setAnthropicClientForTests(undefined);
});

function stub() {
  const calls = [];
  return {
    calls,
    beta: {
      messages: {
        stream: (req) => {
          calls.push(req);
          return { finalMessage: async () => ({ model: req.model, stop_reason: "end_turn", content: [{ type: "text", text: TRANSCRIPT }] }) };
        },
      },
    },
  };
}

test("an image-only PDF is still rejected when OCR is off (the default)", async () => {
  delete process.env.DOCUMENT_OCR;
  const s = stub();
  __setAnthropicClientForTests(s);
  await assert.rejects(extractDocumentText(blankPdf(), "application/pdf"), UnreadableDocumentError);
  assert.equal(s.calls.length, 0, "no document is sent anywhere unless OCR is switched on");
});

test("with DOCUMENT_OCR=anthropic, an image-only PDF is transcribed by Claude", async () => {
  process.env.DOCUMENT_OCR = "anthropic";
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  const s = stub();
  __setAnthropicClientForTests(s);
  const text = await extractDocumentText(blankPdf(), "application/pdf");
  assert.equal(text, TRANSCRIPT.trim());
  const req = s.calls[0];
  assert.equal(req.messages[0].content[0].type, "document");
  assert.equal(req.messages[0].content[0].source.media_type, "application/pdf");
  assert.deepEqual(req.output_config, { effort: "low" });
});

test("OCR needs the key too: DOCUMENT_OCR alone doesn't send anything", async () => {
  process.env.DOCUMENT_OCR = "anthropic";
  delete process.env.ANTHROPIC_API_KEY;
  const s = stub();
  __setAnthropicClientForTests(s);
  await assert.rejects(extractDocumentText(blankPdf(), "application/pdf"), UnreadableDocumentError);
  assert.equal(s.calls.length, 0);
});
