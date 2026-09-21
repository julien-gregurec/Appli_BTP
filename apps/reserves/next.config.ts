import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  transpilePackages: ["@elsatia/application-access", "@elsatia/email"],
  poweredByHeader: false,
  // Chromium headless et son pilote ne sont jamais empaquetés par le bundler : ils sont
  // chargés à l'exécution par la route de génération de PDF, comme dans Gestion Pro.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  experimental: {
    // Les photos de chantier transitent par une action serveur. Elles sont compressées
    // côté navigateur avant l'envoi (≈ 2048 px, JPEG 0.85) ; cette marge couvre les
    // clichés qui restent lourds après compression sans ouvrir la porte à un envoi brut.
    serverActions: { bodySizeLimit: "8mb" },
  },
  turbopack: {
    // Le package d'accès applicatif est une dépendance locale liée hors de apps/reserves :
    // la racine Turbopack doit englober les deux emplacements.
    root: fileURLToPath(new URL("../../", import.meta.url)),
  },
};

export default nextConfig;
