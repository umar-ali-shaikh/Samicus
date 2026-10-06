// @ts-check
import tseslint from "typescript-eslint";
import security from "eslint-plugin-security";
import importX from "eslint-plugin-import-x";

/**
 * Shared ESLint flat-config base for every Vidhira TypeScript workspace.
 * Each app/package spreads this array and appends its own framework-specific config
 * (e.g. eslint-config-next for apps/web).
 */
export const baseConfig = tseslint.config(
  {
    ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**", "**/coverage/**"],
  },
  // Config files (eslint.config.js itself, etc.) aren't part of any tsconfig's "include",
  // so type-aware rules can't run on them -- lint them with the plain (non-type-checked) rules.
  {
    files: ["**/*.config.{js,mjs,cjs,ts}"],
    extends: [tseslint.configs.recommended],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["**/*.config.{js,mjs,cjs,ts}"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: process.cwd(),
      },
    },
  },
  security.configs.recommended,
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
      "import-x/no-cycle": "error",
      "import-x/no-self-import": "error",
    },
  },
);

export default baseConfig;
