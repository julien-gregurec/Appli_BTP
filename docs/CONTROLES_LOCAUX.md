# Contrôles locaux et CI

## Contrôle complet reproductible

Depuis la racine du dépôt :

```bash
npm ci
npm run verify
```

`npm run verify` supprime d’abord `.next` et `tsconfig.tsbuildinfo`, puis exécute
TypeScript, ESLint, Vitest, la validation des migrations, la détection de secrets
et le build Next.js. Il ne dépend donc pas d’un ancien cache local.

Le même contrôle est exécuté par GitHub Actions sur chaque pull request et chaque
push vers `main`. La CI ne déploie jamais automatiquement en production.

## Base Supabase locale

Prérequis : Docker Desktop démarré et Supabase CLI installé par le projet.

```bash
npm run db:start
npm run db:reset
npm run test:db
```

- `db:start` démarre exclusivement les conteneurs locaux.
- `db:reset` reconstruit la base locale et applique toutes les migrations.
- `test:db` exécute les quatre suites SQL de `supabase/tests`.

Vérifier avant tout test que `npx supabase status` affiche des URL en
`127.0.0.1`. Ne jamais utiliser `supabase db reset --linked` ni une URL de
production pour ces tests.

Si Docker n’est pas disponible, utiliser un projet Supabase de test séparé,
sans données clientes, avec des clés dédiées et une vérification explicite de
l’identifiant du projet avant d’appliquer les migrations. La production n’est
jamais une solution de remplacement.

## Dernier contrôle exécuté

Contrôle local du 28 juillet 2026 :

- reconstruction complète de la base locale depuis une base vierge : réussie ;
- application de toutes les migrations jusqu’à `20260724000179` : réussie ;
- `actions_nom_propre.test.sql` : réussi ;
- `archivage_notes_frais_rls.test.sql` : réussi ;
- `borne_stock_securisee.test.sql` : réussi ;
- `plateforme_impayes.test.sql` : réussi ;
- résultat pgTAP : 4 fichiers, 38 tests, 38 réussis.

Ce contrôle a détecté puis permis de corriger la signature de la fonction
temporaire `debug_pointage_manquant(date)` dans la migration 164. Les assertions
pgTAP ont également été alignées sur les politiques de lecture ajoutées pour le
créateur d’une note de frais et la préparation des virements.
