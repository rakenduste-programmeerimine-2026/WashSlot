import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Needs local Supabase running. Kept out of `npm test`.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: ["**/*.integration.test.ts"],
    exclude: ["node_modules", ".next", "qa"],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
