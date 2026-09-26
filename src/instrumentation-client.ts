import * as Sentry from "@sentry/nextjs";

// Surveillance des erreurs côté navigateur. Pas d'enregistrement d'écran (vie privée + quota).
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: process.env.NODE_ENV === "production" && Boolean(dsn),
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
