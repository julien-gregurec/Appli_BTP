import * as Sentry from "@sentry/nextjs";

// Surveillance des erreurs côté edge (proxy / fonctions edge). Pas de PII (RGPD).
Sentry.init({
  dsn: process.env.SENTRY_DSN
    || process.env.NEXT_PUBLIC_SENTRY_DSN
    || "https://9447c145dd699b08099ce58c8a9431b2@o4511757753974784.ingest.de.sentry.io/4511757763149904",
  enabled: process.env.NODE_ENV === "production",
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
});
