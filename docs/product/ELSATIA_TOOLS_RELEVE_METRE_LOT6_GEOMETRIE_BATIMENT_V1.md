# ELSATIA Tools — Relevé & Métré — Lot 6 — Ouvertures, jonctions & géométrie bâtiment V1

**Date** : 2026-09-28
**Branche** : `claude/happy-euler-7vzpgz` (branche de session imposée, voir D1)
**Base** : Lot 5 qualifié `claude/vibrant-darwin-b4gc9n` @ `d8539d4` (*RELEVE METRE LOT 5 LOCALLY QUALIFIED*). Pas de V4.
**Nature** : rapport autonome. Tout ce qui est affirmé a été exécuté dans cette session.
**Hors périmètre, volontairement** : écrivains PDF / DXF exposés dans l'écran (le DXF est écrit et testé, non branché), levée de la protection Lot 3 sur la surface, bibliothèque de menuiseries (fabricants, gammes), 3D, appareils physiques, Preview, production, PR, merge.

---

## 0. Verdict

> **RELEVE METRE LOT 6 LOCALLY QUALIFIED**

Le plan 2D du Lot 5 devient une géométrie bâtiment : les murs sont des **solides à l'épaisseur réelle** (axe + face gauche / face droite), **raccordés** en L (onglet), en T (about) et en X (sans chevauchement), sans trou ni surépaisseur ; les **ouvertures** (porte simple / double / coulissante, fenêtre, châssis fixe, porte-fenêtre, baie, ouverture libre) se posent **au clic ou au toucher** sur un mur, s'y déplacent et s'y redimensionnent, **restent attachées** au mur qu'on déplace, allonge, raccourcit ou pivote, **interrompent** le mur à l'affichage et à l'export, et ne peuvent jamais être enregistrées invalides (hors mur, plus larges que le mur, superposées, sur une jonction, largeur nulle, hauteur incohérente).

« Locally qualified » : prouvé sur PostgreSQL 16 avec les 348 vraies migrations et la vraie RLS, un vrai GoTrue, un vrai PostgREST, un vrai Chromium. **Tablette : MOBILE EMULATED ONLY** (Chromium en émulation tactile). Performances mesurées en `next dev`. Ni Preview, ni production.

### Chiffres clés (exécutés sur HEAD)

| Contrôle | Résultat |
|---|---|
| Install fraîche | **348 / 348** migrations (`verify-migrations` : 348 valides, noms et horodatages uniques) |
| pgTAP Relevé (9 fichiers) | **465 / 465** (Lots 2–5 : 425, **Lot 6 : 40**) |
| pgTAP suite complète | 142 fichiers, 3 660 tests ; **mêmes 9 fichiers en échec, mêmes compteurs** qu'aux Lots 4 et 5 (limites connues du banc, §16.3) |
| Vitest `packages/releve-domain` | **231 / 231** (Lot 5 : 221) |
| Vitest racine (Gestion Pro + packages) | **2 085 / 2 085** (173 fichiers ; Lot 5 : 2 075) |
| Vitest `apps/tools` | **2 118 / 2 118** (184 fichiers ; Lot 5 : 2 078) |
| `tsc --noEmit` racine et `apps/tools` | 0 erreur |
| ESLint `apps/tools` (`npm run lint`), domaine, recettes | 0 erreur, 0 avertissement dans un fichier Lot 6 |
| Build Tools web / natif (Capacitor) / Gestion Pro | OK — `/releves/plan` statique |
| Playwright Lot 6 `tools-releve-lot6.spec.ts` | **16 / 16** (desktop, tablette, sécurité, versions, export, performance) |
| Playwright non-régression Lots 2 + 3 + 4 + 5 + Atelier | **52 / 52** (29 + 17 + 6, en un seul passage) |
| Performance 500 murs + 300 ouvertures | rendu **2,2 s** (Lot 5 : 4,3 s pour 500 murs seuls), pan / zoom p95 **17 ms** |

---

## 1. Base et branche

