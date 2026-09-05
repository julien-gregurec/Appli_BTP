import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { headersSecuriteColors } from "./src/lib/security/en-tetes";

const nextConfig: NextConfig = {
  transpilePackages: ["@elsatia/application-access"],
  poweredByHeader: false,
  // En-têtes constants seulement. La CSP porte un nonce régénéré à chaque
  // requête : elle est émise par `src/proxy.ts`, pas ici.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: headersSecuriteColors(process.env.NODE_ENV === "production"),
      },
    ];
  },
  turbopack: {
    // Le package commun est une dépendance locale liée hors de apps/colors.
    // Next 16 exige que la racine Turbopack englobe les deux emplacements.
    root: fileURLToPath(new URL("../../", import.meta.url)),
  },
};

export default nextConfig;
