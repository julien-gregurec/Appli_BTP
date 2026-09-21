import * as Sentry from "@sentry/nextjs";

// Surveillance des erreurs côté serveur (Node). Données personnelles jamais envoyées (RGPD).
const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: process.env.NODE_ENV === "production" && Boolean(dsn),
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
  // Les variables locales peuvent contenir des données métier ou des secrets.
  includeLocalVariables: false,
});
