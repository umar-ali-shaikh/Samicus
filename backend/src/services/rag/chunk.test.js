import test from "node:test";
import assert from "node:assert/strict";
import { chunkParagraphs, classFromTitle, htmlToParagraphs, mapDocSource, stripTags } from "./chunk.js";

test("stripTags removes markup and decodes entities", () => {
  assert.equal(stripTags("<p>Smith &amp; Co. said &quot;no&quot;</p><br>Next"), "Smith & Co. said \"no\"\nNext");
});

// ---- P3-3: a null end date left as literal "to None" in source text reads as "to present" ----
test("stripTags() rewrites a null-end-date artifact ('to None') as 'to present'", () => {
  assert.equal(stripTags("<p>Justice X served from 2015 to None.</p>"), "Justice X served from 2015 to present.");
});

test("stripTags() leaves a genuine 'to <year>' date range untouched", () => {
  assert.equal(stripTags("<p>Justice X served from 2015 to 2020.</p>"), "Justice X served from 2015 to 2020.");
});

test("htmlToParagraphs reads Indian Kanoon structural titles", () => {
  const html = `<p id="p_1" title="Fact">The appellant was dismissed.</p>
    <p id="p_2" title="Issue">Whether the dismissal was valid?</p>
    <p id="p_3" title="Court's Reasoning">The court finds the restraint void.</p>
    <p>Plain paragraph without a title.</p>`;
  const paras = htmlToParagraphs(html);
  assert.deepEqual(paras.map((p) => p.paraClass), ["facts", "issues", "reasoning", "reasoning"]);
  assert.equal(paras[0].paraNumber, "1");
  assert.equal(paras[3].paraNumber, null);
});

test("htmlToParagraphs falls back to plain lines when there are no block tags", () => {
  const paras = htmlToParagraphs("Section 27\nAgreement in restraint of trade is void.", { fallbackClass: "provision" });
  assert.equal(paras.length, 2);
  assert.equal(paras[0].paraClass, "provision");
});

test("classFromTitle keeps arguments distinct from the court's own reasoning", () => {
  assert.equal(classFromTitle("Petitioner's Argument", "reasoning"), "petitioner_arguments");
  assert.equal(classFromTitle("Respondent's Argument", "reasoning"), "respondent_arguments");
  assert.equal(classFromTitle("Conclusion", "reasoning"), "holding");
  assert.equal(classFromTitle(undefined, "provision"), "provision");
});

test("chunkParagraphs merges same-class paragraphs, splits on class change, and respects limits", () => {
  const paras = [
    { text: "a".repeat(400), paraClass: "facts", paraNumber: "1" },
    { text: "b".repeat(400), paraClass: "facts", paraNumber: "2" },
    { text: "c".repeat(400), paraClass: "facts", paraNumber: "3" },
    { text: "d".repeat(100), paraClass: "holding", paraNumber: "4" },
  ];
  const chunks = chunkParagraphs(paras, { target: 900, max: 1600 });
  assert.equal(chunks.length, 3);
  assert.deepEqual(chunks.map((c) => c.paraClass), ["facts", "facts", "holding"]);
  assert.ok(chunks.every((c, i) => c.ordinal === i && c.text.length <= 1600));
  assert.equal(chunkParagraphs(paras, { maxChunks: 1 }).length, 1);
});

test("chunkParagraphs hard-splits a single oversized paragraph", () => {
  const chunks = chunkParagraphs([{ text: "x".repeat(5000), paraClass: "reasoning", paraNumber: null }], { max: 1000, target: 900 });
  assert.ok(chunks.length >= 5);
  assert.ok(chunks.every((c) => c.text.length <= 1000));
});

test("mapDocSource maps court and statute names", () => {
  assert.equal(mapDocSource("Supreme Court of India"), "supreme_court");
  assert.equal(mapDocSource("Delhi High Court"), "high_court");
  assert.equal(mapDocSource("Central Government Act"), "bare_act");
  assert.equal(mapDocSource("Income Tax Appellate Tribunal - Mumbai"), "tribunal");
  assert.equal(mapDocSource("Something else"), "other");
});
