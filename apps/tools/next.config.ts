import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { buildSecurityHeaders } from "./src/lib/security-headers";

const isNativeBuild = process.env.ELSATIA_TOOLS_NATIVE === "1";

/*
 * `output: "export"` ne supporte pas `headers` (cf. node_modules/next/dist/docs/01-app/02-guides/
 * static-exports.md) : le build natif est servi par le WebView Capacitor, pas par un serveur HTTP.
 * On n'installe donc la politique que sur le build web public (tools.elsatia.fr).
 */
const securityHeaders = buildSecurityHeaders({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  billingApiUrl: process.env.NEXT_PUBLIC_TOOLS_BILLING_API_URL,
  isDevelopment: process.env.NODE_ENV !== "production",
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@elsatia/application-access"],
  ...(isNativeBuild
    ? { output: "export" as const, trailingSlash: true }
    : { headers: async () => [{ source: "/:path*", headers: securityHeaders }] }),
  turbopack: {
    // Tools reste autonome ; le build Webpack transpile le seul package partagé déclaré.
    root: fileURLToPath(new URL("./", import.meta.url)),
  },
};

export default nextConfig;