- `git fetch` de `claude/vibrant-darwin-b4gc9n` (Lot 5 qualifié, `d8539d4`).
- **D1** : la session impose de pousser `claude/happy-euler-7vzpgz`. Cette branche pointait sur un ancêtre du Lot 5 sans commit propre : elle a été avancée **en avance rapide** sur `d8539d4`. Aucune réécriture d'historique, aucune PR, aucun merge.

## 2. Architecture — aucun second moteur

| Couche | Fichier | Rôle |
|---|---|---|
| Engine B (générique) | `apps/tools/src/lib/geometry/engine/thick-strips.ts` | **bandes épaisses raccordées** : nœuds (extrémités confondues), abouts (extrémité sur l'intérieur d'une bande), croisements, contours polygonaux, zones engagées, découpe le long de l'axe. Aucun vocabulaire métier. |
| Adaptateur bâtiment | `apps/tools/src/lib/releve/plan/wall-geometry.ts` | mur ↔ bande : solides, faces, jonctions L/T/X, parties pleines (ouvertures, croisements), emplacements libres, validation « jonction », points remarquables (accrochage, export) |
| Ouvertures | `apps/tools/src/lib/releve/plan/openings.ts` | palette de menuiseries, pose au point touché, déplacement, redimensionnement, attributs, accrochage le long du mur, refus motivés |
| Édition | `apps/tools/src/lib/releve/plan/editor.ts` | ouvertures attachées aux murs (`withMurs`, `packOpenings`), déplacement simultané de joints, T qui suivent, rotation, scission aux jonctions, nettoyage des jonctions |
| Domaine | `packages/releve-domain/src/plan.ts`, `photo.ts`, `model.ts` | attributs de menuiserie, codes et messages d'anomalie (miroir SQL), pré-contrôle de l'enregistrement, cibles photo sans doublon |
| Rendu | `components/releve/plan/PlanLayers.tsx`, `PlanEditor.tsx` | solides raccordés, symboles, poignées, aperçu, palette, panneau menuiserie |
| Export | `export-entities.ts`, `export-svg.ts`, `export-dxf.ts` | modèle neutre géométrique → SVG ; DXF R12 préparé |
| Serveur | migration `20260928001001` | validation des ouvertures à l'enregistrement, lecture rapide de la géométrie |

## 3. Jonctions (L, T, X)

Algorithme (`buildStripNetwork`) :

