# ELSATIA Tools

Application chantier autonome et freemium destinée au futur domaine `tools.elsatia.fr`. Les seize outils du catalogue R3 restent intégralement utilisables gratuitement, hors connexion et sans compte.

## Développement local

```bash
npm install --prefix apps/tools
npm run dev --prefix apps/tools
```

L’application écoute sur `http://localhost:3020`. Aucun changement d’infrastructure ou de production n’est inclus dans ce lot.

## Architecture

- `src/lib/catalog.ts` : source canonique des outils, routes, SEO, accès, moteur, SVG et mode chantier ;
- `src/lib/categories.ts` : taxonomie extensible ;
- `src/lib/access.ts` : niveaux Free/Pro, capabilities et résolution des entitlements ;
- `src/lib/tool-engine.ts` : saisies, exécution, résultats et instructions chantier structurées ;
- `src/lib/calculations.ts` : primitives mathématiques pures et partagées (pente, espacement, quantitatifs, vitrage, thermique) ;
- `src/lib/units.ts` : conversions centralisées ;
- `src/lib/geometry/models.ts` : modèles géométriques exacts ;
- `src/lib/geometry/diagram-model.ts` : projection des modèles vers primitives et annotations de plans ;
- `src/components/ToolDiagram.tsx` : renderer SVG sans formule métier ;
- `src/lib/promotions.ts` : promotions croisées ELSATIA centralisées ;
- `src/lib/storage.ts` : clés locales canoniques et migration depuis l’ancien namespace ;
- `public/sw-tools.js` : cache PWA indépendant de Gestion Pro et Colors.

La chaîne d’un tracé technique est obligatoirement :

```text
GEOMETRY MODEL → DIAGRAM MODEL + ANNOTATIONS → SVG RENDERER
```

Une cote technique ne doit jamais être inventée dans un composant graphique.

## Free / Pro

Les composants ne contiennent pas de conditions commerciales dispersées. `access.ts` résout un `AccessContext` central à partir de droits pouvant venir d’un achat direct, d’un abonnement Tools, d’un abonnement ELSATIA éligible ou d’un droit interne.

Chaque outil déclare `access` et ses `capabilities` dans le catalogue. Tous les outils R3 sont `free`. Les aperçus Pro sont informatifs et ne bloquent aucun calcul existant.

## Promotions ELSATIA

Les promotions déclarent application, contenu, URL, placement, contexte, état et priorité dans `promotions.ts`. Elles sont discrètes, rendues après l’outil et pourront être filtrées pour un futur utilisateur Pro.

## PWA et migration du stockage

La PWA s’appelle **ELSATIA Tools**, utilise le short name **Tools**, le service worker `/sw-tools.js` et le cache `elsatia-tools-v3`.

Au premier lancement, `storage.ts` migre sans perte :

- `elsatia-calculs-favorites` → `elsatia.tools.favorites` ;
- `elsatia-calculs-recent` → `elsatia.tools.recent`.

Une valeur déjà présente dans le nouveau namespace n’est jamais écrasée. Les anciennes clés sont ensuite supprimées et la migration devient idempotente.

## Ajouter un outil

1. Ajouter l’id typé et une entrée complète dans `catalog.ts`.
2. Associer une catégorie canonique et un moteur.
3. Déclarer ses champs et son exécution dans `tool-engine.ts`.
4. Ajouter le modèle géométrique puis le diagram model si un plan est nécessaire.
5. Faire consommer uniquement le diagram model au renderer SVG.
6. Ajouter les tests mathématiques, catalogue, instructions et géométrie.

L’accueil, la recherche, les routes statiques, les catégories, le SEO, les favoris et les contrôles d’accès sont alimentés par le catalogue.

## Validation

```bash
npm run test --prefix apps/tools
npm run typecheck --prefix apps/tools
npm run lint --prefix apps/tools
npm run build --prefix apps/tools
```
