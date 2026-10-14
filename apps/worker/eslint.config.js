import { baseConfig } from "@vidhira/config/eslint.base.js";

export default [
  ...baseConfig,
  {
    // node:test's test()/mock.module() calls return promises the test runner tracks itself --
    // awaiting them at the call site isn't the idiom this codebase's test suites use. Fake
    // boss/Supabase stubs also implement an async interface without every method needing an
    // await, and index signature access on a handlers-by-queue-name record is intentional.
    files: ["src/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/require-await": "off",
      "security/detect-object-injection": "off",
    },
  },
];
