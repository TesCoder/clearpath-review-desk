import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // "server-only" is a Next.js build-time guard; it has nothing to check in a test run.
      "server-only": fileURLToPath(new URL("./eval/empty.ts", import.meta.url)),
    },
  },
  test: { testTimeout: 120_000 },
});
