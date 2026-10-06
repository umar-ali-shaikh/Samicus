import test from "node:test";
import assert from "node:assert/strict";
import { stripHtmlTags } from "./format.js";

test("stripHtmlTags removes Indian Kanoon's <b> highlight markup from a title", () => {
  assert.equal(stripHtmlTags("State of Punjab vs <b>Baldev</b> Singh"), "State of Punjab vs Baldev Singh");
});

test("stripHtmlTags is a no-op for a plain title", () => {
  assert.equal(stripHtmlTags("Kesavananda Bharati v State of Kerala"), "Kesavananda Bharati v State of Kerala");
});

test("stripHtmlTags handles null/undefined without throwing", () => {
  assert.equal(stripHtmlTags(null), "");
  assert.equal(stripHtmlTags(undefined), "");
});
