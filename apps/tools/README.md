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

Chaque outil déclare `access` et ses `capabilities` dans le catalogue. Tous les outils R3 sont `free`. Sans droit Pro, les pages avancées montrent un aperçu descriptif qui ne calcule ni fausse cote ni fausse forme. Pour la validation locale uniquement, `NEXT_PUBLIC_TOOLS_INTERNAL_PRO=1` accorde un entitlement de source `internal` au build ou au serveur de développement.

Les conventions complètes du moteur de traçage figurent dans [docs/tracing-engine.md](docs/tracing-engine.md). Le stockage et les documents chantier sont détaillés dans [docs/projects-exports.md](docs/projects-exports.md).

## Promotions ELSATIA

Les promotions déclarent application, contenu, URL, placement, contexte, état et priorité dans `promotions.ts`. Elles sont discrètes, rendues après l’outil et pourront être filtrées pour un futur utilisateur Pro.

## PWA et migration du stockage

La PWA s’appelle **ELSATIA Tools**, utilise le short name **Tools**, le service worker `/sw-tools.js` et le cache `elsatia-tools-v6`. Le service worker reste réservé au Web ; iOS et Android utilisent les ressources statiques incluses dans le paquet.

Au premier lancement, `storage.ts` migre sans perte :

- `elsatia-calculs-favorites` → `elsatia.tools.favorites` ;
- `elsatia-calculs-recent` → `elsatia.tools.recent`.

Une valeur déjà présente dans le nouveau namespace n’est jamais écrasée. Les anciennes clés sont ensuite supprimées et la migration devient idempotente.

Sur iOS et Android, les favoris et récents sont conservés avec Capacitor Preferences derrière la même abstraction et les mêmes namespaces `elsatia.tools.*`. Les projets structurés utilisent IndexedDB dans la WebView, sans synchronisation distante ; l’utilisateur peut les transférer explicitement au format `.elsatiatools`.

## Ajouter un outil

1. Ajouter l’id typé et une entrée complète dans `catalog.ts`.
2. Associer une catégorie canonique et un moteur.
3. Déclarer ses champs et son exécution dans `tool-engine.ts` (Free) ou `pro-engine.ts` (Pro).
4. Ajouter la forme au modèle géométrique pur, puis ses dimensions, contrôles et étapes.
5. Faire consommer uniquement le modèle plan au renderer SVG.
6. Ajouter les tests mathématiques, catalogue, instructions et géométrie.

L’accueil, la recherche, les routes statiques, les catégories, le SEO, les favoris et les contrôles d’accès sont alimentés par le catalogue.

## Validation

```bash
npm run test --prefix apps/tools
npm run typecheck --prefix apps/tools
npm run lint --prefix apps/tools
npm run build --prefix apps/tools
npm run build:native --prefix apps/tools
```
