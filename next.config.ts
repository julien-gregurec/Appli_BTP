import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// ExcelJS charge ses dépendances par des require dynamiques dans des .mjs, que
// le traçage de Next ne détecte pas : elles manquaient dans la fonction déployée
// et les exports tombaient en erreur 500 (« Cannot find module 'fast-csv' »).
// On liste ici toute la chaîne, transitives comprises, pour les deux routes qui
// génèrent des fichiers Excel.
// Fermeture transitive complète (22 paquets) : une seule dépendance manquante
// suffit à faire crasher la fonction au démarrage.
const FICHIERS_EXCELJS = [
  "./node_modules/@excel.js/**/*",
  "./node_modules/@fast-csv/format/**/*",
  "./node_modules/@fast-csv/parse/**/*",
  "./node_modules/binary/**/*",
  "./node_modules/bluebird/**/*",
  "./node_modules/buffers/**/*",
  "./node_modules/chainsaw/**/*",
  "./node_modules/dayjs/**/*",
  "./node_modules/fast-csv/**/*",
  "./node_modules/immediate/**/*",
  "./node_modules/lie/**/*",
  "./node_modules/lodash.escaperegexp/**/*",
  "./node_modules/lodash.groupby/**/*",
  "./node_modules/lodash.uniq/**/*",
  "./node_modules/pako/**/*",
  "./node_modules/saxes/**/*",
  "./node_modules/tmp/**/*",
  "./node_modules/traverse/**/*",
  "./node_modules/xmlchars/**/*",
];

const nextConfig: NextConfig = {
  // Chargé depuis node_modules à l'exécution plutôt que bundlé : c'est ce qui
  // permet aux require dynamiques d'ExcelJS de se résoudre.
  serverExternalPackages: ["@excel.js/exceljs"],
  outputFileTracingIncludes: {
    "/api/exports/*": FICHIERS_EXCELJS,
    "/api/inventaires/*/cloture": FICHIERS_EXCELJS,
  },
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
