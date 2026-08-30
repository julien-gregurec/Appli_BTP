import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const isNativeBuild = process.env.ELSATIA_TOOLS_NATIVE === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  ...(isNativeBuild ? { output: "export" as const, trailingSlash: true } : {}),
  turbopack: {
    // Tools est autonome : ne pas faire remonter la résolution au monorepo parent.
    root: fileURLToPath(new URL("./", import.meta.url)),
  },
};

export default nextConfig;
