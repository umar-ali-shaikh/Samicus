import test from "node:test";
import assert from "node:assert/strict";
import { assembleDraft, checkClauseGuards, missingRequiredFields } from "./drafting.js";

const FIELD_SCHEMA = [
  { key: "recipientName", label: "Recipient name", placeholder: "Recipient Name", required: true },
  { key: "recipientAddress", label: "Recipient address", placeholder: "Recipient Address" },
];

const TEMPLATE = {
  baseSections: [{ key: "recipient", heading: "To", bodyTemplate: "To: {{recipientName}}, {{recipientAddress}}" }],
  fieldSchema: FIELD_SCHEMA,
};

test("assembleDraft never renders the UI placeholder hint text as if it were real content", () => {
  const { blocks } = assembleDraft({ template: TEMPLATE, fieldValues: {}, selectedClauses: [], customClauses: [] });
  assert.ok(!blocks[0].text.includes("Recipient Name"), "must not substitute the placeholder hint verbatim");
  assert.match(blocks[0].text, /NOT FILLED IN/);
});

test("assembleDraft renders real values when provided", () => {
  const { blocks } = assembleDraft({ template: TEMPLATE, fieldValues: { recipientName: "Acme Pvt Ltd", recipientAddress: "123 MG Road" }, selectedClauses: [], customClauses: [] });
  assert.equal(blocks[0].text, "To: Acme Pvt Ltd, 123 MG Road");
});

test("missingRequiredFields lists only required fields that are empty/whitespace", () => {
  assert.deepEqual(missingRequiredFields(FIELD_SCHEMA, {}), ["Recipient name"]);
  assert.deepEqual(missingRequiredFields(FIELD_SCHEMA, { recipientName: "   " }), ["Recipient name"]);
  assert.deepEqual(missingRequiredFields(FIELD_SCHEMA, { recipientName: "Acme Pvt Ltd" }), []);
});

test("checkClauseGuards still flags conflicting clauses and missing clause-required fields (unaffected by the placeholder fix)", () => {
  const library = [
    { _id: "a", title: "Clause A", conflictsWith: ["b"], requiresFields: [] },
    { _id: "b", title: "Clause B", conflictsWith: ["a"], requiresFields: ["securityDeposit"] },
  ];
  const errors = checkClauseGuards(["a", "b"], library, {});
  assert.ok(errors.some((e) => e.includes("conflicts with")));
  assert.ok(errors.some((e) => e.includes("securityDeposit")));
});
