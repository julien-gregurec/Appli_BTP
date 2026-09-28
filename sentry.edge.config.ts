import * as Sentry from "@sentry/nextjs";
import { nettoyerEvenementSentry } from "@/lib/sentry-nettoyage";

// Surveillance des erreurs côté edge (proxy / fonctions edge). Pas de PII (RGPD).
const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: process.env.NODE_ENV === "production" && Boolean(dsn),
  sendDefaultPii: false,
  // Jetons de partage, de réinitialisation et d'invitation hors des événements envoyés.
  beforeSend: (evenement) => nettoyerEvenementSentry(evenement),
  beforeSendTransaction: (evenement) => nettoyerEvenementSentry(evenement),
  tracesSampleRate: 0.1,
});
