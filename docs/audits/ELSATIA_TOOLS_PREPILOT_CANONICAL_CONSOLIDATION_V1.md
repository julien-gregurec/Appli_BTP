# ELSATIA — Consolidation canonique Tools pré-pilote (V1)

Branche : `integration/tools-prepilot-canonical-v1`
Base commune de tous les lots : `1a84528` (« render resolved engine models in atelier viewport »)
Date : 2026-09-06

## 1. Topologie réelle des lots

Toutes les branches visées descendent de `1a84528`. Deux lignées parallèles, plus un correctif isolé :

```
1a84528  (base commune — Atelier + moteur B)
│
├── lignée ATELIER
│   └── 4de397f  hit-test + snap
│       └── 528773c  intersections/multiselect R2
│           └── 1a7ddce  free drawing R2 reconciliation   ← lot cité
│               └── 04dd1bd  free contour + surfaces       ← RETENU (descendant)
│
├── lignée PWA / CONSEILS / SECURITY
│   └── 26ef69a  conseils content expansion (30 fiches)
│       └── 4b60cf2  PWA asset precache + update offline-safe
│           ├── 76ac8ea  PWA update UX + résilience réseau  ← RETENU
│           └── 9bd2615  security headers publics           ← RETENU
│
└── 6d3fcfd  (GP public pricing — HORS PÉRIMÈTRE)
    └── d1788a8  footer légal Tools                         ← CHERRY-PICK seul
```

Conséquences vérifiées (`git merge-base --is-ancestor`) :

- `1a7ddce` est **ancêtre** de `04dd1bd` : intégrer `04dd1bd` suffit, `1a7ddce` est couvert.
- `26ef69a` est **ancêtre** de `4b60cf2`, lui-même ancêtre de `76ac8ea` **et** de `9bd2615` :
  conseils et precache sont couverts par les deux têtes PWA.
- `76ac8ea` et `9bd2615` sont **frères** (base `4b60cf2`), aux deltas propres **disjoints** :
  `sw-tools.source.js` + `lib/pwa/*` d'un côté, `next.config.ts` + `lib/security-headers.*` de l'autre.
- Le parent de `d1788a8` est `6d3fcfd` (tarification publique GP). Un merge de cette branche
  aurait tiré `src/lib/tarification.ts`, `src/app/tarifs/`, `src/app/(app)/abonnement/` — interdits
  par le périmètre. Le footer est donc **cherry-pické seul** (4 fichiers, tous sous `apps/tools/`).

## 2. Stratégie retenue

Base `04dd1bd`, puis deux merges `--no-ff` et un cherry-pick :

| Étape | Opération | Conflits |
|---|---|---|
| base | `04dd1bd` (Atelier + free drawing R2 + contour/surfaces) | — |
| 1 | `merge 76ac8ea` (PWA precache + update UX + conseils) | 0 |
| 2 | `merge 9bd2615` (security headers) | 0 |
| 3 | `cherry-pick d1788a8` (footer légal seul) | 0 |

Zéro conflit : les deux lignées n'ont **aucun fichier en commun** (`comm -12` sur les deux jeux de
chemins modifiés depuis `1a84528` : ensemble vide). Le cherry-pick a auto-fusionné `globals.css`.

Périmètre du canon vs `1a84528` : `apps/tools/**` uniquement, plus deux documents d'audit PWA.
**Aucun** fichier `src/`, `apps/colors/`, `supabase/` — GP, Colors, site et Production intouchés.

## 3. Lots obsolètes — non intégrés

Branches descendant de `1a84528` mais couvertes par aucune tête retenue :

| Branche | Statut |
|---|---|
| `feat/tools-atelier-free-drawing-foundation-v1` (`2c8e1a7`) | **variante rivale** du tracé libre, remplacée par la réconciliation R2 (`1a7ddce`) |
| `feat/tools-atelier-intersections-multiselect-v1` (`b0c55e8`) | **variante rivale**, remplacée par la R2 `528773c`, elle-même ancêtre du canon |

Vérifié par ailleurs : `feat/tools-atelier-report-quantities-v1` (`e23f5e9`) et
`feat/tools-chantier-exports-p0-v1` (`2d00422`) ne sont pas ancêtres, **mais leur contenu est déjà
dans le canon** par une autre voie (`components/atelier/report/`, `components/atelier/quantities/`,
`lib/chantier/`, `lib/geometry/engine/report.ts`, `lib/exports/chantier-*` tous présents). Aucun
manque. `feat/tools-conseils-techniques-foundation-v1` (`b35243d`) est de même remplacé : la
fondation Conseils est déjà à `1a84528` (18 fichiers) et `26ef69a` la porte à 30 fiches.

## 4. Contenu du canon

**Atelier** — moteur B, viewport, hit-test, snap, intersections, multisélection, édition
paramétrique, undo/redo, tracé libre, contour, surfaces, report/nomenclature/quantités, exports
(SVG, PDF, DXF, PNG, impression, partage, dossier chantier).

**PWA** — service worker généré au build (21 assets critiques, 88 optionnels, ~3,0 Mo),
precache vérifié à l'`install`, purge conditionnée à l'`activate`, activation pilotée par
l'utilisateur (`SKIP_WAITING`), bannière de mise à jour, indicateur hors ligne, error boundaries
(`error.tsx` / `global-error.tsx`), icônes générées, build natif Capacitor.

