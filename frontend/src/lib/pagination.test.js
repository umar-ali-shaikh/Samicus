import test from "node:test";
import assert from "node:assert/strict";
import { paginationInfo, PAGE_SIZE } from "./pagination.js";

test("paginationInfo reports 0 results as all-zero/disabled, never a bogus range", () => {
  assert.deepEqual(paginationInfo(0, 0, 0), { rangeStart: 0, rangeEnd: 0, totalPages: 0, hasPrev: false, hasNext: false });
});

test("paginationInfo computes the first page of a large result set (the reported '1-10 of 9836' bug)", () => {
  const info = paginationInfo(9836, 0, PAGE_SIZE);
  assert.equal(info.rangeStart, 1);
  assert.equal(info.rangeEnd, 10);
  assert.equal(info.totalPages, 984);
  assert.equal(info.hasPrev, false);
  assert.equal(info.hasNext, true);
});

test("paginationInfo computes a middle page correctly", () => {
  const info = paginationInfo(9836, 3, PAGE_SIZE);
  assert.equal(info.rangeStart, 31);
  assert.equal(info.rangeEnd, 40);
  assert.equal(info.hasPrev, true);
  assert.equal(info.hasNext, true);
});

test("paginationInfo's last (short) page has no next and a range that stops at `found`", () => {
  const info = paginationInfo(25, 2, 5); // page 2 (0-based) only returned 5 of a full 10-page size
  assert.equal(info.rangeStart, 21);
  assert.equal(info.rangeEnd, 25);
  assert.equal(info.hasNext, false);
});
