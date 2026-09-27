# ELSATIA Tools — Relevé & Métré — Lot 5 — Plan 2D (Building Editor Foundation V1)

**Date** : 2026-09-27
**Branche** : `claude/vibrant-darwin-b4gc9n` (branche de session imposée, voir D1)
**Base** : Lot 4 qualifié `claude/zealous-pascal-wjxh2u` @ `004f051` (*RELEVE METRE LOT 4 LOCALLY QUALIFIED*), lui-même issu du Lot 3 et du Lot 2. Pas de V3 nu.
**Nature** : rapport autonome. Tout ce qui est affirmé a été exécuté dans cette session.
**Hors périmètre, volontairement** : éditeur complet des ouvertures (glisser sur le mur, bibliothèque de menuiseries), exports PDF / DXF réels, 3D, LiDAR, AR, hors ligne complet, synchronisation GP réelle, Preview, production, PR, merge.

---

## 0. Verdict

> **RELEVE METRE LOT 5 LOCALLY QUALIFIED**

Premier plan bâtiment 2D branché sur la hiérarchie réelle du Lot 3 et les photos du Lot 4 :
**Structure → étage (ou zone, ou fiche pièce) → « Plan »** → plan initial (murs antérieurs repris) → murs au clic / au toucher / à la longueur saisie, accrochage → pièces fermées détectées et associées aux pièces métier → ouvertures → cotes, dimensions principales, surfaces → édition (point, mur, longueur, angle, suppression, annuler / rétablir) → corrections (redresser, aligner, fusionner, scinder) → repères photo → sauvegarde automatique avec conflit détecté → gel (INITIAL) → plan CORRECTED / PROJECTED / AS_BUILT dérivé, plan figé intact.

« Locally qualified » : prouvé sur PostgreSQL 16 avec les 347 vraies migrations et la vraie RLS, un vrai GoTrue, un vrai PostgREST, un vrai Chromium, la surface Storage locale du Lot 4. **Tablette / mobile : MOBILE EMULATED ONLY** (Chromium en émulation tactile ; aucun appareil physique, aucun WebKit iOS réel). Performances mesurées en `next dev`. Ni Preview, ni production.

### Chiffres clés (exécutés sur HEAD)

| Contrôle | Résultat |
|---|---|
| Install fraîche | **347 / 347** migrations (`verify-migrations` : 347 valides, noms et horodatages uniques) |
| Upgrade Lot 4 (346) → Lot 5 (347) avec données Lot 2/3/4 | OK ; **données identiques** (empreintes MD5 des relevés, pièces, éléments hors nouvelle colonne) ; **schéma identique** à l'install fraîche (`pg_dump -s` : seuls les jetons aléatoires `\restrict` diffèrent) |
| pgTAP Relevé (8 fichiers) | **425 / 425** (Lots 2–4 : 358, **Lot 5 : 67**) |
| pgTAP suite complète | 141 fichiers, 3 620 tests ; **mêmes 9 fichiers en échec, mêmes compteurs** qu'au Lot 4 (limites connues du banc, §16.3) |
| Vitest `packages/releve-domain` | **221 / 221** (15 fichiers ; Lot 4 : 198) |
| Vitest racine (Gestion Pro + packages) | **2 075 / 2 075** (172 fichiers ; Lot 4 : 2 052) |
| Vitest `apps/tools` | **2 078 / 2 078** (182 fichiers ; Lot 4 : 2 031) |
| `tsc --noEmit` racine et `apps/tools` | 0 erreur |
| ESLint racine et `apps/tools` | 0 erreur (15 avertissements antérieurs, aucun dans un fichier Lot 5) |
| Build Tools web / natif (Capacitor) / Gestion Pro | OK — **`/releves/plan` statique**, `out/releves/plan` exporté |
| Playwright Lot 5 `tools-releve-lot5.spec.ts` | **17 / 17** (pile réelle : desktop, tablette, smartphone, sécurité, conflit, versions, performance) |
| Playwright non-régression Lots 2 + 3 + 4 | **29 / 29** |
| Playwright non-régression Atelier `tools-atelier-lot5-nonregression.spec.ts` | **6 / 6** (tracé libre, pan, molette, pincement, arches, rosaces) |

---

## 1. Base et branche

