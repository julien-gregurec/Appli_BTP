import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
};

export default withSentryConfig(nextConfig, {
  // Renseignés plus tard via les variables d'env SENTRY_ORG / SENTRY_PROJECT / SENTRY_AUTH_TOKEN
  // (pour rendre les erreurs lisibles). Sans eux, le build fonctionne, sans upload des source maps.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Upload plus large des fichiers client pour des traces plus lisibles.
  widenClientFileUpload: true,
  // Route-relais servie par notre domaine : contourne les bloqueurs de pub qui censurent Sentry.
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
});
