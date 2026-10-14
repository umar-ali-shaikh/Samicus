import { baseConfig } from "@vidhira/config/eslint.base.js";

export default [
  ...baseConfig,
  {
    // No Database type is generated for this project (the rest of the backend talks to
    // Supabase from plain, untyped JS -- see config/db.js), and Qdrant's REST responses have
    // no official types either (qdrant.ts is "a thin REST client, no SDK dependency" by
    // design) -- these files necessarily touch rows/responses as `any`, the same untyped
    // shape the rest of the codebase already accepts for both.
    files: ["src/ingest.ts", "src/retrieve.ts", "src/clauses.ts", "src/reprocess.ts", "src/supabaseClient.ts", "src/qdrant.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-call": "off",
    },
  },
  {
    // chunk.ts's functions intentionally accept `unknown` (ported from JS that leaned on
    // String(x ?? "") to defensively coerce whatever a source document's HTML/text field
    // actually was) -- the stringification is the point, not an accident.
    files: ["src/chunk.ts"],
    rules: {
      "@typescript-eslint/no-base-to-string": "off",
    },
  },
  {
    // node:test's test()/before()/beforeEach() return promises the test runner tracks
    // itself -- awaiting them at the call site isn't the idiom this whole codebase's test
    // suites use. Mocked fetch/response stubs also routinely implement an async interface
    // without every method needing its own await, and `any` is the common currency for
    // ad-hoc mock shapes.
    files: ["src/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
    },
  },
];