- `git fetch` de `claude/zealous-pascal-wjxh2u` (Lot 4 qualifié, `004f051`).
- **D1** : la session impose de pousser uniquement `claude/vibrant-darwin-b4gc9n`. Cette branche pointait sur un ancêtre du Lot 4 (sans commit propre) : elle a été avancée **en avance rapide** sur `004f051`. Aucune réécriture d'historique, aucune PR, aucun merge.

| Commit | Objet |
|---|---|
| `bb2597b` | migration 901 (additive) + pgTAP Lot 5 |
| `074356e` | domaine `plan` / `plan-memory` + extensions génériques d'Engine B |
| `bdaa734` | éditeur de plan (Tools) |
| `43506e0` | recette Playwright réelle + corrections issues de la recette |
| `191a3fc` | non-régression Atelier |
| *(ce rapport)* | rapport Lot 5 |

## 2. Réutilisation — cartographie du moteur géométrique Tools

**Aucun second moteur.** Deux moteurs existent déjà (`apps/tools/docs/GEOMETRY_ENGINES_BOUNDARY_V1.md`) ; le plan s'appuie sur **Engine B** (`lib/geometry/engine`, source de vérité générique) et sur les couches viewport de l'Atelier. Le seul fichier qui traduit le vocabulaire bâtiment (mur, épaisseur, pièce) en primitives génériques est `lib/releve/plan/geometry.ts` (adaptateur).

