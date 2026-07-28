# Configuration Sentry

Le DSN de secours historique est :

`https://9447c145dd699b08099ce58c8a9431b2@o4511757753974784.ingest.de.sentry.io/4511757763149904`

Un DSN Sentry sert au routage des événements et n’accorde pas d’accès au compte.
Il doit néanmoins être remplacé par une configuration explicite afin d’éviter
d’envoyer des erreurs vers le mauvais projet.

Variables attendues :

- `SENTRY_DSN` pour le serveur et l’edge ;
- `NEXT_PUBLIC_SENTRY_DSN` pour le navigateur ;
- `SENTRY_ORG`, `SENTRY_PROJECT` et `SENTRY_AUTH_TOKEN` uniquement au build pour
  téléverser les source maps.

Le fallback ne doit être supprimé qu’après un événement de test reçu dans le bon
projet sur chaque environnement. `sendDefaultPii` reste désactivé et les valeurs
des variables locales serveur ne sont pas jointes aux événements.
