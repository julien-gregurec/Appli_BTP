import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  transpilePackages: ["@elsatia/application-access"],
  poweredByHeader: false,
  turbopack: {
    // Le package commun est une dépendance locale liée hors de apps/colors.
    // Next 16 exige que la racine Turbopack englobe les deux emplacements.
    root: fileURLToPath(new URL("../../", import.meta.url)),
  },
};

export default nextConfig;
