import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
const config: NextConfig = {
  transpilePackages: ["@elsatia/studio-domain"],
  poweredByHeader: false,
  turbopack: { root: fileURLToPath(new URL("../../", import.meta.url)) },
  allowedDevOrigins: ["127.0.0.1"],
  experimental: { serverActions: { bodySizeLimit: "64kb" } },
};
export default config;
