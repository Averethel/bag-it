import nextVitals from "eslint-config-next/core-web-vitals"
import sonarjs from "eslint-plugin-sonarjs"

const focusedSonarRules = {
  ...sonarjs.configs.recommended.rules,
  "sonarjs/cognitive-complexity": ["error", 10],
  "sonarjs/nested-control-flow": "error",
  "sonarjs/no-all-duplicated-branches": "error",
  "sonarjs/no-collapsible-if": "error",
  "sonarjs/no-duplicated-branches": "error",
  "sonarjs/no-identical-expressions": "error",
  "sonarjs/no-identical-functions": "error",
  "sonarjs/no-inverted-boolean-check": "error",
  "sonarjs/no-redundant-boolean": "error",
  "sonarjs/prefer-single-boolean-return": "error",
  "sonarjs/regex-complexity": "error",
}

const eslintConfig = [
  ...nextVitals,
  {
    files: [
      "packages/**/*.{ts,tsx}",
      "src/features/steps/v2/**/*.{ts,tsx}",
    ],
    plugins: {
      sonarjs,
    },
    rules: focusedSonarRules,
    settings: sonarjs.configs.recommended.settings,
  },
  {
    files: ["packages/part-matching/src/**/*.{ts,tsx}"],
    ignores: ["packages/part-matching/src/__tests__/**"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          "@bag-it/callout-parts",
          "@bag-it/part-colors",
          "@bag-it/step-callouts",
          "@bag-it/test-support",
          "pdfjs-dist",
          "react",
          "next",
          "@chakra-ui/react",
        ],
        patterns: [
          "@/*",
          "src/*",
          "../../../src/*",
          "**/browser-step-detector-adapter",
          "**/part-extraction",
          "**/preview-images",
          "**/session-file",
          "**/step-callout-bagging",
        ],
      }],
    },
  },
  {
    files: ["packages/part-colors/src/**/*.{ts,tsx}"],
    ignores: ["packages/part-colors/src/__tests__/**"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          "@bag-it/callout-parts",
          "@bag-it/step-callouts",
          "@bag-it/test-support",
          "pdfjs-dist",
          "react",
          "next",
          "@chakra-ui/react",
        ],
        patterns: [
          "@/*",
          "src/*",
          "../../../src/*",
          "**/browser-step-detector-adapter",
          "**/part-extraction",
          "**/preview-images",
          "**/session-file",
          "**/step-callout-bagging",
        ],
      }],
    },
  },
  {
    files: ["packages/step-callouts/src/**/*.{ts,tsx}"],
    ignores: ["packages/step-callouts/src/__tests__/**"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          "@bag-it/test-support",
          "pdfjs-dist",
          "react",
          "next",
          "@chakra-ui/react",
        ],
        patterns: [
          "@/*",
          "src/*",
          "../../../src/*",
          "**/step-callout-detection",
          "**/part-extraction",
          "**/preview-images",
          "**/session-file",
          "**/step-callout-bagging",
        ],
      }],
    },
  },
  {
    files: ["packages/callout-parts/src/**/*.{ts,tsx}"],
    ignores: ["packages/callout-parts/src/__tests__/**"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          "@bag-it/test-support",
          "pdfjs-dist",
          "react",
          "next",
          "@chakra-ui/react",
        ],
        patterns: [
          "@/*",
          "src/*",
          "../../../src/*",
          "**/step-callout-detection",
          "**/browser-step-detector-adapter",
          "**/part-extraction",
          "**/preview-images",
          "**/session-file",
          "**/step-callout-bagging",
        ],
      }],
    },
  },
  {
    files: [
      "**/*.{ts,tsx}",
      "**/*.mjs",
    ],
    ignores: [
      "packages/**/src/__tests__/**",
      "scripts/**",
      "vitest.config.ts",
      "vitest.setup.ts",
    ],
    rules: {
      "no-restricted-imports": ["error", {
        paths: ["@bag-it/test-support"],
      }],
    },
  },
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "webwright-artifacts/**",
    ],
  },
]

export default eslintConfig
