# Configuration Sentry

Un DSN Sentry sert au routage des événements et n’accorde pas d’accès au compte.
Il doit être configuré explicitement afin d’éviter d’envoyer des erreurs vers le
mauvais projet. Aucun DSN de secours n'est intégré à l'application.

Variables attendues :

- `SENTRY_DSN` pour le serveur et l’edge ;
- `NEXT_PUBLIC_SENTRY_DSN` pour le navigateur ;
- `SENTRY_ORG`, `SENTRY_PROJECT` et `SENTRY_AUTH_TOKEN` uniquement au build pour
  téléverser les source maps.

Sans `NEXT_PUBLIC_SENTRY_DSN`, la télémétrie navigateur reste désactivée. Sans
`SENTRY_DSN` ni `NEXT_PUBLIC_SENTRY_DSN`, la télémétrie serveur et edge reste
également désactivée. `sendDefaultPii` reste désactivé et les valeurs des variables
locales serveur ne sont pas jointes aux événements.
