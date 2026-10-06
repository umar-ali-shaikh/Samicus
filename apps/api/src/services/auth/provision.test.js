import test from "node:test";
import assert from "node:assert/strict";
import { bootstrapRole } from "./provision.js";

test("privileged roles come only from the env allow-lists", () => {
  process.env.ADMIN_EMAILS = "Ops@Vidhira.in, second@vidhira.in";
  process.env.FOUNDER_EMAILS = "founder@vidhira.in";
  assert.equal(bootstrapRole("ops@vidhira.in"), "admin");
  assert.equal(bootstrapRole("SECOND@vidhira.in"), "admin");
  assert.equal(bootstrapRole("founder@vidhira.in"), "founder");
  assert.equal(bootstrapRole("random@gmail.com"), null);
  assert.equal(bootstrapRole(""), null);
  delete process.env.ADMIN_EMAILS;
  delete process.env.FOUNDER_EMAILS;
  assert.equal(bootstrapRole("ops@vidhira.in"), null);
});
