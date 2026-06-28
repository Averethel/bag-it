import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    css: true,
    exclude: ["tests/e2e/**/*.spec.ts", "node_modules/**"],
  },
  resolve: {
    alias: {
      "@bag-it/callout-parts": new URL("./packages/callout-parts/src/index.ts", import.meta.url).pathname,
      "@bag-it/part-colors": new URL("./packages/part-colors/src/index.ts", import.meta.url).pathname,
      "@bag-it/part-matching": new URL("./packages/part-matching/src/index.ts", import.meta.url).pathname,
      "@bag-it/raster-quantity-labels": new URL("./packages/raster-quantity-labels/src/index.ts", import.meta.url).pathname,
      "@bag-it/step-callouts": new URL("./packages/step-callouts/src/index.ts", import.meta.url).pathname,
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
})
