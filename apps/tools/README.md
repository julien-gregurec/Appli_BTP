# ELSATIA Tools

Application chantier autonome et freemium destinée au domaine `tools.elsatia.fr`, à iOS/iPadOS et à Android. Les seize outils essentiels restent intégralement utilisables gratuitement, hors connexion et sans compte. Dix outils Tools Pro ajoutent la conception géométrique, les plans cotés, les projets locaux et les exports chantier reproductibles.

## Développement local

```bash
npm install --prefix apps/tools
npm run dev --prefix apps/tools
```

L’application écoute sur `http://localhost:3020`. Aucun changement d’infrastructure ou de production n’est inclus dans ce lot.

## Développement natif

La fondation native utilise Capacitor 8.5 avec l’identifiant commun `fr.elsatia.tools`. Le build natif est un export statique Next.js embarqué localement : les apps ne chargent pas le domaine Web pour afficher les outils.

```bash
npm run native:sync --prefix apps/tools
npm run native:android --prefix apps/tools
npm run native:ios --prefix apps/tools
```

Voir [docs/native.md](docs/native.md) pour l’architecture, les prérequis, l’offline, le stockage, les environnements, le versioning, les futurs achats et les deep links. Les actions personnelles nécessaires aux Stores sont isolées dans [docs/store-manual-checklist.md](docs/store-manual-checklist.md).

## Architecture

- `src/lib/catalog.ts` : source canonique des outils, routes, SEO, accès, moteur, SVG et mode chantier ;
- `src/lib/categories.ts` : taxonomie extensible ;
- `src/lib/access.ts` : niveaux Free/Pro, capabilities et résolution des entitlements ;
- `src/lib/tool-engine.ts` : saisies, exécution, résultats et instructions chantier structurées ;
- `src/lib/calculations.ts` : primitives mathématiques pures et partagées (pente, espacement, quantitatifs, vitrage, thermique) ;
- `src/lib/units.ts` : conversions centralisées ;
- `src/lib/geometry/primitives.ts` : primitives et intersections géométriques en millimètres ;
- `src/lib/geometry/shape-model.ts` : modèle métier exportable des formes, cotes, contrôles et étapes ;
- `src/lib/geometry/shapes.ts` : arches, niche, cercle en pièce, ellipse, couronne et moteur radial ;
- `src/lib/geometry/plan-model.ts` : transformation exclusive millimètres vers espace SVG ;
- `src/lib/geometry/models.ts` : modèles géométriques historiques des outils Free ;
- `src/lib/geometry/diagram-model.ts` : projection des modèles vers primitives et annotations de plans ;
- `src/lib/geometry/engine/` : moteur géométrique paramétrique générique (polygones, étoiles, arches, rosaces, spirales, offsets, snap…) pour le futur Atelier de traçage — additif, voir [docs/geometry-engine.md](docs/geometry-engine.md) ;
- `src/components/ToolDiagram.tsx` : renderer SVG des outils Free sans formule métier ;
- `src/components/AdvancedPlan.tsx` : renderer Pro par couches, zoom et pan ;
- `src/lib/promotions.ts` : promotions croisées ELSATIA centralisées ;
- `src/lib/storage.ts` : clés locales canoniques et migration depuis l’ancien namespace ;
- `src/lib/platform.ts` : détection Web/iOS/Android et validation des deep links ;
- `src/lib/projects/` : modèle versionné, migrations, dépôt IndexedDB et services CRUD des projets locaux ;
- `src/lib/exports/` : reconstruction canonique et sorties SVG, PDF A4, impression et partage ;
- `src/components/NativeRuntimeBridge.tsx` : retour Android et routage natif ;
- `capacitor.config.ts` : configuration partagée des wrappers locaux ;
- `android/` et `ios/` : projets natifs sans duplication du moteur métier ;
- `public/sw-tools.js` : cache PWA indépendant de Gestion Pro et Colors.

La chaîne d’un tracé technique est obligatoirement :

```text
GEOMETRY MODEL → DIMENSIONED PLAN + ANNOTATIONS → SVG RENDERER
```

Une cote technique ne doit jamais être inventée dans un composant graphique.

## Free / Pro

Les composants ne contiennent pas de conditions commerciales dispersées. `access.ts` résout un `AccessContext` central à partir de grants abstraits pouvant venir du Web, d’Apple, de Google, de l’écosystème ELSATIA ou d’un droit interne.

Chaque outil déclare `access` et ses `capabilities` dans le catalogue. Tous les outils R3 sont `free`. Sans droit Pro, les pages avancées montrent un aperçu descriptif qui ne calcule ni fausse cote ni fausse forme. R8 résout les droits côté serveur via `tools_resoudre_entitlements` ; aucun e-mail ni drapeau d’environnement ne peut auto-attribuer Pro.

