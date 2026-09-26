# Atelier — modèles Engine B dans le viewport (V1)

Ce document décrit le raccord entre le modèle résolu par Engine B et le viewport interactif
de l'Atelier. Il complète `atelier-model-resolution.md` (résolution) et ne le remplace pas.

## Chaîne réelle

```
TracingProject (modelId + modelParams)
  → resolveTracingProjectModel()          lib/tracing/model-resolver.ts
  → TraceModel (= ShapeGeometry + méta)   Engine B, source de vérité unique
  → PlanScene                             components/atelier/viewport/resolved-scene.ts
  → AtelierViewportWorkspace              rendu SVG, pan / zoom / pinch / grille / sélection
```

Aucun adaptateur de géométrie n'existe dans cette chaîne, et c'est délibéré :
`TraceModel extends ShapeGeometry`, et `PlanScene` est un sur-ensemble structurel de
`ShapeGeometry`. `resolvedPlanScene()` renvoie donc **la même référence** que
`resolution.model` — aucune recopie de point, de segment, d'arc, d'ellipse, de polyligne ni
de contour. Un test le vérifie explicitement (`toBe`, pas `toEqual`).

## Qui appelle le moteur

Le viewport ne l'appelle **jamais**. La résolution est faite une fois par l'écran parent
(`NouveauTraceWorkspace`, `AtelierExportWorkspace`), dans un `useMemo`, et le résultat est
partagé entre la carte d'état du modèle, le viewport et l'export. Le viewport reçoit une
`TracingModelResolution` déjà calculée.

## Cadrage (§4/§5)

`usePlanViewport` mémorise la vue manuelle sous une clé. Par défaut cette clé vaut les bornes
de la scène — correct pour une scène figée, faux pour un modèle paramétrique, où chaque
frappe déplace les bornes et remettrait la vue à plat.

Les écrans de l'Atelier passent donc un `viewKey` construit par
`atelierViewKey(projectId, slug)`. Conséquences :

| Événement                        | Effet sur la vue          |
| -------------------------------- | ------------------------- |
| changement de paramètre          | zoom et pan **conservés** |
| changement de `modelId`          | recadrage automatique     |
| changement de projet             | recadrage automatique     |
| bouton « Recentrer »             | recadrage automatique     |
| redimensionnement / rotation     | recadrage si vue non tenue |

Le pourcentage affiché est relatif au cadrage (100 % = vue recentrée) : après un changement
de paramètre il peut bouger de quelques points sans que la vue ait été touchée, parce que
c'est la référence — le fit du nouveau modèle — qui a changé.

## Unités

Les unités monde sont les **millimètres**, comme Engine B. Aucun facteur px/mm implicite :
`view.scale` EST le nombre de pixels par millimètre, et l'espacement de la grille vaut
`stepMm × scale`. Vérifié en recette sur un modèle réel : deux points déclarés à 200 mm et
1500 mm du repère mesurent exactement 200 mm et 1500 mm à l'écran.

## États non résolus

`none`, `unknown-model`, `invalid-params`, `failed` ne produisent pas de scène.
`ResolvedModelViewport` affiche alors l'état UX déjà porté par
`buildModelResolutionViewModel` — jamais un écran blanc, jamais une exception, jamais un
paramètre borné en silence.

## Mode chantier (§8)

`planSceneForStep()` lit `SiteStep.visibleEntityIds`, le mécanisme d'étapes déjà publié par
`ShapeGeometry`. Aucun nouveau système d'étapes n'est introduit. Une étape sans
`visibleEntityIds` ne restreint rien et la scène est renvoyée **par référence**, donc sans
rendu inutile. Le filtrage ne recalcule jamais les bornes : le plan ne doit pas sauter d'une
étape à l'autre sur le chantier.

## Persistence

Le viewport ne persiste rien. Le projet ne porte que `modelId`, `modelParams` et ses
métadonnées Atelier. Ni la géométrie, ni le `TraceModel`, ni le rapport calculé, ni les
bornes, ni le pan/zoom ne sont enregistrés. Le pan/zoom reste volontairement hors persistence
dans ce lot.

## Export

Le viewport n'est jamais source de vérité pour l'export. L'export continue de partir de
`TracingProject → resolveTracingProjectModel → resolvedAtelierGeometry → document`. Le
viewport lit la même résolution, il ne la produit pas.
