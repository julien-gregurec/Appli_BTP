import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  transpilePackages: ["@elsatia/application-access"],
  poweredByHeader: false,
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