| Besoin | Brique réutilisée | Ajout Lot 5 |
|---|---|---|
| snap | `engine/snap.ts::findSnapCandidates` (extrémités, milieux, intersections, perpendiculaire) | `engine/guides.ts` (générique) : `constrainToAngleStep` (horizontal / vertical / angles usuels), `alignmentGuides` (axes X/Y d'extrémités) ; priorité métier dans `lib/releve/plan/snap.ts` |
| segments | `Segment2D`, `measure.ts` (distance, polarAngle, pointAtPolar, projectOntoLine), `intersections.ts` | — |
| polygons | `area.ts::polygonArea`, `offset.ts::offsetSegment`, `validate.ts::hasSelfIntersection` | `engine/planar-faces.ts` (générique) : faces fermées d'un réseau de segments, `pointInPolygon`, `polygonCentroid`, `interiorPoint` ; `offset.ts::offsetPolygonEdges` (décalage par arête) |
| selection | `lib/viewport/selection-set.ts` (simple, additive Maj+clic), `pointer-targeting.ts` (tolérances souris / doigt), `geometry/closest-point.ts` | — |
| zoom / pan | `PlanViewport` + `usePlanViewport` + `use-viewport-gestures` (molette, glisser, pincement deux doigts, clavier), `viewport-math.ts`, `GridOverlay` | durcissement du hook : un pointeur *primaire* ouvre toujours un nouveau geste (§14) |
| undo / redo | `lib/tracing/history.ts` + `use-undo-redo-shortcuts.ts` (Ctrl/Cmd+Z, Maj+Z, Ctrl+Y) | — |
| units | canonique **mm** (Engine B, domaine) ; `lib/units.ts` | `lib/releve/plan/render.ts` : cotes en m au cm (« 4,20 m »), saisie en cm (« 420,5 » = 4 205 mm), angles en degrés |
| precision | coordonnées arrondies à 0,1 mm, joints fusionnés à 0,5 mm, bornes ±1 km (Engine B, domaine) | tolérance d'accrochage en **pixels** convertie en mm à chaque zoom |

Tests Engine B ajoutés : `engine/planar-faces.test.ts` (16).

## 3. Migration `20260927000901_tools_releve_metre_plan_2d_v1.sql`

Plage 9xx réservée au Lot 5. **Strictement additive** : aucune migration appliquée modifiée, aucune ligne invalidée, **aucune garde existante affaiblie** (voir D4).

| Bloc | Contenu |
|---|---|
| Table `tools_releves_plans` | plan d'un **étage** dans un état `initial` / `corrige` / `projete` / `as_built` (valeurs des versions), `numero` par étage, `plan_base_id`, `cadre` (repère des ancres photo `plan`), `reglages`, `contours` (pièces), `revision`, `fige_le` / `fige_par` / `empreinte` / `version_id` ; FK composites relevé / étage / version ; RLS |
| Unicité | plan initial unique et premier par étage ; **un seul plan modifiable par (étage, état)** |
| `tools_releves_elements.plan_id` | murs et ouvertures appartiennent à un plan (CHECK : seulement `mur`, `ouverture`) ; FK composite, cascade |
| Gardes | élément sur l'étage de son plan ; ouverture dans le plan de son mur ; **plan figé** : aucune création / modification d'élément, aucune modification du plan (suppression douce seulement en cascade d'un parent, restauration libre) ; colonnes d'identité du plan immuables — y compris pour `service_role` |
| RPC (SECURITY DEFINER, contrôle explicite `tools_releve_peut(…, 'edit')`) | `tools_releve_plan_creer`, `tools_releve_plan_enregistrer` (lot atomique, révision attendue), `tools_releve_plan_figer` |
| Droits | `authenticated` : **SELECT seul** sur les plans (toute écriture par RPC) ; `anon` : rien |
| Cascade | étage supprimé / restauré → ses plans (figés compris) |
| Versions du relevé | `tools_releve_creer_version` redéfinie à l'identique + clé `plans` dans l'instantané |
| Journal | entité `plan` (création, modification, gel) : identifiants et compteurs, **jamais de coordonnées** |
| RGPD | `entreprise_id` présent → export et purge génériques existants (prouvés : pgTAP G1–G3) |

**Conflit** : révision attendue ≠ révision serveur → SQLSTATE **`PT409`** (HTTP 409 natif PostgREST), détail = révision courante, **rien n'est écrit**. *Pas* `40001` : la recette a montré que PostgREST (hasql-transaction) **rejoue indéfiniment** une transaction en échec de sérialisation — la requête ne revenait jamais et épuisait le pool (§15).

## 4. Domaine (`packages/releve-domain/src/plan.ts`, `plan-memory.ts`)

- Types `Plan`, `PlanDocument` (murs, ouvertures, contours, cadre, réglages), `PlanMur`, `PlanOuverture`, `PlanContour` ; correspondance avec les éléments Relevé (`murFromElement`, `murDonnees`…).
- Règles miroir du SQL : `planCreationRule`, `freezeCreatesVersion`, `isPlanEditable`, `referencePlan`, `defaultPlan`, validations (`validatePlanMur`, `validatePlanOuverture`, `validatePlanContour`, `validatePlanDocument`). **Parité testée** (`sql-parity.test.ts` : états, bornes, messages, cadre par défaut).
- **Enregistrement par différence** `diffPlan` : seuls les murs / ouvertures créés ou modifiés partent (clés canoniques), les disparus deviennent des suppressions douces (un « annuler » les ré-envoie et le serveur les restaure).
- Cadre et photos : `normalizeOnPlan` / `denormalizeOnPlan`, `photoMarkersOnPlan`, `murLineage`.
- Contrat d'export neutre `planExportEntities` (§13). Dépôt en mémoire `InMemoryPlanRepository` (mêmes règles, lot atomique).

## 5. Plan par étage, zone, pièce

Route **statique** `/releves/plan?id=&etage=[&zone=|&piece=][&plan=]` (compatible export Capacitor). Le plan est celui de l'**étage** ; la portée **zone** ou **pièce** cadre la vue sur les contours concernés et estompe les autres. Accès : colonne « Zones et pièces » de la structure (« Plan de l'étage », « Plan de la zone »), fiche pièce (« Voir sur le plan »). Fil d'Ariane Lot 3.

## 6. Murs

Point de départ, point d'arrivée (clic / toucher, accrochage), **longueur** et **angle** saisissables (« Placer »), **épaisseur**, **hauteur** (hauteur sous plafond de l'étage par défaut), **type** (extérieur, porteur, cloison, doublage). Tracé en chaîne ; toucher le point de départ ferme le contour ; Entrée / « Terminer » / même point : fin. Rendu à l'épaisseur réelle (trait d'épaisseur mm × échelle), couleur par type.

## 7. Accrochage

