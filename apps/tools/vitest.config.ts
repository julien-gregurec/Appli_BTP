import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
  // Même alias que `tsconfig.json` : les routes de métadonnées (`app/robots.ts`, `app/sitemap.ts`)
  // importent `@/lib/...` et doivent rester testables sans passer par le build Next.
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
