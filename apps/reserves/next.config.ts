import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  transpilePackages: ["@elsatia/application-access"],
  poweredByHeader: false,
  turbopack: {
    // Le package d'accès applicatif est une dépendance locale liée hors de apps/reserves :
    // la racine Turbopack doit englober les deux emplacements.
    root: fileURLToPath(new URL("../../", import.meta.url)),
  },
};

export default nextConfig;
