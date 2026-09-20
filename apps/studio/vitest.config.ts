import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: {
    alias: {
      "@elsatia/studio-domain": fileURLToPath(
        new URL("../../packages/studio-domain/src/index.ts", import.meta.url),
      ),
    },
  },
  // Source-walking boundary tests read the whole tree; allow slow external volumes.
  test: { include: ["tests/**/*.test.ts"], testTimeout: 60000 },
});
