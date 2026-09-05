# Conseils & Techniques — fondation data-driven (V1)

Bibliothèque de méthodes professionnelles de chantier, embarquée dans le bundle Tools.
Ce lot pose **la fondation** : modèle de données, registre versionné, recherche locale,
filtres, favoris/récents, preview interne mobile et 3 fiches de démonstration originales.

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
  content/        fiches versionnées (3 fiches de démo)
  *.test.ts       registre, recherche, filtres, favoris, récents, validation
src/app/conseils-preview/page.tsx     route interne non cataloguée (noindex)
src/components/ConseilsPreviewWorkspace.tsx   UI mobile (liste, fiche, accordéons)
```

## Modèle de fiche

`ConseilFiche` (voir `types.ts`) : `id`, `slug`, `title`, `shortDescription`, `category`,
`subcategory?`, `trades[]`, `tags[]`, `difficulty`, `materials[]`, `preparation[]`,
`steps[]` (`{ title, text, hint? }`), `tips[]`, `commonErrors[]`, `finalCheck[]`,
`warnings[]`, `relatedToolIds[]`, `relatedTraceIds[]`, `media[]`
(`{ type: image|diagram|animation|video, src, alt, caption?, source? }`),
`version`, `status`, `createdAt`, `updatedAt`.

## Lien futur avec Tracés

`relatedTraceIds` reste un simple tableau de chaînes. Quand le moteur sera stable, la fiche
pourra afficher `[ VOIR LE SCHÉMA ] [ PAS À PAS ] [ MODE CHANTIER ]`. La preview réserve
déjà l'emplacement (bloc désactivé « Tracés interactifs »). **Ne pas importer TraceViewer
dans ce lot.**

## Ajouter une fiche

1. Créer `src/lib/conseils/content/<slug>.ts` exportant un `ConseilFiche`.
2. L'ajouter au tableau de `src/lib/conseils/content/index.ts`.
3. `npm test` — `validateConseilRegistry` refuse tout slug/id dupliqué ou champ manquant.

## Preview

Route `/conseils-preview` (dev : `npm --prefix apps/tools run dev` puis
`http://localhost:3020/conseils-preview`). Absente du sitemap et de la navigation,
`robots: noindex`.