Ordre : **extrémité** > intersection > milieu > **horizontal / vertical / angle usuel** (pas de 15°, depuis le point de départ ; combiné à un axe d'extrémité : point au croisement) > **alignement** (axes X / Y d'extrémités existantes) > perpendiculaire / sur l'axe d'un mur > grille. Tolérance en pixels (10 px souris, 16 px doigt) convertie en mm au zoom courant ; guides dessinés, libellé dans la barre d'état ; désactivable. Coût borné : seuls les murs voisins sont inspectés (< 5 ms à 500 murs, Vitest).

## 8. Pièces

« Détecter les pièces » : faces fermées du réseau des axes (Engine B), contour **intérieur** au nu des murs (décalage de la demi-épaisseur de CHAQUE mur). Outil « Pièce » : choisir la **pièce métier du Lot 3** puis toucher l'intérieur → contour associé (une pièce = un contour par plan). Les contours suivent les murs (recalage par point intérieur) ; un contour qui n'est plus fermé est signalé « Contour ouvert ». **Surface calculée par le serveur** (formule du lacet dans la RPC, jamais celle du client) ; affichée sur le plan et dans la liste.

## 9. Ouvertures (fondation)

Porte, fenêtre, baie, ouverture libre (`passage`) sur le mur sélectionné, avec **wall_id** (`parent_element_id`), **position** (décalage depuis A), **largeur**, **hauteur**, **type** (+ allège, sens). Toujours contenues dans le mur (ramenées si le mur raccourcit ; le serveur refuse un débordement). Symboles : baie dans le mur, vantail + arc de débattement, dormants / vitrage. **Éditeur complet (glisser le long du mur, menuiseries) laissé au lot suivant.**

## 10. Cotations

