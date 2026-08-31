import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const isNativeBuild = process.env.ELSATIA_TOOLS_NATIVE === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@elsatia/application-access"],
  ...(isNativeBuild ? { output: "export" as const, trailingSlash: true } : {}),
  turbopack: {
    // Tools reste autonome ; le build Webpack transpile le seul package partagé déclaré.
    root: fileURLToPath(new URL("./", import.meta.url)),
  },
};

export default nextConfig;
