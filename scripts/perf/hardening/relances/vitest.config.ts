// ELSATIA PERFORMANCE HARDENING V9.1 — charge des relances automatiques (hors suite unitaire).
// Lancement : npx vitest run --config scripts/perf/hardening/relances/vitest.config.ts
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
    include: ["*.charge.test.ts"],
    testTimeout: 1_800_000,
  },
});
