import test from "node:test";
import assert from "node:assert/strict";
import { detectRedFlags } from "./contractReview.js";

test("detectRedFlags always flags a deposit-forfeiture-at-sole-discretion clause", () => {
  const flags = detectRedFlags("The security deposit shall be forfeited in full at the sole discretion of the Landlord.");
  assert.ok(flags.some((f) => f.id === "deposit_forfeiture_discretion"));
});

test("detectRedFlags always flags a steep, frequent rent-hike clause", () => {
  const flags = detectRedFlags("The rent shall increase by 25% every 3 months at the Landlord's sole option.");
  assert.ok(flags.some((f) => f.id === "steep_periodic_rent_hike"));
});

test("detectRedFlags always flags entry-without-notice", () => {
  const flags = detectRedFlags("The Landlord may enter the premises at any time without prior notice to the Tenant.");
  assert.ok(flags.some((f) => f.id === "entry_without_notice"));
});

test("detectRedFlags always flags a unilateral arbitrator appointment", () => {
  const flags = detectRedFlags("Any dispute shall be referred to an arbitrator appointed solely by the Landlord.");
  assert.ok(flags.some((f) => f.id === "unilateral_arbitrator"));
});

test("detectRedFlags always flags structural repairs pushed onto the tenant (responsibility-of-the-tenant ordering)", () => {
  const flags = detectRedFlags("All structural repairs shall be the sole responsibility of the Tenant.");
  assert.ok(flags.some((f) => f.id === "structural_repairs_burden"));
});

test("detectRedFlags always flags structural repairs pushed onto the tenant (tenant-responsible-for ordering)", () => {
  const flags = detectRedFlags("The Tenant shall be solely responsible for all structural repairs to the building.");
  assert.ok(flags.some((f) => f.id === "structural_repairs_burden"));
});

test("detectRedFlags always flags a one-sided lock-in (landlord free to terminate anytime)", () => {
  const flags = detectRedFlags(
    "The Tenant may not terminate this Agreement during the lock-in period of 11 months, however the Landlord may terminate this Agreement at any time by giving 15 days notice."
  );
  assert.ok(flags.some((f) => f.id === "one_sided_lock_in"));
});

test("detectRedFlags finds nothing in an ordinary, balanced clause", () => {
  assert.deepEqual(detectRedFlags("The Tenant shall pay rent on or before the fifth day of each month by bank transfer."), []);
});

test("detectRedFlags can match more than one rule on the same clause", () => {
  const flags = detectRedFlags(
    "The deposit shall be forfeited at the sole discretion of the Landlord, who may also enter the premises without prior notice."
  );
  assert.equal(flags.length, 2);
});
