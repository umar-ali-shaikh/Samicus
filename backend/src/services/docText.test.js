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

// Regression for a real QA failure: an 8-clause one-sided rental agreement whose clauses
// are short one-liners only split into 5 segments — numbered clauses were being merged
// together because a new clause only started its own segment once the buffer already held
// 120 chars, and a short trailing clause was dropped outright by the same floor.
const ONE_SIDED_LEASE = [
  "1. The security deposit shall be forfeited in full at the sole discretion of the Landlord.",
  "2. The rent shall increase by 25% every 3 months at the Landlord's sole option.",
  "3. The Landlord may enter the premises at any time without prior notice to the Tenant.",
  "4. Any dispute shall be referred to an arbitrator appointed solely by the Landlord.",
  "5. The Tenant shall bear all repair costs regardless of cause.",
  "6. The Landlord may terminate this agreement at will without cause or notice.",
  "7. The Tenant waives all rights to a refund of maintenance charges paid in advance.",
  "8. This agreement is governed by the sole and exclusive discretion of the Landlord.",
].join("\n");

test("segmentContract splits short, consecutive numbered clauses into separate segments (not merged or dropped)", () => {
  const segments = segmentContract(ONE_SIDED_LEASE);
  assert.equal(segments.length, 8);
  assert.ok(segments[0].startsWith("1. The security deposit"));
  assert.ok(segments[7].startsWith("8. This agreement"));
});

test("extractDocumentText reads plain text and rejects unreadable/short files", async () => {
  const text = await extractDocumentText(Buffer.from(CONTRACT), "text/plain");
  assert.match(text, /Security deposit/);
  await assert.rejects(() => extractDocumentText(Buffer.from("too short"), "text/plain"), UnreadableDocumentError);
  await assert.rejects(() => extractDocumentText(Buffer.from(CONTRACT), "image/png"), /supports PDF, DOCX and TXT/);
});
