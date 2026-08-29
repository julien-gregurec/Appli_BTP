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

- `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` : annuaire commun ;
- `ELSATIA_APPLICATION_ENV` : sélectionne les URL `local`, `preview` ou `production` du catalogue central ;
- `NEXT_PUBLIC_ELSATIA_ACCOUNT_URL` : portail de compte et d’abonnements ;
- `NEXT_PUBLIC_COLORS_URL` : origine publique de Colors utilisée par les métadonnées de l’application.

Toutes les destinations du sélecteur résident dans `applications_elsatia`. Une future application apparaît automatiquement et reste non cliquable tant que son URL d’environnement n’est pas configurée. Il n’existe plus de liste parallèle Gestion Pro/Colors dans le code.

L’administrateur plateforme est résolu exclusivement par le contrat canonique : `auth.uid()` → `plateforme_admins.utilisateur_id` actif → `est_plateforme_admin()`. Son email n’est jamais une condition d’autorisation.

## PWA

Colors possède son manifeste, ses icônes et son service worker `sw-colors.js`. Le cache porte le préfixe `elsatia-colors-` et ne partage aucun nom de cache avec Gestion Pro. Le service worker ne précharge que le shell public minimal et ne met pas en cache les réponses métier authentifiées.

## Commandes de validation

```bash
npm run test --prefix apps/colors
npm run typecheck --prefix apps/colors
npm run lint --prefix apps/colors
npm run build --prefix apps/colors
```

L’alignement canonique et le protocole de vérification sont documentés dans `docs/architecture/ELSATIA_COLORS_CANONICAL_INTEGRATION_V1.md`.