**Security** — CSP stricte (`default-src 'self'`, `object-src`/`base-uri`/`frame-ancestors`/
`frame-src` à `'none'`, `worker-src 'self'`), `X-Frame-Options: DENY`, `nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (17 capacités refusées),
COOP `same-origin-allow-popups`, CORP `same-site`. Non installée sur le build natif
(`output: "export"` interdit les en-têtes).

**Conseils** — 30 fiches, catégories, recherche, synonymes, filtres, disponibles hors ligne.

**Footer** — Mentions légales, Confidentialité, CGU, Contact, ELSATIA.

## 5. Correctifs ajoutés dans ce lot

### 5.1 Impression (bug connu — corrigé)

`exports/print.ts` appelait `window.open("", "_blank", "noopener,noreferrer")`. Par spécification,
`noopener` fait **toujours** retourner `null` : l'utilisateur recevait systématiquement
« Autorisez l'ouverture de la vue d'impression. » alors que la fenêtre s'ouvrait. Second défaut :
l'écoute de `load` était posée **après** `document.close()`, qui déclenche cet événement — `print()`
n'était donc jamais appelé.

Correctif (1 ligne) : poignée conservée, `opener` coupé côté enfant, écoute posée avant `close()`.
Cohérent avec COOP `same-origin-allow-popups`, déjà choisi pour cette raison. Couvert par
`exports/print-window.test.ts` (4 cas) ; 3 de ces cas échouent sur le code d'avant — test non vide.

### 5.2 Débordement Atelier sur téléphone (relevé par la recette 375)

Sous 680 px, la piste `1fr` de `.atelier-list` / `.atelier-card` ne descend jamais sous le
min-content de la carte : celle-ci occupait 389 px dans un viewport de 375 px, et `/atelier`
défilait horizontalement de 26 px. `minmax(0, 1fr)` lève cette borne. Défaut préexistant à la
lignée Atelier, pas une régression de la consolidation.

## 6. Gaps

### P0
Aucun.

### P1

1. **SEO Tools — hors canon.** `apps/tools/src/lib/seo.ts`, `public/og-tools.png`,
   `scripts/build-og-image.mjs` sont du travail **non commité** (non suivis dans le worktree
   principal) ; aucune branche du dépôt ne contient `apps/tools/src/lib/seo.ts`. Rien n'a donc
   été intégré. Le canon conserve les métadonnées déjà présentes dans `layout.tsx`
   (`metadataBase`, `title`/`template`, `description`, `openGraph` sans image, `appleWebApp`)
   mais **pas** de canonical par page ni d'image OG. Lot suivant à part entière.
2. **`connect-src` dépend de l'environnement de build.** La CSP est figée au build depuis
   `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_TOOLS_BILLING_API_URL`. Sans ces variables au
   moment du `next build`, `connect-src` vaut `'self'` seul et le compte/abonnement serait bloqué
   en production. À vérifier dans le pipeline de déploiement Tools.
3. **Routes Conseils encore en `-preview`.** Les 30 fiches ne sont exposées que par
   `/conseils-preview` (page interne). L'ouverture publique reste à faire.
4. **Coût du snap sur scène très dense.** `snap()` passe de 0,08 ms (200 entités) à 1,21 ms
   (800 entités) — sous la frame de 16 ms, mais c'est le seul chemin dont le coût croît
   visiblement. À surveiller si les scènes pilotes dépassent le millier d'entités.
5. **Refonte visuelle ELSATIA-UI-V2** non démarrée (lot connu, hors périmètre ici).

## 7. Vérifications exécutées

| Contrôle | Résultat |
|---|---|
| Tests Tools | 151 fichiers / 1 682 tests — verts |
| Tests racine | 92 fichiers / 806 tests — verts |
| Typecheck Tools + racine | vert |
| Lint Tools | vert (0 erreur, 0 avertissement) |
| Lint racine | 0 erreur (3 avertissements préexistants, code GP) |
| `build` (web) | vert — 45 pages, SW 21+88 assets |
| `build:native` (export Capacitor) | vert — `out/` + `out/sw-tools.js` |
| Recette 375 / 430 / 768 / 1440 | débordement horizontal nul sur `/`, `/outils/[id]`, `/projets`, `/atelier`, `/atelier/nouveau`, `/atelier/export`, `/atelier-free-preview`, `/conseils-preview`, `/offline` — aucune erreur console |
| En-têtes servis | CSP, XFO, nosniff, Referrer, Permissions, COOP, CORP présents sur `/` **et** sur `/sw-tools.js` |
| SW sous CSP | enregistré, activé, `worker-src 'self'` respecté |
| Mise à jour PWA | worker en attente → bannière → clic → activation → purge des caches obsolètes (3 → 1) → bannière retirée |
| Hors ligne (serveur arrêté) | `/`, `/outils/diagonale-rectangle` (calcul 5 000 mm rendu), `/atelier` (4 projets), `/conseils-preview` (30 fiches + recherche) servis par le SW |
| Tracé libre / contour / surfaces | contour 4 sommets → aperçu « ≈ 1,98 m² » → fermeture → périmètre 5 800 mm, surface 1,98 m² |
| Undo / redo | `Ctrl+Z` → 0 entité, `Ctrl+Maj+Z` → 1 entité |
| Performance Atelier dense | scène 201 primitives : 0,058 ms par `pointermove` ; hit-test 0,012→0,019 ms de 200 à 800 entités ; `sceneIntersections` ≤ 1,5 ms |

## 8. Interdictions respectées

Aucun déploiement, aucune migration ni accès Supabase, aucune modification GP, Colors ou site
vitrine, aucune action sur Production.