Le compte facultatif utilise `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Les refresh tokens sont stockés dans Keychain sur iOS, Android Keystore sur Android, et chiffrés AES-GCM avec une clé Web Crypto non exportable sur le Web. Le cache de droits est lié à l’utilisateur, protégé contre l’altération et valable au maximum sept jours hors ligne.

Les conventions complètes du moteur de traçage figurent dans [docs/tracing-engine.md](docs/tracing-engine.md). Le stockage et les documents chantier sont détaillés dans [docs/projects-exports.md](docs/projects-exports.md).

## Promotions ELSATIA

Les promotions déclarent application, contenu, URL, placement, contexte, état et priorité dans `promotions.ts`. Elles sont discrètes, rendues après l’outil et pourront être filtrées pour un futur utilisateur Pro.

## PWA et migration du stockage

La PWA s’appelle **ELSATIA Tools**, utilise le short name **Tools**, le service worker `/sw-tools.js` et le cache `elsatia-tools-v6`. Le service worker reste réservé au Web ; iOS et Android utilisent les ressources statiques incluses dans le paquet.

Au premier lancement, `storage.ts` migre sans perte :

- `elsatia-calculs-favorites` → `elsatia.tools.favorites` ;
- `elsatia-calculs-recent` → `elsatia.tools.recent`.

Une valeur déjà présente dans le nouveau namespace n’est jamais écrasée. Les anciennes clés sont ensuite supprimées et la migration devient idempotente.

Sur iOS et Android, les favoris et récents sont conservés avec Capacitor Preferences derrière la même abstraction et les mêmes namespaces `elsatia.tools.*`. Les projets structurés restent dans IndexedDB et sont synchronisés en arrière-plan pour un compte Pro vérifié. La file offline, les révisions optimistes, les tombstones et la duplication des conflits empêchent la perte silencieuse. Un fichier `.elsatiatools` importé reste strictement local jusqu’à l’action explicite « Autoriser la synchronisation ».

L’architecture et la matrice de validation R8 sont détaillées dans [docs/r8-architecture-validation.md](docs/r8-architecture-validation.md).

## Ajouter un outil

1. Ajouter l’id typé et une entrée complète dans `catalog.ts`.
2. Associer une catégorie canonique et un moteur.
3. Déclarer ses champs et son exécution dans `tool-engine.ts` (Free) ou `pro-engine.ts` (Pro).
4. Ajouter la forme au modèle géométrique pur, puis ses dimensions, contrôles et étapes.
5. Faire consommer uniquement le modèle plan au renderer SVG.
6. Ajouter les tests mathématiques, catalogue, instructions et géométrie.

L’accueil, la recherche, les routes statiques, les catégories, le SEO, les favoris et les contrôles d’accès sont alimentés par le catalogue.

## Variables publiques et garde de build

Next fige les `NEXT_PUBLIC_*` dans le bundle au moment du build. Un build lancé sans elles **réussit** : il livre simplement un Tools sans compte ni abonnement, avec une CSP repliée sur `connect-src 'self'`. Cohérent, donc silencieux — et invisible avant la mise en ligne.

`scripts/verify-public-env.mjs` ferme ce trou. Elle s'exécute avant `next build` (`prebuild`, `prebuild:native`), n'affiche jamais de valeur, et n'énonce que des noms de variables.

| Variable | Statut | Lue par |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | requise | `src/lib/auth/client.ts`, `connect-src` de `next.config.ts` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | requise | `src/lib/auth/client.ts` |
| `NEXT_PUBLIC_TOOLS_BILLING_API_URL` | requise | `src/lib/monetization-client.ts`, `connect-src` de `next.config.ts` |
| `NEXT_PUBLIC_TOOLS_URL` | recommandée | `src/lib/site.ts` — repli `https://tools.elsatia.fr` |

Tools lit `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, la convention unique de l'écosystème, déjà celle de Gestion Pro (`src/lib/supabase/keys.ts`) et du seul inventaire d'env versionné (`.env.example`). `NEXT_PUBLIC_SUPABASE_ANON_KEY` n'est **pas** acceptée en repli : les clés JWT legacy (`anon`, `service_role`) sont désactivées au niveau du projet Supabase depuis SECURITY-CREDENTIALS-V1B/V1C, donc une valeur portée par l'ancien nom n'authentifierait plus rien. Un repli convertirait cette panne d'authentification en build vert — c'est précisément ce que la garde doit empêcher.

Le mode de build vient de `NEXT_PUBLIC_TOOLS_ENV`, avec la règle de `getAppEnvironment()` : **absente ou inconnue vaut `production`**. Un build qui ne se déclare pas est donc traité comme un build publié.

| `NEXT_PUBLIC_TOOLS_ENV` | Effet |
|---|---|
| `production`, `native-production`, absente | une variable requise manquante, vide, non-URL ou en `http` **interrompt le build** |
| `preview` | signalé, non bloquant |
| `local`, `native-dev` | silencieux ; `http://localhost` accepté |

Une valeur publique ayant la forme d'une clé de service Supabase (`sb_secret_…`, ou JWT `role: service_role`) bloque le build dans **tous** les modes : c'est une fuite, pas un oubli.

Un build local ou de recette se déclare donc explicitement :

```bash
NEXT_PUBLIC_TOOLS_ENV=local npm run build --prefix apps/tools
```

C'est ce que fait la CI dans `.github/workflows/ci.yml`.

## Validation

```bash
npm run test --prefix apps/tools
npm run typecheck --prefix apps/tools
npm run lint --prefix apps/tools
NEXT_PUBLIC_TOOLS_ENV=local npm run build --prefix apps/tools
NEXT_PUBLIC_TOOLS_ENV=local npm run build:native --prefix apps/tools
```

Le contrôle des variables publiques peut être joué seul, sans build :

```bash
npm run verify:public-env --prefix apps/tools
```