Longueur de chaque mur (lisible à l'endroit, masquée sous 56 px), **dimensions principales** hors tout (largeur et profondeur, épaisseurs comprises), **nom et surface** de chaque pièce.

## 11. Édition et corrections

| Demande | Réalisation |
|---|---|
| déplacer point | poignées des murs sélectionnés ; le **joint** suit (tous les murs qui s'y rejoignent) ; accrochage pendant le glissement |
| déplacer mur | glisser le corps du mur sélectionné ; murs voisins étirés |
| modifier longueur | champ cm, A fixe, joint B suit |
| modifier angle | champ degrés, A fixe, longueur conservée |
| supprimer | Suppr / bouton ; ouvertures et références de contour retirées |
| undo / redo | boutons + raccourcis clavier (historique de l'Atelier, 100 étapes) ; persistant (suppression / restauration serveur) |
| redresser | mur « presque » horizontal / vertical (15°) rendu exact, sinon angle usuel |
| aligner | murs sélectionnés rendus colinéaires au premier |
| fusionner | deux murs alignés (1°) qui se touchent → un mur ; ouvertures reportées |
| scinder | au milieu ; refus si une ouverture est à cheval |

## 12. PhotoAnchor sur le plan

Repères affichés quand une position existe : ancre `plan` du Lot 4 (normalisée → recalée sur le **cadre** du plan), ancre `point` (mm), photo d'un **mur** (milieu ; un plan dérivé retrouve le mur par sa lignée `origineId`), photo d'une **pièce** (point intérieur du contour). Toucher un repère → **la photo s'affiche** (URL signée du bucket privé), commentaire, lien vers la galerie de l'étage. Chargement des photos **après** le plan, sans le bloquer.

## 13. Export (compatibilité future)

`planExportEntities` : entités neutres en **mm**, repère Y haut, calques `MURS`, `OUVERTURES`, `PIECES`, `COTES`, `PHOTOS` (majuscules sans accent : contrainte DXF), primitives segment + épaisseur / polygone / texte (aucune Bézier). Preuve : **export SVG** (`planToSvg`, bouton « Exporter SVG », une seule symétrie Y, coordonnées exactes). PDF = impression du SVG ; DXF = mêmes calques en LINE / LWPOLYLINE / TEXT. **PDF et DXF non construits** (lot export).

## 14. Tablette / mobile

**MOBILE EMULATED ONLY.** Tablette 820×1180 tactile (priorité dessin) : tracé **au toucher** (2 touchers = 1 mur), **pincement deux doigts** (zoom ×1,5 et plus), **pan un doigt**, **sélection au toucher** → panneau propriétés, outils ≥ 44 px, aucun débordement. Smartphone 390×844 : consultation et tracé au toucher, aucun débordement. Toile haute (68 vh desktop, 62 vh tablette), barre d'outils collante, panneau sous la toile en portrait.

Deux défauts trouvés et corrigés par la recette :
- sur la toile SVG, `pointerdown` visait un trait et `pointerup` la toile (capture) : pas de `click` après un toucher → **toile du plan transparente aux pointeurs** (la désignation est géométrique de toute façon) ;
- hook de gestes partagé : un contact dont le relâchement n'a pas été reçu pouvait transformer le toucher suivant en pincement → **un pointeur primaire réinitialise la table des contacts** (non-régression Atelier 6/6).

Artefact d'émulation documenté (non produit) : un clic *souris* synthétique dans un contexte tactile émulé fait ignorer par Chromium le toucher suivant ; la recette touche donc les boutons (`tap()`), comme un utilisateur.

## 15. Persistance et versioning

- **Sauvegarde automatique Lot 3** réutilisée (`useAutosave` / `AutosaveController`, 700 ms) : saving / saved / error / retry / **conflict** ; la charge est la **différence** avec le dernier état enregistré, en **un** appel RPC atomique. « Garder ma saisie » relit la version serveur et réapplique la différence ; « Recharger » repart du serveur.
- **Conflit détecté** (Playwright) : enregistrement concurrent → « Modifié ailleurs : rien n'a été écrasé », valeur concurrente intacte en base, puis choix explicite.
- **Versioning** : plan associé à INITIAL / CORRECTED / PROJECTED / AS_BUILT. « Figer ce plan » : empreinte SHA-256 du contenu canonique + **version du relevé du même type** quand la chaîne le permet (D3). Plan figé en lecture seule (UI + serveur, `service_role` compris). « Nouveau plan corrigé / projeté / tel que construit » : **copie** (nouveaux identifiants, lignée `origineId`, contours remappés) ; modifier le dérivé ne touche **jamais** le plan figé (empreinte recalculée identique).

## 16. Tests

### 16.1 Ajoutés

| Suite | Fichier | Tests |
|---|---|---|
| pgTAP | `elsatia_tools_releve_metre_lot5_plan_2d.test.sql` | **67** : S1–S6 schéma et droits, C1–C9 création, E1–E20 enregistrement, P1–P5 RLS, F1–F16 gel / dérivation, K1–K3 cascade, M1–M4 gardes élément ↔ plan, G1–G3 RGPD |
| Vitest geometry | `engine/planar-faces.test.ts` (16), `releve/plan/plan-geometry.test.ts` (28) | faces, décalages, guides ; accrochage, édition, corrections, pièces, unités, symboles, SVG |
| Vitest domain | `plan.test.ts` (18), `sql-parity.test.ts` (+5) | règles, validation, différence, repères photo, export, dépôt en mémoire |
| Vitest Tools | `supabase-plan-repository.test.ts` (3) | adaptateur (lecture RLS, RPC seules, PT409 → conflit), navigation |
| Playwright desktop | `tools-releve-lot5.spec.ts` | 11 parcours (§16.2) + 4 performances |
| Playwright tablette / smartphone | `tools-releve-lot5.spec.ts` | 2 (émulation tactile) |
| Playwright Atelier | `tools-atelier-lot5-nonregression.spec.ts` | 6 |

### 16.2 Playwright Lot 5 (pile réelle, 17/17)

1. Structure → « Plan de l'étage » → plan initial ; mur antérieur au Lot 5 **adopté** ; 2 repères photo (point du plan, mur).
2. Rectangle 420 × 320 cm par longueurs / angles ; en base 4 200 / 3 200 mm, épaisseur 200, hauteur 2 500 ; cotes « 4,20 m » ; dimensions principales ; accrochage **extrémité** puis **vertical 270°** à la souris.
3. Détection (1 pièce) ; association au **Séjour** du Lot 3 → **12,00 m²** affichés et **12 000 000 mm²** calculés par le serveur ; murs du contour.
4. Longueur 420 → 450 cm (joint suivi, surface recalée 12,45 m² en base) ; glisser un point ; glisser un mur ; angle ; annuler / rétablir (boutons et Ctrl+Z) ; supprimer puis annuler (restauration serveur) ; rechargement → persistance.
5. Porte, fenêtre, baie, ouverture libre ; position 30 cm, largeur 90 cm ; en base : même `parent_element_id`, types, 300 / 900 / 2 040 mm.
6. Redresser, aligner (Maj+clic), fusionner, scinder.
7. Toucher un repère → photo affichée (640 px).
8. Conflit de version (§15).
9. Gel → lecture seule, empreinte, écriture refusée ; plan corrigé : copie avec `origineId`, photo du mur d'origine toujours placée ; suppression dans le dérivé → plan figé intact en base.
10. Portée pièce (depuis la fiche pièce) et zone.
11. **Autre tenant** : aucun plan lu, `42501` en écriture et en création, écriture directe de la table refusée même au propriétaire, page sans aucun mur.
12. Tablette ; 13. Smartphone (§14) ; 14–17. Performances (§17).

### 16.3 Échecs pgTAP préexistants (identiques Lot 4 / Lot 5)
`platform_stripe_state_attestation_r72` (stub `pgsodium`, 14/30), 7 fichiers `studio_*` (fixture), `elsatia_tools_cloud_sync_entitlement_closure_v1` (GRANT `service_role` du banc). Mêmes fichiers et compteurs qu'au Lot 4 ; aucun ne touche un objet Relevé.

### 16.4 Commandes rejouables

```text
scripts/local-postgres-bootstrap/rebuild_db.sh lot5_fresh                        → 347 migrations OK
cd supabase/tests && pg_prove -d lot5_fresh elsatia_tools_releve_metre_*.test.sql → 425/425
cd supabase/tests && pg_prove -d lot5_fresh *.test.sql                           → 141 fichiers, 3 620 tests, 9 KO connus
npx vitest run ; (apps/tools) npx vitest run                                     → 2 075 ; 2 078
npx tsc --noEmit ; (apps/tools) npm run typecheck ; npx eslint ; (apps/tools) npm run lint
node scripts/verify-migrations.mjs                                               → 347 valides
(apps/tools) NEXT_PUBLIC_TOOLS_ENV=local npm run build ; npm run build:native ; (racine) npx next build
scripts/local-postgres-bootstrap/releve_e2e_stack.sh + (apps/tools) next dev --webpack -p 3020
  + npx playwright test tests/e2e/tools-releve-lot5.spec.ts --project=desktop-chromium          → 17/17
  + npx playwright test tests/e2e/tools-releve-lot{2,3,4}.spec.ts --project=desktop-chromium    → 29/29
  + npx playwright test tests/e2e/tools-atelier-lot5-nonregression.spec.ts --project=desktop-chromium → 6/6
```

## 17. Performances

Chromium desktop 1366×1024, **Tools en `next dev`** (non optimisé), pile locale. Grille de murs (cellules 3 m) chargée en **un** appel RPC. Rendu = navigation → compteur et murs affichés (authentification comprise). Pan : 20 déplacements souris ; zoom : 10 crans de molette ; trames mesurées par `requestAnimationFrame`. Édition : longueur saisie → cote mise à jour. Sauvegarde : saisie → « Enregistré » (dont 700 ms de regroupement de la sauvegarde automatique).

| Murs | Enregistrement du lot | Rendu | Pan p95 / max trame | Zoom p95 / max trame | Édition | Sauvegarde auto | Tas JS |
|---|---|---|---|---|---|---|---|
| 50 | 65 ms | 2,8 s | 17 / 17 ms | 17 / 17 ms | 76 ms | 0,81 s | 154 Mo |
| 100 | 102 ms | 2,8 s | 17 / 17 ms | 17 / 17 ms | 92 ms | 0,80 s | 164 Mo |
| 250 | 221 ms | 4,4 s | 17 / 33 ms | 17 / 17 ms | 86 ms | 0,80 s | 162 Mo |
| 500 | 471 ms | 4,3 s | 17 / 33 ms | 33 / 33 ms | 125 ms | 0,81 s | 154 Mo |

Pincement tablette (8 étapes CDP) : 291 ms. Accrochage 500 murs < 5 ms / appel (Vitest).
Correction issue de la mesure : à 500 murs le premier rendu prenait **11,2 s** parce que la bibliothèque photo du Lot 4 (lecture de *tous* les éléments du relevé sous RLS, ≈ 2,5 s ici) bloquait l'affichage ; elle est désormais chargée après le plan → **4,3 s**.

## 18. Sécurité

| Profil | Résultat (pgTAP + Playwright) |
|---|---|
| propriétaire, membre métreur (relevé partagé), responsable | lisent ; créent / enregistrent / figent par RPC |
| consultation | lit le plan ; aucune création ni écriture |
| authentifié non habilité | aucune création |
| **autre tenant** | aucun plan ni mur de plan lisible ; création, enregistrement : `42501` ; page vide |
| anonyme | aucune RPC |
| écriture directe de `tools_releves_plans` | refusée à tous les utilisateurs (lecture seule) ; `service_role` ne peut pas modifier un plan figé |
| détournement d'identifiant | un identifiant d'élément d'un autre plan ou d'un autre type est refusé dans le lot |

## 19. Limites réelles

| Sujet | État |
|---|---|
| Appareils physiques, Safari / WebKit iOS | **non testés** (MOBILE EMULATED ONLY) — à faire avant pilote terrain |
| Performances | mesurées en `next dev` et pile locale ; à remesurer en Preview (build optimisé) |
| `tools_releves_pieces.surface_calculee_mm2` | **non alimentée** : la surface calculée par le serveur vit dans le contour du plan (D4) |
| Sélecteur de cible photo du Lot 4 | liste les murs de **tous** les plans de l'étage (un mur copié dans un plan dérivé y apparaît deux fois) — à filtrer sur le plan de référence au lot suivant |
| Ouvertures | formulaire seulement (pas de glisser le long du mur, pas de bibliothèque de menuiseries) |
| Pièce non bordée de murs | contour défini par détection des murs fermés uniquement (pas de polygone libre) |
| Jonctions des murs | trait d'épaisseur à extrémités carrées (pas de nettoyage des intersections en T / en L) |
| Cadre du plan | fixé à la création (0–20 m × 0–15 m par défaut, recopié dans les dérivés) : il porte les ancres photo normalisées et ne se modifie pas depuis l'écran |
| Exports PDF / DXF | non construits (compatibilité prouvée par le modèle neutre et l'export SVG) |
| Hors ligne | non : la sauvegarde automatique conserve la saisie et propose « Réessayer » |

## 20. DECISION_REQUIRED (choix conservateurs retenus)

| # | Sujet | Choix |
|---|---|---|
| D1 | Branche | branche de session imposée, avancée en avance rapide sur le Lot 4 |
| D2 | Stockage de la géométrie | murs / ouvertures = **éléments Relevé** existants (types `mur`, `ouverture` du Lot 2, `parent_element_id` = wall_id) rattachés par `plan_id` — les photos du Lot 4 et le contrat GP les désignent déjà ; contours et cadre dans la ligne du plan |
| D3 | Gel d'un plan initial quand le relevé a déjà une version | plan figé **seul** (empreinte) sans nouvelle version du relevé : la version initiale est unique et toujours la première (règle du Lot 2) |
| D4 | Surface de la pièce Lot 3 | non recopiée dans `surface_calculee_mm2` : cela exigeait de lever la garde Lot 3 « colonnes calculées réservées au serveur » ; laissé à une décision explicite (source proposée : plan de référence de l'étage) |
| D5 | Code de conflit | `PT409` (HTTP 409) plutôt que `40001` (rejoué sans fin par PostgREST) |
| D6 | Écriture des plans | RPC uniquement (lecture seule en table), comme les versions |

## 21. Préparation des lots suivants

- Ouvertures : modèle complet (wall_id, position, largeur, hauteur, allège, sens, type) déjà persisté et validé ; il manque l'édition graphique.
- Métré : contours intérieurs + surfaces serveur par pièce et par état → quantités (sols, murs × hauteur, plinthes) ; propagation à la pièce Lot 3 après D4.
- Export : `planExportEntities` → écrivains PDF / DXF.
- Corrections terrain : redresser / aligner / fusionner / scinder livrés ; contrainte d'orthogonalité globale et fermeture automatique à venir.

**Le Lot 6 peut démarrer** sur cette branche, sous réserve des essais sur appareils physiques (§19) avant tout pilote terrain.
