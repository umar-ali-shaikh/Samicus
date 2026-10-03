import test from "node:test";
import assert from "node:assert/strict";
import { extractDocumentText, segmentContract, UnreadableDocumentError } from "./docText.js";

const CONTRACT = [
  "RENTAL AGREEMENT",
  "1. Term. The tenancy shall commence on 1 October 2026 and continue for a period of eleven months unless terminated earlier in accordance with this agreement.",
  "2. Security deposit. The Tenant shall pay a refundable security deposit equal to ten months' rent, adjustable against damages caused to the premises.",
  "3. Maintenance. The Tenant shall bear monthly maintenance and society charges in addition to the agreed rent, payable on or before the fifth of each month.",
].join("\n");

test("segmentContract splits on numbered clauses", () => {
  const segments = segmentContract(CONTRACT, { minChars: 60 });
  assert.ok(segments.length >= 3);
  assert.ok(segments.some((s) => s.startsWith("2. Security deposit")));
});

test("extractDocumentText reads plain text and rejects unreadable/short files", async () => {
  const text = await extractDocumentText(Buffer.from(CONTRACT), "text/plain");
  assert.match(text, /Security deposit/);
  await assert.rejects(() => extractDocumentText(Buffer.from("too short"), "text/plain"), UnreadableDocumentError);
  await assert.rejects(() => extractDocumentText(Buffer.from(CONTRACT), "image/png"), /supports PDF, DOCX and TXT/);
});
