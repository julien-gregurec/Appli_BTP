import * as Sentry from "@sentry/nextjs";
import { nettoyerEvenementSentry } from "@/lib/sentry-nettoyage";

// Surveillance des erreurs côté navigateur. Pas d'enregistrement d'écran (vie privée + quota).
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: process.env.NODE_ENV === "production" && Boolean(dsn),
  sendDefaultPii: false,
  // L'URL d'une page de partage ou de confirmation porte un jeton : jamais transmise telle quelle.
  beforeSend: (evenement) => nettoyerEvenementSentry(evenement),
  beforeSendTransaction: (evenement) => nettoyerEvenementSentry(evenement),
  tracesSampleRate: 0.1,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
