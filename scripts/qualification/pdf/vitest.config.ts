// Configuration Vitest de la qualification PDF du bon de commande (hors suite unitaire :
// lancée par scripts/qualification/rgpd-residual-debt-v1.sh avec des données réelles).
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../../../src", import.meta.url)),
      "server-only": fileURLToPath(new URL("../../../src/test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    root: fileURLToPath(new URL(".", import.meta.url)),
    include: ["*.qualif.test.ts"],
    testTimeout: 60_000,
  },
});
