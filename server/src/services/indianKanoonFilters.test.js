import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFormInput } from "./indianKanoonFilters.js";

test("returns the bare query when there are no filters", () => {
  assert.equal(buildFormInput("cheque bounce"), "cheque bounce");
});

test("appends doctypes for a single court", () => {
  assert.equal(buildFormInput("bail", { court: "supremecourt" }), "bail doctypes:supremecourt");
});

test("joins multiple courts with commas", () => {
  assert.equal(
    buildFormInput("bail", { court: ["bombay", "delhi"] }),
    "bail doctypes:bombay,delhi"
  );
});

test("appends date range filters", () => {
  assert.equal(
    buildFormInput("bail", { fromDate: "01-01-2020", toDate: "31-12-2020" }),
    "bail fromdate:01-01-2020 todate:31-12-2020"
  );
});

test("quotes multi-word title/cite/author/bench values", () => {
  assert.equal(
    buildFormInput("", { title: "Union of India", author: "Chandrachud" }),
    'title:"Union of India" author:Chandrachud'
  );
});

test("combines query and every filter in order", () => {
  const result = buildFormInput("negligence", {
    court: "delhi",
    fromDate: "01-01-2019",
    toDate: "01-01-2020",
    title: "Sharma",
    cite: "AIR 2020 SC 1",
    author: "Rao",
    bench: "Rao",
  });
  assert.equal(
    result,
    'negligence doctypes:delhi fromdate:01-01-2019 todate:01-01-2020 title:Sharma cite:"AIR 2020 SC 1" author:Rao bench:Rao'
  );
});

test("handles an empty query with only filters", () => {
  assert.equal(buildFormInput("", { court: "tribunals" }), "doctypes:tribunals");
});
