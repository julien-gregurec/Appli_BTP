# ELSATIA Colors

Application sœur autonome destinée au futur domaine `colors.elsatia.fr`.

## Développement local

Depuis la racine du dépôt :

```bash
npm install --prefix apps/colors
cp apps/colors/.env.example apps/colors/.env.local
npm run dev --prefix apps/colors
```

L’application écoute sur `http://localhost:3010`. Gestion Pro conserve son port et ses commandes actuels à la racine du dépôt.

## Identité et accès

Colors consomme le projet Supabase Auth et le contrat multi-app canoniques du dépôt `elsatia-main`. Sa session est créée sur son propre domaine ; aucun jeton n’est lu depuis le stockage navigateur d’une autre application.

Le compte est donc commun, mais chaque origine possède sa propre session. Le passage entre sous-domaines peut redemander une connexion tant qu’un échange SSO central signé n’a pas été mis en place. Cette limite volontaire évite de partager un cookie ou un jeton de manière fragile.

Toutes les routes du groupe `(colors)` passent par un layout serveur qui :

1. résout l’utilisateur, son organisation active et son appartenance avec la RPC commune `contexte_application_courant` ;
2. appelle `verifierAccesApplication(contexte, "colors")` ;
3. distingue uniquement le motif du refus : droit organisation absent ou habilitation utilisateur absente ;
4. appelle `exigerAccesApplication(contexte, "colors")` avant de rendre le shell.

La route `/api/acces` applique également `exigerAccesApplication` pour tester une invocation serveur directe.

## Variables

- `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` : annuaire commun ;
- `ELSATIA_APPLICATION_ENV` : sélectionne les URL `local`, `preview` ou `production` du catalogue central ;
- `NEXT_PUBLIC_ELSATIA_ACCOUNT_URL` : portail de compte et d’abonnements ;
- `NEXT_PUBLIC_COLORS_URL` : origine publique de Colors utilisée par les métadonnées de l’application et par le `redirectTo` de la réinitialisation.

La clé publique Supabase est portée par `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, convention unique
de l’écosystème (Gestion Pro, Tools, Colors). L’ancien nom `NEXT_PUBLIC_SUPABASE_ANON_KEY` n’est
plus lu et **n’est pas accepté en repli** : les clés JWT legacy (`anon`, `service_role`) ont été
désactivées ensemble au niveau du projet Supabase, donc une valeur portée par l’ancien nom
n’authentifierait plus rien. Les deux variables ne sont lues qu’à un seul endroit,
`src/lib/supabase/cles.ts`.

`SUPABASE_SERVICE_ROLE_KEY` reste serveur-only : elle n’est lue que par
`src/lib/supabase/admin-storage.ts` et n’a jamais de contrepartie `NEXT_PUBLIC_*`.

Toutes les destinations du sélecteur résident dans `applications_elsatia`. Une future application apparaît automatiquement et reste non cliquable tant que son URL d’environnement n’est pas configurée. Il n’existe plus de liste parallèle Gestion Pro/Colors dans le code.

L’administrateur plateforme est résolu exclusivement par le contrat canonique : `auth.uid()` → `plateforme_admins.utilisateur_id` actif → `est_plateforme_admin()`. Son email n’est jamais une condition d’autorisation.

## Garde de pré-déploiement

`next build` fige les `NEXT_PUBLIC_*` dans le bundle : un build Production lancé sans elles
**réussit** et livre un Colors sans authentification, sans photos et sans réinitialisation. Le
script `scripts/verify-public-env.mjs`, branché sur `prebuild`, refuse ce cas avant `next build`.

```bash
npm run verify:public-env --prefix apps/colors
```

Ce qu’il exige d’un build publié : `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_COLORS_URL`,
`NEXT_PUBLIC_ELSATIA_ACCOUNT_URL` et `ELSATIA_APPLICATION_ENV`. Ce qu’il refuse dans **tous** les
modes : une valeur en forme de clé de service ou de clé privée portée par une variable
`NEXT_PUBLIC_*`, quel que soit son nom. Il n’imprime jamais de valeur, seulement des noms de
variables et une raison.

Un build qui ne déclare pas son environnement est traité comme un build publié — c’est ce qui rend
la garde utile par défaut. Pour un build local ou de recette, déclarer `ELSATIA_APPLICATION_ENV=local` :

```bash
ELSATIA_APPLICATION_ENV=local npm run build --prefix apps/colors
```

## PWA

Colors possède son manifeste, ses icônes et son service worker `sw-colors.js`. Le cache porte le préfixe `elsatia-colors-` et ne partage aucun nom de cache avec Gestion Pro. Le service worker ne précharge que le shell public minimal et ne met pas en cache les réponses métier authentifiées.

## Commandes de validation

```bash
npm run test --prefix apps/colors
npm run typecheck --prefix apps/colors
npm run lint --prefix apps/colors
ELSATIA_APPLICATION_ENV=local npm run build --prefix apps/colors
```

Le `ELSATIA_APPLICATION_ENV=local` du dernier appel n’est pas décoratif : la garde de
pré-déploiement traite un build non déclaré comme un build publié et l’interrompt.

L’alignement canonique et le protocole de vérification sont documentés dans `docs/architecture/ELSATIA_COLORS_CANONICAL_INTEGRATION_V1.md`.