1. **Nœuds** : extrémités à moins de 0,5 mm (grille de hachage, O(n)).
2. **Abouts (T)** : un nœud posé sur l'intérieur d'un autre mur (index spatial des emprises, O(n·k)). Le mur traversant n'est pas coupé ; ses deux demi-directions entrent dans le tri angulaire du nœud comme arêtes « virtuelles ».
3. **Coins** : au nœud, les arêtes sont triées par angle ; entre deux arêtes consécutives, le coin est l'intersection de la face gauche de l'une et de la face droite de la suivante (**épaisseur réelle de chaque mur**, épaisseurs différentes comprises). Deux arêtes : **onglet** (L) ou prolongement ; trois ou plus : **éventail** autour du nœud (T ou X formés d'extrémités).
4. **Onglet trop aigu** : coin intérieur toujours en onglet (sinon deux murs presque parallèles se chevaucheraient) ; coin extérieur borné à 4 demi-épaisseurs, sinon **biseau** (le triangle nœud / deux coins appartient à un seul mur : ni pointe, ni encoche).
5. **Croisements (X)** entre intérieurs : signalés ; l'emprise du mur d'index le plus bas est **retirée** de l'autre, par ses deux faces (coupe exacte, aussi pour un croisement oblique) : aucun chevauchement.
6. **Extrémité libre** : bout droit exactement à l'extrémité de l'axe (le Lot 5 débordait d'une demi-épaisseur : `stroke-linecap: square`).

**Preuves** (Vitest `thick-strips.test.ts`, 12 tests dont 2 de propriétés) : échantillonnage aléatoire de 3 000 points sur 12 grilles de pièces (T et X mêlés, 4 épaisseurs) et 12 polygones quelconques : **0 point couvert deux fois (chevauchement), 0 point de cœur de mur non couvert (trou), 0 point couvert hors des bandes des murs (surépaisseur)** ; aires exactes (L : 4 000 × 200 + 3 000 × 200) ; 441 bandes en moins de 100 ms.

## 4. Épaisseur et faces

Chaque mur a un **contour raccordé** (sens trigonométrique) et deux **faces** : face gauche = **face de référence** (à gauche de A → B), face droite. Pour un contour tracé dans le sens trigonométrique (Y haut), la face de référence est la face **intérieure** (test « faces intérieure / extérieure »). Les faces servent à l'accrochage, à la cotation future (cotes intérieures) et à la convention de poussée des portes.

## 5. Ouvertures graphiques

- Outil **Ouverture** + palette : Porte, Porte double, Porte coulissante, Fenêtre, Châssis fixe, Porte-fenêtre, Baie, Ouverture libre.
- **Aperçu** au survol (vert : posable ; rouge : pas de place), **pose au clic ou au toucher** : projection du point touché sur l'axe, ouverture centrée dessus, **ramenée dans l'emplacement libre** qui le contient (hors des raccords d'extrémité, hors des murs qui aboutent ou croisent, hors des autres ouvertures), accrochage au centre du mur, aux tableaux voisins, aux limites de jonction, pas de 1 cm.
- Le panneau « Mur » garde les boutons « + Porte / + Fenêtre / + Baie / + Ouverture libre » du Lot 5 (pose dans un emplacement libre).
- **Sélection** d'une ouverture (clic dans la baie) → poignées : **corps** (glisser le long du mur) et **tableaux A / B** (redimensionner, largeur ≥ 10 cm). Un glissement bute sur une jonction ou une ouverture voisine au lieu de sauter par-dessus.

## 6. Contrainte au mur

Une ouverture appartient à son mur (`murId` + position depuis A). Comportements (Vitest « une ouverture reste attachée à son mur » + Playwright) :

| Modification du mur | Ouverture |
|---|---|
| déplacé (glisser le corps) | suit (même position relative, même largeur) |
| allongé / raccourci par B | garde sa distance à A |
| allongé / raccourci par A | reste en place dans le monde (distance à B conservée) |
| raccourci jusqu'à la toucher | glisse dans le mur, **largeur conservée**, ordre conservé, jamais de chevauchement |
| raccourci sous la somme des largeurs | **refus** (« Modification refusée : les ouvertures du mur n'y tiendraient plus ») |
| pivoté (angle, rotation) | pivote avec lui |
| scindé, fusionné (Lot 5) | reportée sur la bonne travée |

Deux défauts du Lot 5 corrigés au passage : `moveWall` enchaînait deux déplacements de joint — l'état intermédiaire (mur écrasé) **réduisait la largeur** des ouvertures ou bloquait le déplacement ; `fitOpenings` réduisait silencieusement la largeur d'une ouverture. Désormais les joints bougent **simultanément** (`moveVertices`) et une largeur n'est jamais réduite sans action explicite. Nouveau : l'extrémité d'un mur posée **en T** sur un mur qu'on modifie **reste posée** sur son axe (elle glisse le long de sa propre direction).

## 7. Portes et fenêtres

Attributs (facultatifs, dans `donnees` de l'élément `ouverture` — aucune colonne, aucune réécriture des ouvertures antérieures) :

| Attribut | Valeurs | Symbole |
|---|---|---|
| largeur, hauteur, allège | mm | — |
| `sens` (Lot 2) | gauche / droite (paumelles côté A / côté B), coulissant, aucun | vantail côté paumelles |
| `poussee` | tirant / poussant (vu depuis la face de référence) | vantail et arc du côté correspondant |
| `vantaux` | 1 / 2 | porte ou fenêtre double : deux vantaux, deux arcs |
| `modele` | battant, oscillo_battant, coulissant, galandage, fixe | coulissant : vantail en applique + rail en tirets ; galandage : poche en tirets ; fixe : vitrage seul |

Types enregistrés : les six du Lot 2 (porte, fenêtre, porte-fenêtre, baie, trémie, passage) — **châssis fixe** = fenêtre + modèle fixe, **porte coulissante** = porte + modèle coulissant (préparée : rendu, attributs, validation ; pas encore de rail paramétrable). Absent = comportement du Lot 5 (tirant, 1 vantail, battant ; baie : coulissant).

## 8. Validations

| Anomalie | Client (éditeur) | Serveur (`tools_releve_plan_enregistrer`) |
|---|---|---|
| ouverture hors mur | refus (pose, glisser, saisie) | refus 22023, y compris mur raccourci SANS renvoyer ses ouvertures |
| plus large que le mur | refus | refus 22023 |
| chevauchement | refus | refus 22023 (dans le lot et avec les ouvertures existantes) |
| sur une jonction (L / T / X) | refus pour une opération d'ouverture ; **signalé** (liste « Ouvertures à corriger », symbole rouge) si c'est un mur qui vient sur l'ouverture | non (géométrie raccordée : moteur client, voir D5) |
| largeur nulle | refus | refus 22023 |
| hauteur incohérente (allège + hauteur > hauteur du mur, allège < 0) | refus ; hauteur du mur abaissée sous ses ouvertures : refus | refus 22023 (aussi mur abaissé) |
| menuiserie inconnue (vantaux, poussée, modèle, sens) | — | refus 22023 |

Messages identiques client / serveur (parité testée). Lot entier annulé, révision inchangée (pgTAP V9). Le pré-contrôle de l'autosave (`validatePlanSave`) ne bloque que ce que le serveur refuserait **pour ce lot** : une anomalie antérieure sur un mur non touché (ouvertures superposées créées au Lot 5) est signalée sans empêcher d'enregistrer le reste.

## 9. Découpe visuelle

Le mur est **interrompu** au droit de chaque ouverture : ses parties pleines sont le contour raccordé coupé perpendiculairement à l'axe aux tableaux (`stripSolidParts`). Rendu « trait puis remplissage » : les contours sont tracés, puis les remplissages par-dessus — les coutures entre murs voisins disparaissent, seules les faces extérieures et les tableaux restent tracés. Le Lot 5 masquait la baie par un trait blanc posé sur le mur.

## 10. Pièces

La détection s'appuie sur le réseau des **axes** (inchangée) : les ouvertures ne la perturbent pas. Prouvé : maison avec cinq ouvertures → 2 pièces ; refend qui croise une cloison sans fermer de pièce → pièces et surfaces inchangées (2 850 × 3 800 mm chacune, sommet colinéaire compris) ; Playwright : détection, association au Séjour, **10,83 m² calculés par le serveur**.

## 11. Surface — protection Lot 3 maintenue, proposition de synchronisation

La surface reste calculée **par le serveur** dans le contour du plan (`contours[].surfaceMm2`, formule du lacet). `tools_releves_pieces.surface_calculee_mm2` **n'est pas alimentée** : la garde Lot 3 « colonnes calculées réservées au serveur » n'est pas levée (D4 du Lot 5, maintenu).

**Proposition (non implémentée, décision requise)** :
1. Source : le **plan de référence** de l'étage (le plus récent non supprimé) — si figé, sa valeur est stable ; sinon la valeur suit les enregistrements.
2. Mécanisme : dans `tools_releve_plan_enregistrer` et `tools_releve_plan_figer` (SECURITY DEFINER), après le calcul des contours, `update tools_releves_pieces set surface_calculee_mm2 = …` pour les pièces du plan **s'il est le plan de référence** ; la garde Lot 3 autorise déjà les écritures du serveur (propriétaire des fonctions) — aucune garde affaiblie.
3. Traçabilité : colonne ou clé `surface_source = {plan_id, revision}` dans la pièce ; journal « piece / surface ».
4. Conflit saisie / calcul : la surface **saisie** du Lot 3 reste prioritaire à l'affichage si elle existe ; l'écart (> 2 %) est signalé.
5. Tests : pgTAP (plan de référence seulement, dérivé non figé, suppression du contour → valeur effacée), Playwright (fiche pièce).

## 12. Sélecteur de cible photo (limite du Lot 5 corrigée)

`photoWallTargets` (domaine) : un mur dont une copie active existe (lignée `origineId` d'un plan dérivé) est remplacé par elle — **un mur par lignée**, copie la plus récente ; un mur supprimé dans le dérivé reste proposé (il n'existe plus que dans le plan figé) ; la cible actuelle d'une photo reste proposée. Utilisé par `PhotoTargetPicker` (capture et rattachement). Prouvé : Vitest (lignées sur trois plans, copie supprimée) ; Playwright : RDC figé (7 murs) + RDC corrigé (7 copies) + R+1 (6) + Combles (4) → **17 cibles, aucune en double, aucun mur du plan figé**.

## 13. Accrochage

Ajouts au Lot 5 (priorité) : **coin de jonction** (angles extérieurs et intérieurs des solides raccordés, abouts) juste après l'extrémité d'axe ; **tableau d'ouverture** (bords sur l'axe et sur les deux faces) après le milieu ; **face de mur** (point le plus proche des faces raccordées) avec le point sur l'axe. Ouvertures : centre du mur, tableaux voisins, limites de jonction, pas de 1 cm. Sans géométrie Lot 6 fournie, l'accrochage du Lot 5 est inchangé (test).

## 14. Tactile

MOBILE EMULATED ONLY. Tablette 820×1180 : outil et palette **au toucher** (≥ 44 px), **pose au toucher** sur un mur, sélection au toucher, **glisser l'ouverture au doigt** (évènements tactiles CDP) — +600 mm mesurés en base à ±60 mm, aucun débordement horizontal.

## 15. Annuler / rétablir, versioning

Toutes les opérations passent par l'historique du Lot 5 (100 étapes, Ctrl+Z / Maj+Ctrl+Z, boutons) : ajout, déplacement, redimensionnement, attributs, suppression d'ouverture, **scission aux jonctions**, **nettoyage des jonctions**. L'annulation est persistée (restauration serveur des éléments supprimés, ré-hébergement des ouvertures). Prouvé : Vitest (6 opérations annulées puis rétablies → document identique) et Playwright (base de données après chaque annulation).

Nouvelles corrections terrain :
- **Scinder aux jonctions** : un mur par travée aux T / X qui l'interrompent, ouvertures réparties.
- **Nettoyer les jonctions** (tolérance 3 cm) : extrémités presque confondues fusionnées sur le joint le plus partagé, extrémité presque posée sur un axe raccordée en T, léger dépassement d'un axe recoupé ; chaque correction qui rendrait un mur nul ou ferait sortir une ouverture est ignorée ; rapport affiché.

Versioning : une ouverture appartient au plan de son mur (garde Lot 5) ; le plan dérivé copie les ouvertures **avec leurs attributs** et leur lignée ; un plan figé refuse toute modification d'ouverture (RPC et écriture directe, pgTAP D3/D4, Playwright) ; modifier le dérivé ne change pas une ligne du plan figé (comparaison exacte en base).

## 16. Tests

### 16.1 Ajoutés

| Suite | Fichier | Tests |
|---|---|---|
| pgTAP | `elsatia_tools_releve_metre_lot6_geometrie_batiment.test.sql` | **40** : S1–S4 schéma et droits, O1–O8 menuiserie, V0–V12 validations, D1–D6 versioning, T1–T5 isolation, L1–L4 lecture par RPC |
| Vitest Engine B | `engine/thick-strips.test.ts` | 12 (dont propriétés : chevauchement, trou, surépaisseur ; 441 bandes) |
| Vitest bâtiment | `releve/plan/plan-lot6.test.ts` | 28 (jonctions, faces, X, pose, palette, validations, glisser, accrochage, menuiserie, contrainte au mur, T qui suit, scission, nettoyage, annuler/rétablir, pièces, export SVG / DXF, symboles, propriété « jamais d'ouverture invalide », performance 100/250/500) |
| Vitest domaine | `plan-lot6.test.ts` (10), `sql-parity.test.ts` (+3) | validations, attributs, pré-contrôle de l'enregistrement, cibles photo, parité SQL |
| Playwright | `tools-releve-lot6.spec.ts` | 16 (§16.2) |

### 16.2 Playwright Lot 6 (pile réelle, 16/16)

1. Géométrie : 4 L · 2 T · 1 X affichés ; mur sud 6,20 m hors tout et 20 cm d'épaisseur ; cloison 3,80 m (about sur les faces intérieures), 10 cm ; mur isolé exactement 4,00 m (bouts droits) ; nature des raccords au panneau.
2. Pose au clic des 8 menuiseries, aperçu valide, mur interrompu (1 → 2 → 3 parties), attributs en base, aucune ouverture dans un angle ni au droit de la cloison.
3. Validations : pas de place (baie sur la cloison), jonction, chevauchement, plus large que le mur, hauteur incohérente — base inchangée ; serveur : chevauchement direct refusé (22023, message exact, révision inchangée).
4. Glisser le corps (+50 cm) et le tableau B (+20 cm) à la souris ; mur allongé, pivoté à 90°, raccourci (refus puis glissement), déplacé : l'ouverture suit (base).
5. Sens, poussée, vantaux, menuiserie (porte → coulissante → porte) : base et symbole.
6. Annuler / rétablir : ajout, déplacement, redimensionnement, suppression, scission aux jonctions (base après chaque étape).
7. Nettoyage des jonctions sur un relevé imprécis : 2 fusions, 1 about, 1 dépassement ; 4 L · 2 T ; annuler / rétablir ; second passage « déjà propres ».
8. Pièces malgré les ouvertures : 2 détectées, Séjour associé, 10,83 m² serveur.
9. Versioning : gel, outil Ouverture absent, écriture refusée (42501), plan corrigé avec copies et lignée, ouverture déplacée dans le dérivé, plan figé identique.
10. Sélecteur photo : 17 cibles uniques, aucun mur figé.
11. Export SVG téléchargé : polygones de murs découpés, vitrages, arcs, coin extérieur en onglet.
12. Sécurité : autre tenant, lecture 0 ligne, écriture 42501.
13. Tablette (§14).
14–16. Performances (§17).

### 16.3 Échecs pgTAP préexistants (identiques Lots 4 / 5 / 6)
`platform_stripe_state_attestation_r72` (stub `pgsodium`, 14/30), 7 fichiers `studio_*` (fixture), `elsatia_tools_cloud_sync_entitlement_closure_v1` (GRANT `service_role` du banc). Aucun ne touche un objet Relevé.

### 16.4 Commandes rejouables

```text
scripts/local-postgres-bootstrap/rebuild_db.sh lot6_fresh                        → 348 migrations OK
cd supabase/tests && pg_prove -d lot6_fresh elsatia_tools_releve_metre_*.test.sql → 465/465
cd supabase/tests && pg_prove -d lot6_fresh *.test.sql                           → 142 fichiers, 9 KO connus
npx vitest run packages/releve-domain ; (apps/tools) npx vitest run
npx tsc --noEmit ; (apps/tools) npx tsc --noEmit ; (apps/tools) npx eslint src
node scripts/verify-migrations.mjs                                               → 348 valides
scripts/local-postgres-bootstrap/releve_e2e_stack.sh + (apps/tools) next dev --webpack -p 3020
  + npx playwright test tests/e2e/tools-releve-lot6.spec.ts --project=desktop-chromium → 16/16
  + npx playwright test tests/e2e/tools-releve-lot5.spec.ts --project=desktop-chromium → 17/17
```

## 17. Performances

Chromium desktop 1366×1024, **Tools en `next dev`** (non optimisé, StrictMode), pile locale. Grille de murs (cellules 3 m, murs de 20 cm et cloisons de 10 cm : L, T et X), une porte au milieu des premiers murs, chargés en **un** appel RPC (validations Lot 6 comprises). Rendu = navigation → compteurs et solides affichés. Pan : 20 déplacements souris ; zoom : 10 crans de molette ; trames par `requestAnimationFrame`. Édition : position d'une ouverture saisie → symbole redessiné. Sauvegarde : saisie → « Enregistré » (dont 700 ms de regroupement).

| Murs + ouvertures | Enregistrement du lot | Rendu | Parties de murs dessinées | Pan p95 / max trame | Zoom p95 / max trame | Édition | Sauvegarde auto | Tas JS |
|---|---|---|---|---|---|---|---|---|
| 100 + 50 | 161 ms | 1,9 s | 150 | 17 / 17 ms | 17 / 17 ms | 155 ms | 0,81 s | 160 Mo |
| 250 + 150 | 448 ms | 2,0 s | 400 | 17 / 17 ms | 17 / 17 ms | 262 ms | 0,83 s | 163 Mo |
| 500 + 300 | 699 ms | 2,2 s | 800 | 17 / 33 ms | 17 / 33 ms | 286 ms | 0,84 s | 180 Mo |

Moteur seul (Vitest) : réseau + découpe + validations de 500 murs + 300 ouvertures en quelques dizaines de ms (budget testé : 150 ms par étape).

Deux corrections issues de la mesure :
1. **Pan / zoom** : première version à 500 + 300 : p95 **117 ms** (chaque trame reprojetait 1 600 polygones et 300 symboles). Les solides et les symboles sont désormais en coordonnées **monde**, mémorisés, sous **une seule transformation** SVG (traits `non-scaling-stroke`) : un pan ne change qu'un attribut → p95 **17 ms**.
2. **Rendu** : 6 à 10 s à 500 + 300. Profil CDP : le fil principal était inactif à 88 % ; la lecture des éléments du plan coûtait **3,3 s** en base (`EXPLAIN ANALYZE` : la policy RLS évalue `tools_releve_peut` **par ligne**, ≈ 4 ms × 800), doublée en `next dev` (effets StrictMode). RPC `tools_releve_plan_elements` (droit contrôlé une fois, même prédicat) → **2,2 s** de rendu de bout en bout, authentification comprise.

## 18. Export

- `planGeometryEntities` : modèle neutre **géométrique** (mm, Y haut) — murs = **polygones fermés** raccordés et découpés, ouvertures = segments (trait / tirets / vitrage) et **arcs**, pièces = polygones + textes, cotes = textes. `planExportEntities` du Lot 5 (axes + épaisseur) reste disponible.
- **SVG** (bouton « Exporter SVG ») : épaisseur réelle, onglets, portes (vantail + arc), fenêtres (dormants + vitrage, vantaux en tirets), baies (vantaux décalés), passages (linteau en tirets). Une seule symétrie Y ; arcs en `A` avec drapeau de parcours exprimé dans le repère monde.
- **DXF (préparé)** : `export-dxf.ts`, ASCII R12 (AC1009), `$INSUNITS = 4` (mm), calques MURS / OUVERTURES / PIECES / COTES / PHOTOS, POLYLINE fermée, LINE (type DASHED pour les tirets), ARC natif, TEXT ; testé (sections, calques, 5 arcs, 11 polylignes, paires code / valeur). Non exposé dans l'écran (lot export).
- **PDF** : impression du SVG (inchangé) ; toutes les primitives sont natives en PDF.

## 19. Sécurité

| Profil | Résultat (pgTAP + Playwright) |
|---|---|
| métreur / propriétaire | pose, modifie, supprime des ouvertures par RPC |
| consultation | lit la géométrie (RLS et RPC de lecture) ; aucune écriture |
| **autre tenant** | aucune ouverture visible ; écriture 42501 ; lecture par RPC 42501 |
| anonyme | aucune RPC (écriture, lecture) |
| ouverture sur un mur d'un autre plan | refusée (42501) |
| plan figé | ouverture non modifiable (RPC et écriture directe, `service_role` compris — garde Lot 5) |

Nouvelles fonctions : `tools_releve_plan_ouverture_anomalie`, `tools_releve_plan_ouverture_message` (pures), `tools_releve_plan_murs_anomalie` (interne, non exécutable par `authenticated`), `tools_releve_plan_elements` (SECURITY DEFINER, **même prédicat** que la policy SELECT : `tools_releve_peut(releve_id, 'view')`, contrôlé une fois). `tools_releve_plan_enregistrer` redéfinie avec la même signature et les mêmes droits. RLS et table des plans (lecture seule) inchangées.

## 20. DECISION_REQUIRED (choix conservateurs retenus)

| # | Sujet | Choix |
|---|---|---|
| D1 | Branche | branche de session imposée, avancée en avance rapide sur le Lot 5 |
| D2 | Stockage des attributs de menuiserie | clés facultatives dans `donnees` (aucune colonne, contrôle générique Lot 2–4 inchangé, ouvertures antérieures non réécrites) ; châssis fixe et porte coulissante exprimés par `modele` sur les types existants |
| D3 | Chevauchement d'ouvertures | interdit (Lot 5 : permis) ; un plan antérieur qui en contient reste enregistrable tant que le mur concerné n'est pas touché ; l'anomalie est signalée |
| D4 | Surface Lot 3 | protection maintenue ; proposition §11 |
| D5 | Validation « jonction » | côté client (moteur raccordé) : la reproduire en SQL dupliquerait le moteur géométrique ; le serveur garantit les invariants simples (hors mur, largeur, chevauchement, hauteur) |
| D6 | Mur qui vient sur une ouverture | signalé, pas refusé (le relevé de l'existant peut être imparfait) ; une opération d'OUVERTURE qui crée l'anomalie est refusée |
| D7 | Lecture de la géométrie | RPC SECURITY DEFINER au même périmètre que la RLS (performance) ; lecture directe sous RLS conservée |
| D8 | Test Playwright du Lot 5 « Ouvertures foundation » | adapté : quatre ouvertures (5,33 m) sur un mur de 4,20 m se superposaient ; réparties sur les quatre murs (§21) |

## 21. Non-régression

| Rejoué | Résultat |
|---|---|
| pgTAP Lots 2, 3, 4, 5 (8 fichiers) | 425 / 425 sur la base Lot 6 (install fraîche) |
| Playwright Lot 2, Lot 3, Lot 4 (photos, Storage, mobile) | 29 / 29 |
| Playwright Lot 5 | 17 / 17 — **un test adapté** (D8) : « Ouvertures foundation » posait porte + fenêtre + baie + ouverture libre (5,33 m) sur un même mur de 4,20 m, superposées ; elles sont réparties sur les quatre murs du rectangle, mêmes contrôles (wall_id, types, position 30 cm, largeur 90 cm, hauteur 204 cm) |
| Playwright Atelier (tracé libre, pan, molette, pincement, arches, rosaces) | 6 / 6 |
| Photos (Lot 4) | recette Lot 4 incluse dans les 29 ci-dessus ; repères photo du plan (Lot 5) ; sélecteur de cible corrigé (§12) |
| Exports | SVG (Lot 5 : test unitaire mis à jour, murs en polygones) ; DXF préparé |
| Vitest Lot 5 | 3 tests mis à jour pour des changements VOULUS : superposition d'ouvertures interdite, largeur jamais réduite en silence (refus), symbole de fenêtre à deux vantaux, SVG en polygones |

## 22. Limites réelles

| Sujet | État |
|---|---|
| Appareils physiques, Safari / WebKit iOS | **non testés** (MOBILE EMULATED ONLY) |
| Performances | `next dev`, pile locale ; à remesurer en Preview |
| Jonction côté serveur | non contrôlée par le serveur (D5) |
| Murs courbes, murs biais à épaisseur variable | non gérés (murs droits, épaisseur constante) |
| Porte coulissante / galandage | préparées (rendu, attributs) ; pas de rail ni de poche paramétrables |
| Bibliothèque de menuiseries | non (dimensions libres + préréglages) |
| Export DXF | écrit et testé, non exposé dans l'écran |
| Surface Lot 3 | non synchronisée (§11) |
