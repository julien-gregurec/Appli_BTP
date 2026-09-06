# Conseils & Techniques — bibliothèque data-driven

Bibliothèque de méthodes professionnelles de chantier, embarquée dans le bundle Tools.

- **V1 (fondation)** : modèle de données, registre versionné, recherche locale, filtres,
  favoris/récents, preview interne mobile, 3 fiches de démonstration.
- **V1.1 (extension de contenu)** : 30 fiches, 18 catégories, durée estimée et outillage sur
  chaque fiche, `relatedTraceIds` contraints aux 13 modèles réels, synonymes métier dans la
  recherche.

## Principes

- **Aucun CMS, aucune base de données, aucune migration.** Le contenu est versionné dans
  le code (`src/lib/conseils/content/`).
- **Hors ligne par défaut.** Tous les textes fonctionnent sans réseau. Les médias distants
  pourront plus tard être mis en cache à la demande.
- **Indépendant du moteur géométrique.** Ce module ne référence aucune API du moteur
  « Tracés & Géométrie ». Le lien futur passe par le seul contrat `relatedTraceIds: string[]`.
- **Propriété intellectuelle.** Contenus de démonstration ELSATIA originaux uniquement :
  aucune capture, aucun watermark, aucun texte ni vidéo tiers.

## Arborescence

```
src/lib/conseils/
  types.ts        modèle de données + énumérations (catégories, métiers, difficultés, médias)
  categories.ts   registre des catégories (extensible)
  text.ts         normalisation FR (casse + accents) pour la recherche
  search.ts       index et recherche locale (titre, description, tags, catégorie, métier)
  filters.ts      filtres catégorie / métier / difficulté
  validate.ts     validation d'une fiche + intégrité du registre (slug/id uniques)
  storage.ts      favoris & récents — primitives Tools, namespace `elsatia.tools.conseils.*`
  registry.ts     registre versionné : agrégation, tri, lookup, recherche+filtres combinés
  synonyms.ts     table statique de synonymes métier (placo/plaque, vitre/vitrage…)
  trace-models.ts vocabulaire des 13 modèles autorisés dans `relatedTraceIds`
  content/        fiches versionnées (30 fiches, un fichier par slug)
  *.test.ts       registre, recherche, filtres, favoris, récents, validation
src/app/conseils-preview/page.tsx     route interne non cataloguée (noindex)
src/components/ConseilsPreviewWorkspace.tsx   UI mobile (liste, fiche, accordéons)
```

## Modèle de fiche

`ConseilFiche` (voir `types.ts`) : `id`, `slug`, `title`, `shortDescription`, `category`,
`subcategory?`, `trades[]`, `tags[]`, `difficulty`, `estimatedMinutes`, `tools[]`,
`materials[]`, `preparation[]`, `steps[]` (`{ title, text, hint? }`), `tips[]`,
`commonErrors[]`, `finalCheck[]`, `warnings[]`, `relatedToolIds[]`, `relatedTraceIds[]`,
`media[]` (`{ type: image|diagram|animation|video, src, alt, caption?, source? }`),
`version`, `status`, `createdAt`, `updatedAt`.

Conventions appliquées à tout le contenu et vérifiées par les tests :

- `id` = `cf-` + `slug`, et le fichier du contenu porte le nom du slug ;
- `tools` non vide (outillage), `materials` peut l'être (fournitures consommées) ;
- `estimatedMinutes` entier ≥ 1, purement indicatif ;
- `commonErrors` et `finalCheck` non vides : une fiche sans contrôle final n'est pas utile.

### Catégories

18 catégories déclarées dans `categories.ts`. L'extension V1.1 en a ajouté quatre :
`fixation`, `etancheite`, `diagnostic`, `entretien`. Une catégorie sans fiche publiée
n'apparaît pas dans les filtres de la preview.

## Recherche

Recherche locale, sans réseau et sans IA. L'index couvre titre, description, tags, catégorie,
métiers, sous-catégorie **et l'outillage cité par la fiche**. Tous les jetons de la requête
doivent correspondre.

Le vocabulaire de chantier est irrégulier (« placo », « vitre », « huisserie ») : `synonyms.ts`
porte une table statique de classes d'équivalence. Une correspondance par synonyme compte
moins qu'une correspondance littérale, donc la fiche qui emploie le mot exact reste en tête.
Ajouter un synonyme = ajouter un terme dans un groupe existant, en écriture **déjà normalisée**
(minuscules, sans accent) — `synonyms.test.ts` le vérifie.

## Lien avec les Tracés

`relatedTraceIds` reste un tableau de chaînes, mais il n'accepte plus n'importe quoi : les
seules valeurs admises sont les **13 slugs réels** du registre géométrique. Le vocabulaire est
recopié dans `trace-models.ts` plutôt qu'importé, pour que le module Conseils n'embarque pas
le moteur géométrique ; `trace-models.test.ts` compare la liste au catalogue réel, une
divergence casse les tests. `validate.ts` refuse tout slug hors registre et tout doublon.

Quand le moteur sera relié, la fiche pourra afficher `[ VOIR LE SCHÉMA ] [ PAS À PAS ]
[ MODE CHANTIER ]`. La preview réserve déjà l'emplacement (bloc désactivé « Tracés
interactifs »). **Ne pas importer TraceViewer ici.**

## Ajouter une fiche

1. Créer `src/lib/conseils/content/<slug>.ts` exportant un `ConseilFiche` dont l'`id` est
   `cf-<slug>`.
2. L'importer et l'ajouter au tableau de `src/lib/conseils/content/index.ts` (l'ordre du
   tableau n'importe pas : le registre trie par titre en locale FR).
3. `npm test` — `validateConseilRegistry` refuse tout slug/id dupliqué, tout champ manquant,
   toute catégorie inconnue et tout `relatedTraceIds` hors registre.

## Preview

Route `/conseils-preview` (dev : `npm --prefix apps/tools run dev` puis
`http://localhost:3020/conseils-preview`). Absente du sitemap et de la navigation,
`robots: noindex`.
