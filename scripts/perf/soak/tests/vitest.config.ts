// ELSATIA SOAK V1 — tests rouges et sondes hors suite unitaire (npm test ne les voit pas).
// Lancement : npx vitest run --config scripts/perf/soak/tests/vitest.config.ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../../../../src", import.meta.url)),
      "server-only": fileURLToPath(new URL("../../../../src/test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    root: fileURLToPath(new URL(".", import.meta.url)),
    include: ["*.soak.test.ts"],
    testTimeout: 60_000,
  },
});
