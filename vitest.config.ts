import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Paquets partagés du dépôt. Next.js les résout via les `paths` du
      // tsconfig ; Vitest ne lit pas ce fichier et a besoin de l'alias ici,
      // faute de quoi tout test important un paquet `@elsatia/…` échoue au
      // chargement.
      "@elsatia/application-access": fileURLToPath(
        new URL("./packages/application-access/src/index.ts", import.meta.url),
      ),
      "@elsatia/email": fileURLToPath(new URL("./packages/email/src/index.ts", import.meta.url)),
      "@elsatia/client-contracts": fileURLToPath(
        new URL("./packages/client-contracts/src/index.ts", import.meta.url),
      ),
      // Next.js intercepte cet import spécial au build ; en dehors de son
      // bundler (ici Vitest), le vrai paquet lève systématiquement une
      // erreur. On le neutralise comme le fait Next, uniquement pour les tests.
      "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "packages/**/*.test.ts"],
  },
});
