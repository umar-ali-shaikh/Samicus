import test from "node:test";
import assert from "node:assert/strict";
import { bootstrapRole } from "./provision.js";

test("privileged roles come only from the env allow-lists", () => {
  process.env.ADMIN_EMAILS = "Ops@Samicus.in, second@samicus.in";
  process.env.FOUNDER_EMAILS = "founder@samicus.in";
  assert.equal(bootstrapRole("ops@samicus.in"), "admin");
  assert.equal(bootstrapRole("SECOND@samicus.in"), "admin");
  assert.equal(bootstrapRole("founder@samicus.in"), "founder");
  assert.equal(bootstrapRole("random@gmail.com"), null);
  assert.equal(bootstrapRole(""), null);
  delete process.env.ADMIN_EMAILS;
  delete process.env.FOUNDER_EMAILS;
  assert.equal(bootstrapRole("ops@samicus.in"), null);
});
