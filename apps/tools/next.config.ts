import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: {
    // Tools est autonome : ne pas faire remonter la résolution au monorepo parent.
    root: fileURLToPath(new URL("./", import.meta.url)),
  },
};

export default nextConfig;
