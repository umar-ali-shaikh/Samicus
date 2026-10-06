import test from "node:test";
import assert from "node:assert/strict";
import { citesActWithoutYear, ACT_YEAR_REFERENCE } from "./legalAbbrev.js";

// ---- P3-2: deterministic Act-name/year verification ----
test("citesActWithoutYear() flags a well-known Act named without its year", () => {
  assert.equal(citesActWithoutYear("You can file a complaint under the Payment of Wages Act for unpaid wages."), true);
});

test("citesActWithoutYear() does not flag the Act when its correct year is given, comma or no comma", () => {
  assert.equal(citesActWithoutYear("You can file a complaint under the Payment of Wages Act, 1936 for unpaid wages."), false);
  assert.equal(citesActWithoutYear("The Payment of Wages Act 1936 applies here."), false);
});

test("citesActWithoutYear() does not flag text that names no known Act at all", () => {
  assert.equal(citesActWithoutYear("Please consult a qualified lawyer about your situation."), false);
});

test("citesActWithoutYear() catches multiple distinct Acts, flagging if ANY is missing its year", () => {
  assert.equal(citesActWithoutYear("Under the Code on Wages, 2019 and the Industrial Disputes Act, you may have a claim."), true);
  assert.equal(citesActWithoutYear("Under the Code on Wages, 2019 and the Industrial Disputes Act, 1947, you may have a claim."), false);
});

test("ACT_YEAR_REFERENCE includes the Code on Wages, 2019", () => {
  assert.match(ACT_YEAR_REFERENCE, /Code On Wages 2019/);
});
