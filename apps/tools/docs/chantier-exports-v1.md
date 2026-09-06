# Exports chantier — V1

Chaîne « tracé validé → dossier chantier → gabarit imprimable → fichiers vectoriels ».
Ce document décrit ce qui est **réellement implémenté**, et surtout ce qui ne l'est pas.

## Architecture

```
ChantierExportDocument            contrat d'entrée unique (exports/chantier-document.ts)
        │
        ├─ exports/chantier-export-bus.ts     point d'entrée unique : exportChantier()
        │       ├─ chantier-pdf.ts            dossier multipage + gabarit mosaïque/1:1
        │       │      └─ pdf-flow.ts         moteur de pagination
        │       ├─ svg.ts                     plan ajusté + gabarit 1:1 en mm réels
        │       ├─ dxf.ts                     DXF ASCII R12
        │       └─ png.ts                     aperçu raster (navigateur uniquement)
        │
        └─ chantier/                          calculs purs, sans dépendance au rendu
               mosaic · margins · witness · report-table · nomenclature
               led · profiles · lighting · pre-export-check
               print-scale · print-safety
```

Le contrat `ChantierExportDocument` est la seule frontière entre production de données et
export : ni IndexedDB, ni Supabase, ni `TracingProject` ne sont visibles depuis les modules
d'export.

## API

```ts
exportChantier(document, format, options): Promise<ChantierExportResult>
chantierExportCapabilities(document): ChantierExportCapability[]
runPreExportChecks(input): PreExportReport
```

Formats : `pdf` · `svg` · `svg-1to1` · `dxf` · `png` · `pdf-mosaic` · `print-1to1`.

`chantierExportCapabilities` indique quels formats sont réellement exploitables pour le
document courant — à utiliser pour griser un bouton plutôt que de le laisser échouer.

`ChantierExportResult.approximations` liste les approximations introduites par le format.
**L'appelant doit l'afficher quand elle n'est pas vide** (`ExportActions.tsx` le fait).

## PDF — dossier chantier

Pages produites, dans l'ordre, **aucune page vide n'est jamais générée** :

| Page | Condition |
|---|---|
| Couverture | toujours |
| Plan | `geometry` présente |
| Table de report | `report.rows` non vide |
| Étapes de construction | `constructionSteps` non vide |
| Quantités (nomenclature / LED / profils / éclairage) | au moins une de ces données |

### Pagination

Tout le contenu textuel passe par `PdfFlow` (`exports/pdf-flow.ts`) : chaque écriture réserve
sa hauteur via `ensure()`, qui ouvre une page dès que le contenu ne tient plus. Les tableaux
longs réimpriment leur en-tête après chaque rupture (« Table de report (suite) »).

Une section courte occupe toujours exactement une page ; une section longue s'étale sur
autant de pages que nécessaire. **Aucun contenu n'est tronqué.**

En-tête et pied de page sont apposés en seconde passe (`stampPages`), une fois le nombre
total de pages connu : la mention « Page X / Y » est donc exacte.

> Régression corrigée par ce lot : la table de report s'interrompait par un `break` au bas de
> la première page, faisant disparaître les points suivants sans aucun avertissement.

## Échelles — règle non négociable

`chantier/print-scale.ts` traduit le facteur de projection réel en libellé.

- **« 1:1 » n'est produit que si le facteur vaut exactement 1.**
- Un rapport voisin de 1 mais différent de 1 est affiché avec assez de décimales pour ne
  jamais s'arrondir en « 1:1 » (facteur 0,999 → « 1:1,001 »).
- Une échelle ajustée à la page est annoncée comme telle, jamais arrondie vers une échelle
  normalisée voisine.
- Toute échelle autre que 1:1 porte la mention « ne pas mesurer directement sur le papier ».

| Document | Échelle |
|---|---|
| Page « Plan » du dossier | ajustée à la page, annoncée explicitement |
| `pdf-mosaic` / `print-1to1` | 1:1 réel, aucune mise à l'échelle |
| `svg` | ajusté, `data-elsatia-full-scale="false"` |
| `svg-1to1` | 1:1, `width`/`height` en mm physiques |
| `png` | aperçu, jamais dimensionnel |

## Gabarit 1:1 et mosaïque

`chantier/mosaic.ts` découpe une emprise réelle en feuilles imprimables. Un motif tenant sur
une feuille produit une page unique, sans plan d'assemblage.

Chaque feuille porte : identifiant (`A1`, `B3`…), « Feuille n / N », repères de coin, zone de
recouvrement en tireté, feuilles voisines, cote témoin, mention « échelle 1:1 » et la consigne
d'impression.

Le plan d'assemblage (page 1 dès 2 feuilles) donne les dimensions globales réelles, la grille,
le nombre de feuilles, le recouvrement et un repère « HAUT DU MOTIF ».

Formats : A4, A3, A2, A1, A0, portrait ou paysage. Marge par défaut 10 mm, recouvrement par
défaut 10 mm, tous deux configurables.

### Cote témoin

Une ligne de longueur connue (100 mm par défaut) est tracée **dans la zone imprimable** de
chaque feuille — hors zone imprimable, une imprimante la rognerait et elle ne prouverait plus
rien. Elle s'accompagne systématiquement de :

> Imprimer à 100 %, taille réelle, sans « ajuster à la page ».

Un PDF ne peut pas contraindre le pilote d'impression. La cote témoin est la **seule**
vérification réelle : elle doit être mesurée après impression avant tout usage comme gabarit.

## Garde-fous

`chantier/print-safety.ts` :

- au-delà de **40 feuilles** : avertissement (`level: "warning"`) ;
- au-delà de **400 feuilles** : génération refusée (`level: "blocked"`), et le format n'est
  plus annoncé comme disponible par `chantierExportCapabilities`.

`runPreExportChecks` bloque l'export dimensionnel dès qu'une **erreur** subsiste : échelle non
définie, image de référence non calibrée, tracé vide, forme invalide, coordonnées non finies.
Les avertissements (mesure non fiable, motif hors pièce) n'empêchent pas l'export mais
doivent être affichés.

## Approximations connues

| Cas | Traitement |
|---|---|
| Ellipse → DXF R12 | convertie en polyligne 72 segments, **signalée** dans `approximations` |
| Arcs (PDF, SVG 1:1) | échantillonnés (pas de π/36), tracé identique entre PDF et SVG |
| Surfaces d'ellipse, longueurs développées | qualité `estimate`, marquées « (estimation) » |
| PNG | aperçu raster, jamais un gabarit dimensionnel |

## Limites connues

- **PNG indisponible côté serveur** : le rendu passe par un canvas navigateur. Sous Node,
  `exportChantier(…, "png")` échoue explicitement plutôt que de retourner un fichier vide.
  Il n'est donc pas couvert par les tests automatisés.
- **Pas d'archive ZIP** : l'export « dossier complet » produirait plusieurs fichiers séparés.
  Aucune dépendance d'archivage n'a été ajoutée (différé).
- La page « Plan » du dossier limite l'affichage à 12 cotations pour rester lisible.
- Le dossier PDF est fixé au format A4 ; seuls les gabarits exploitent les autres formats.
- L'étude électrique n'est pas couverte : la section Éclairage se limite à un relevé de
  positions (X / Y), sans dimensionnement.
