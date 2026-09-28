import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: {
    alias: {
      "@elsatia/studio-domain": fileURLToPath(
        new URL("../../packages/studio-domain/src/index.ts", import.meta.url),
      ),
      "@elsatia/identity": fileURLToPath(
        new URL("../../packages/elsatia-identity/src/index.ts", import.meta.url),
      ),
      "@elsatia/incident-control": fileURLToPath(
        new URL("../../packages/incident-control/src/index.ts", import.meta.url),
      ),
    },
  },
  test: { include: ["tests/**/*.test.ts"] },
});
