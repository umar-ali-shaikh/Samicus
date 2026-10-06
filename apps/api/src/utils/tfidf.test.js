import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTfidfRanker, rankWithScores, rerankByRelevance } from "./tfidf.js";

test("buildTfidfRanker() scores the more relevant document higher", () => {
  const documents = [
    "Karan vs State Of Haryana — bail application in an unrelated property dispute",
    "The Code Of Criminal Procedure, 1973 Section 154 — information in cognizable cases, FIR registration procedure",
  ];
  const scoreQuery = buildTfidfRanker(documents);
  const scores = scoreQuery("FIR registration procedure information cognizable");

  assert.ok(scores[1] > scores[0], "the statute about FIR procedure should score higher than the unrelated bail case");
});

test("buildTfidfRanker() never throws on an empty or all-stopword query", () => {
  const scoreQuery = buildTfidfRanker(["some document text", "another document"]);
  assert.deepEqual(scoreQuery(""), [0, 0]);
  assert.deepEqual(scoreQuery("the a of"), [0, 0]);
});

test("rerankByRelevance() reorders items so the most relevant comes first", () => {
  const items = [
    { title: "Unrelated tenancy case" },
    { title: "Code Of Criminal Procedure Section 154 FIR registration procedure" },
    { title: "Another unrelated contract dispute" },
  ];

  const reranked = rerankByRelevance("FIR registration procedure", items, (i) => i.title);

  assert.equal(reranked[0].title, "Code Of Criminal Procedure Section 154 FIR registration procedure");
  assert.equal(reranked.length, 3);
});

test("rerankByRelevance() is a no-op for 0 or 1 items", () => {
  assert.deepEqual(rerankByRelevance("q", [], (i) => i), []);
  const single = [{ title: "only one" }];
  assert.equal(rerankByRelevance("q", single, (i) => i.title), single);
});

test("rankWithScores() gives a candidate with zero vocabulary overlap a score of exactly 0", () => {
  const items = [
    { title: "Kerala Municipality Act municipal governance taxation" },
    { title: "Code Of Criminal Procedure Section 154 FIR registration procedure" },
  ];

  const ranked = rankWithScores("FIR registration police procedure", items, (i) => i.title);

  assert.equal(ranked[0].item.title, items[1].title);
  assert.ok(ranked[0].score > 0);
  assert.equal(ranked[1].score, 0); // zero shared vocabulary — callers can filter this out entirely
});

test("rankWithScores() scores a single candidate too, not just orders it", () => {
  const ranked = rankWithScores("FIR procedure", [{ title: "unrelated municipal tax matter" }], (i) => i.title);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].score, 0);
});
