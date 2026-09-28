# ELSATIA Tools — Relevé & Métré — Lot 7 — Mobilier, équipements & calques V1

**Date** : 2026-09-28
**Branche** : `claude/nifty-edison-mevolm` (branche de session imposée, voir D1)
**Base** : Lot 6 qualifié `claude/happy-euler-7vzpgz` @ `d734f25` (*RELEVE METRE LOT 6 LOCALLY QUALIFIED*). Aucun train canonique plus ancien.
**Nature** : rapport autonome. Tout ce qui est affirmé ici a été exécuté dans cette session.
**Hors périmètre, volontairement** : moteur du plan projeté (comparaison existant / projeté, métrés de dépose), bibliothèque de fabricants, 3D, PDF natif (préparé : feuille A3 à l'échelle), appareils physiques, Preview, production, PR, merge.

---

## 0. Verdict

> **RELEVE METRE LOT 7 LOCALLY QUALIFIED**

Le plan porte désormais les **objets métier** : mobilier, sanitaire, cuisine, électricité, CVC, plomberie, sécurité, rangement, technique, autre (38 objets au catalogue). Chaque objet se **pose au clic ou au toucher**, s'**accroche** (face de mur, coin, axe de mur, objet voisin, axe, grille) sans jamais empêcher le déplacement libre, se **déplace, tourne, se redimensionne, se duplique, se masque, se verrouille, se supprime et se restaure** ; les objets muraux (radiateur, meuble haut, prise, interrupteur…) se **lient à la face du mur** et le **suivent** ; chaque objet est associé **automatiquement ou à la main** à une pièce, et la **fiche pièce** en affiche la liste et le compteur réel. Neuf **calques** (visible / masqué / verrouillé) sont mémorisés avec le plan. Les objets **appartiennent à la version du plan** (INITIAL / CORRECTED / PROJECTED / AS_BUILT), sont **immuables dans un plan figé**, et portent l'état projeté (EXISTING / TO_REMOVE / NEW / MOVED). SVG et DXF les conservent ; la mise en page PDF est préparée.

« Locally qualified » : prouvé sur PostgreSQL 16 avec les 349 vraies migrations et la vraie RLS, un vrai GoTrue, un vrai PostgREST, un vrai Chromium. **Tablette : MOBILE EMULATED ONLY**. Performances mesurées en `next dev`. Ni Preview, ni production.

### Chiffres clés (exécutés sur HEAD)

| Contrôle | Résultat |
|---|---|
| Install fraîche | **349 / 349** migrations (`verify-migrations` : 349 valides) |
| pgTAP Relevé (10 fichiers) | **516 / 516** (Lots 2–6 : 465, **Lot 7 : 51**) |
| pgTAP suite complète | 143 fichiers, 3 711 tests ; **mêmes 9 fichiers en échec, mêmes compteurs** qu'aux Lots 4, 5, 6 (limites du banc, §17.3) |
| Vitest `packages/releve-domain` | **257 / 257** (Lot 6 : 231) |
| Vitest racine | **2 111 / 2 111** (174 fichiers ; Lot 6 : 2 085) |
| Vitest `apps/tools` | **2 136 / 2 136** (185 fichiers ; Lot 6 : 2 118) |
| `tsc --noEmit` racine et `apps/tools` | 0 erreur |
| ESLint `apps/tools` (`npm run lint`), domaine, recette Lot 7 | 0 erreur, 0 avertissement |
| Build Tools web / natif (Capacitor) / Gestion Pro | OK — `/releves/plan` et `/releves/piece` statiques |
| Playwright Lot 7 `tools-releve-lot7.spec.ts` | **15 / 15** (desktop, tablette, sécurité, versions, export, performance) |
| Playwright non-régression Lot 6 | **16 / 16** (même passage que le Lot 7) |
| Playwright non-régression Lots 2 + 3 + 4 + 5 + Atelier | **52 / 52** (en un seul passage) |
| Performance 1 000 objets + 250 murs + 60 portes | rendu **2,3 s**, pan / zoom p95 **17 ms**, glisser d'un objet p95 **50 ms** |

## 1. Base et branche

- `git fetch` de `claude/happy-euler-7vzpgz` (Lot 6 qualifié, `d734f25`).
- **D1** : la session impose de pousser `claude/nifty-edison-mevolm`. Cette branche pointait sur `main` (`4d92ddb`), ancêtre du Lot 6, sans commit propre : elle a été repositionnée sur `d734f25` (avance rapide, aucune réécriture d'historique publié). Aucune PR, aucun merge.

| Commit | Objet |
|---|---|
| `d5161f4` | migration 1101 (additive) + pgTAP Lot 7 (+ 1 test Lot 5 adapté, D8) |
| `f88f6b4` | domaine (objets, catalogue, calques, règles miroir SQL) + moteur Tools (opérations, accrochage, liaison au mur, symboles, export) |
| `5cb8dc8` | éditeur : outil Objet, palette, poignées, calques, groupes, corbeille ; fiche pièce |
| `225fa67` | recette Playwright Lot 7 |
| *(ce rapport)* | rapport Lot 7 |

## 2. Architecture — aucun nouveau type d'élément, aucun second moteur

Les objets sont des éléments Relevé **existants** (`tools_releves_elements.type = 'equipement'`, prévu dès le Lot 2) rattachés au plan par `plan_id`. Toutes les gardes de plan des Lots 5–6 s'appliquent sans modification.

| Couche | Fichier | Rôle |
|---|---|---|
| Serveur | migration `20260928001101` | équipement admis dans un plan, catégories étendues, contrôle d'objet, verrou, liaison au mur, copie dans un plan dérivé, empreinte, corbeille |
| Domaine | `packages/releve-domain/src/equipement.ts` | catalogue, groupes, calques, `PlanEquipement`, règles et messages (miroir SQL), correspondance élément ↔ objet, fiche pièce |
| Domaine | `plan.ts`, `plan-memory.ts`, `model.ts` | `PlanDocument.equipements`, différence / enregistrement, pré-contrôle, calques d'export, dépôt mémoire |
| Moteur (pur) | `apps/tools/src/lib/releve/plan/equipments.ts` | opérations (document → document), verrou, liaison au mur (`followWalls`), pièce automatique, poignées |
| Accrochage | `equipment-snap.ts` | face / coin / axe de mur / objet / axe / grille, sur les solides raccordés du Lot 6 |
| Symboles | `equipment-symbols.ts` | conventions de dessin (cuvette, vasque, siphon, feux, ailettes, prise…) en coordonnées monde |
| Éditeur | `PlanEditor.tsx`, `PlanLayers.tsx`, `EquipmentPanels.tsx` | outil, gestes souris / tactile, panneaux, rendu mémorisé |
| Fiche pièce | `PieceEquipementsPanel.tsx` | équipements de la pièce, compteur réel |
| Export | `export-entities.ts`, `export-svg.ts`, `export-dxf.ts` | objets par calque ; cercles natifs ; feuille A3 à l'échelle |

## 3. Catégories et objets (§2, §3)

Catégories (miroir SQL, parité testée) : **mobilier, sanitaire, cuisine, électricité, CVC, plomberie, sécurité, rangement, technique, autre** + éclairage (Lot 2, conservée).

| Groupe | Objets |
|---|---|
| Mobilier | bureau, chaise, table, armoire, étagère, lit, canapé, meuble |
| Rangement | placard, dressing |
| Sanitaire | WC, lavabo, douche, baignoire, urinoir, lave-mains |
| Cuisine | évier, meuble bas, meuble haut, plan de travail, réfrigérateur, four, plaque de cuisson |
| Électricité | tableau électrique, prise, interrupteur |
| CVC | radiateur, climatiseur, bouche VMC |
| Plomberie | chauffe-eau, vanne d'arrêt |
| Sécurité | extincteur, détecteur de fumée, BAES |
| Technique | chaudière, compteur |
| Éclairage / Autre | luminaire / objet |

Chaque entrée porte ses dimensions et sa cote de pose par défaut (meuble haut 1,40 m, prise 30 cm, interrupteur 1,10 m…) et s'il est **mural** (lié au mur quand on le pose contre une face).

## 4. Objet de plan (§4)

| Attribut demandé | Stockage (`donnees`, clés stables) |
|---|---|
| id stable | `tools_releves_elements.id` (UUID client, jamais réécrit) |
| type | `objet` (catalogue) + `categorie` |
| position | `position` = **centre**, mm, repère étage Y haut |
| rotation | `rotationRad` (normalisée dans ]−π, π]) |
| largeur / profondeur / hauteur | `largeurMm`, `profondeurMm` (obligatoires, > 0), `hauteurMm` (facultative) |
| niveau | **étage** = celui du plan (`etage_id`) ; **cote de pose** `niveauMm` au-dessus du sol fini (D2) |
| label | `libelle` (1–200 car.) |
| commentaire | `commentaire` (≤ 2 000 car.) |
| visible / locked | `visible`, `verrouille` |
| pièce | colonne `piece_id` + `pieceAuto` |
| liaison au mur | `murId`, `face` (gauche = face de référence), `decalageMm` |
| état projeté | `etatProjet` : existant / a_deposer / nouveau / deplace |
| lignée | `origineId` (copie dans un plan dérivé) |

Contrôle serveur à l'enregistrement : `tools_releve_plan_equipement_anomalie` (catégorie, objet du catalogue, libellé, position, dimensions, rotation, niveau, commentaire, état projeté, types) ; messages identiques client / serveur (parité testée). Lot entier annulé en cas de refus (révision inchangée, pgTAP E15).

## 5. Édition (§5, §16, §17)

| Opération | Souris | Tactile | Panneau / clavier | Annulable |
|---|---|---|---|---|
| ajouter | clic (aperçu + accroche au survol) | toucher | palette groupe → objet | oui |
| déplacer | glisser le corps (1 ou plusieurs) | glisser au doigt | — | oui |
| tourner | poignée ronde devant l'objet (pas de 15° à ±4°) | poignée au doigt | champ « Rotation », ↺ / ↻ 90°, touche **R** | oui |
| redimensionner | poignée carrée d'angle (coin opposé fixe) | au doigt | largeur / profondeur | oui |
| dupliquer | — | — | « Dupliquer » (sélection simple ou multiple) | oui |
| masquer | — | — | « Masquer », groupe « Tout masquer » | oui |
| verrouiller | — | — | « Verrouiller » (glisser et panneau bloqués) | oui |
| supprimer | touche Suppr | — | « Supprimer », groupe « Tout supprimer » | oui |
| restaurer | — | — | corbeille : « Restaurer », « Tout restaurer » | oui |

Toutes les opérations sont pures et passent par l'historique du Lot 5 (100 étapes) : prouvé en Vitest (8 opérations annulées puis rétablies → document identique, même objet) et en Playwright (base relue après ajout / Ctrl+Z / Rétablir, rotation R / Annuler, suppression / Annuler = restauration serveur).

**Verrou** : appliqué au client (opérations ignorées, motif affiché) **et au serveur** (un objet verrouillé qui le reste n'est ni modifié ni supprimé ; seul le déverrouillage passe — pgTAP K1–K4, Playwright).

## 6. Tout supprimer / masquer un groupe (§6)

Panneau **Calques → Groupes d'objets** : pour chaque catégorie présente, « Tout masquer / Tout afficher » et « Tout supprimer » **avec confirmation** (« Supprimer les N objet(s) du groupe « … » ? Ils resteront restaurables »). Suppression **douce** côté serveur. Restauration : **Annuler**, ou la **corbeille** (objets supprimés de la séance + objets supprimés relus du serveur par la RPC `tools_releve_plan_equipements_supprimes`, donc aussi après rechargement). Les objets verrouillés d'un groupe sont conservés et comptés. Prouvé : refus de la confirmation → rien ; acceptation → `deleted_at` posé ; rechargement → corbeille relue ; « Tout restaurer » → objets actifs en base.

## 7. Calques (§7)

Structure, Ouvertures, Mobilier, Sanitaire, Cuisine, Technique, Photos, Annotations, Cotations — chacun **visible / masqué / verrouillé**. Mémorisés dans `reglages.calques` du plan (plan modifiable ; enregistrés, annulables) ; sur un plan figé ou en consultation, l'affichage se règle localement.

| Calque | Contenu | Verrouillé = |
|---|---|---|
| Structure | murs (solides, axes, poignées) | murs non sélectionnables |
| Ouvertures | menuiseries | ouvertures non sélectionnables |
| Mobilier | mobilier, rangement, autre | objets non sélectionnables ni ajoutables |
| Sanitaire | sanitaire | idem |
| Cuisine | cuisine | idem |
| Technique | électricité, CVC, plomberie, sécurité, technique, éclairage | idem |
| Photos | repères photo | — |
| Annotations | noms / surfaces des pièces, libellés d'objets | — |
| Cotations | cotes des murs, dimensions principales | — |

Un calque masqué n'est **pas exporté** (SVG, DXF, feuille A3).

## 8. Accrochage (§8)

`resolveEquipmentSnap`, par priorité, chaque accroche limitée à la tolérance écran (souris / doigt, comme au Lot 5) :

1. **face de mur** — dos de l'objet contre la face (solides raccordés du Lot 6, épaisseur réelle), orienté vers la pièce ; objet mural → liaison ;
2. **coin** — un côté contre l'extrémité de la face (angle de la pièce) ;
3. **axe de mur** (bouche, détecteur…) ;
4. **objet** — bord contre bord avec un voisin de même orientation ;
5. **axe** — centre aligné sur le centre d'un objet ou le milieu d'un mur ;
6. **grille** du plan.

Hors de toute accroche : **déplacement libre** ; bouton « Accrochage » pour tout désactiver. Prouvé (Vitest) : face (y = 150 pour un radiateur de 10 cm contre un mur de 20 cm), face nord (rotation π), coin (bords à 100 / 100), objet, axe, grille, libre, désactivé ; Playwright : aperçu `data-kind="face"`, WC posé « dans l'angle contre le mur (lié) » à (290, 425) exactement.

## 9. Objets liés au mur (§9)

Liaison = `murId` + `face` + `decalageMm`. Implémentée (au-delà de « préparer ») : l'objet **suit** son mur déplacé, pivoté, allongé, raccourci (décalage borné), **scindé** (reporté sur la bonne travée), **fusionné** (position réelle conservée) ; mur supprimé → objet **libéré** sur place ; « Détacher du mur » au panneau. Serveur : un objet ne peut être lié qu'à un mur **actif du même plan** ; supprimer un mur sans détacher ses objets est refusé (pgTAP W1–W4). Plan dérivé : la liaison est reportée sur la **copie** du mur (pgTAP V6, Vitest dépôt mémoire). Prouvé en Playwright : mur sud glissé de 30 cm → radiateur recalé (dos contre la face, même décalage), puis Annuler.

## 10. Pièce (§10)

**Automatique** : pièce dont le contour contient le centre de l'objet (plus petite si recouvrement), recalculée à chaque modification (y compris quand les murs, donc les contours, bougent — Vitest). **Manuelle** : sélecteur « Pièce » du panneau (`pieceAuto = false`, n'est plus recalculée) ; « Automatique » revient au calcul. Serveur : pièce **active du même étage** exigée (pgTAP E13).

## 11. Fiche pièce (§11)

Section **Équipements (N)** : liste (libellé, dimensions, cote de pose, état projeté, commentaire), répartition par catégorie, lien vers le plan. **Compteur réel** : objets du **plan de référence** de l'étage (le plus récent — les plans antérieurs en portent des copies, jamais comptées deux fois) + équipements hors plan (Lot 2). Prouvé : Vitest (copies non doublées) ; Playwright (compteur = lignes en base pour Bureau et Salle d'eau).

## 12. Versioning (§12)

- Un objet appartient au plan (donc à l'état INITIAL / CORRECTED / PROJECTED / AS_BUILT) de son `plan_id`.
- **Plan figé** : aucun objet créé, modifié ni supprimé — RPC (42501) et écriture directe (42501), gardes du Lot 5 inchangées (pgTAP V4–V5, Playwright).
- **Empreinte** : les objets entrent dans le contenu canonique du gel ; la clé n'est ajoutée **que si le plan en porte** — l'empreinte des plans figés avant le Lot 7 reste recalculable (pgTAP V2–V3).
- **Plan dérivé** : objets copiés avec leur lignée ; modifier le dérivé ne change pas une ligne du plan figé (comparaison exacte en base, Playwright).

## 13. Plan projeté (§13)

`etatProjet` ∈ existant / à déposer / nouveau / déplacé (EXISTING / TO_REMOVE / NEW / MOVED), sélecteur au panneau sur un plan projeté ; rendu distinct (à déposer : tirets rouges ; nouveau : vert ; déplacé : bleu) ; exporté. Le moteur de comparaison existant → projeté n'est **pas** construit (hors périmètre demandé) : la lignée `origineId` et l'état suffisent à le brancher.

## 14. Export (§14)

- **SVG** : calques MOBILIER / SANITAIRE / CUISINE / TECHNIQUE (contour, marques du symbole, cercles natifs, libellés).
- **DXF** (désormais **exposé** : bouton « Exporter DXF ») : mêmes calques, `CIRCLE` natif pour les cercles, polylignes fermées, lignes (tirets), textes.
- **PDF préparé** : bouton « Feuille A3 (PDF) » → SVG à la taille réelle d'une feuille A3 paysage (420 × 297 mm), plan centré à l'**échelle usuelle** la plus grande qui tient (1:20, 1:50, 1:100…), cartouche « titre — échelle 1:x » ; imprimable en PDF vectoriel par le navigateur. A4 aussi (`planToPrintSvg`).
- Objets masqués et calques masqués exclus. Prouvé : Vitest (calques, 4 cercles, exclusions, échelle) ; Playwright (fichiers téléchargés).

## 15. Performances (§15)

Chromium desktop 1366×1024, Tools en `next dev` (non optimisé, StrictMode), pile locale. **Plan complexe** : 250 murs (grille 12 colonnes, murs de 20 cm et cloisons de 10 cm : L, T, X) + 60 portes + N objets de 10 types, chargés en un appel RPC. Glisser : 12 déplacements souris d'un objet sélectionné.

| Objets | Enregistrement du lot | Rendu | Pan p95 / max | Zoom p95 / max | Glisser p95 / max | Sauvegarde auto | Tas JS |
|---|---|---|---|---|---|---|---|
| 50 | 0,39 s | 2,0 s | 17 / 33 ms | 17 / 33 ms | **17 / 17 ms** | 0,82 s | 173 Mo |
| 250 | 0,55 s | 1,9 s | 17 / 17 ms | 17 / 33 ms | **17 / 17 ms** | 0,82 s | 169 Mo |
| 500 | 0,70 s | 2,3 s | 17 / 33 ms | 17 / 17 ms | **33 / 33 ms** | 0,83 s | 176 Mo |
| 1 000 | 1,13 s | 2,3 s | 17 / 33 ms | 17 / 33 ms | **50 / 50 ms** | 0,86 s | 187 Mo |

Correction issue de la mesure : première version, glisser p95 **67 ms dès 50 objets** et 83 ms à 250 (chaque trame recalculait les anomalies d'ouverture, les points d'accrochage, l'emprise et redessinait tous les murs et tous les objets). Désormais : ces calculs ne dépendent que des murs / ouvertures, murs et ouvertures sont mémorisés sur leurs propres tableaux, chaque objet est un composant mémorisé par référence (symbole mis en cache) → seul l'objet déplacé est redessiné. Moteur seul (Vitest) : synchronisation + 60 accrochages + 1 000 symboles + SVG sous budget à 50 / 250 / 500 / 1 000 objets.

## 16. Sécurité (§18)

| Profil | Résultat (pgTAP + Playwright) |
|---|---|
| métreur / propriétaire | crée, modifie, supprime, restaure des objets par RPC |
| consultation | lit objets et corbeille ; aucune écriture (42501) |
| **autre tenant** | aucun objet visible ; écriture 42501 ; corbeille 42501 |
| anonyme | aucune RPC |
| plan figé | objet non modifiable (RPC et écriture directe) |
| pièce d'un autre étage, mur d'un autre plan | refusés |

Nouvelles fonctions : `tools_releve_plan_equipement_anomalie`, `tools_releve_plan_equipement_message` (pures), `tools_releve_plan_equipements_supprimes` (SECURITY DEFINER, `tools_releve_peut(releve_id, 'view')` contrôlé une fois — même prédicat que la policy SELECT). Redéfinies avec la même signature et les mêmes droits : `tools_releve_plan_enregistrer`, `tools_releve_plan_creer`, `tools_releve_plan_contenu`, `tools_releve_element_donnees_valides` (identique à 801, liste des catégories allongée). RLS, droits des tables, isolation : **inchangés**. Contrainte `tools_releves_elements_plan_type` élargie à `equipement` (toutes les lignes existantes restent valides).

## 17. Tests (§19)

### 17.1 Ajoutés

| Suite | Fichier | Tests |
|---|---|---|
| pgTAP | `elsatia_tools_releve_metre_lot7_equipements_calques.test.sql` | **51** : S1–S6 schéma et droits, C1–C3 contrat générique, E1–E15 objets et refus, W1–W4 liaison au mur, K1–K4 verrou, R1–R4 suppression / corbeille / restauration, F1 fiche pièce, V1–V8 versioning et projeté, T1–T6 isolation |
| Vitest domaine | `plan-lot7.test.ts` | 26 : parité SQL (catégories, catalogue, états, messages, bornes), objet, anomalies, rotation, emprise, calques, diff, validation, export, fiche pièce, dépôt mémoire |
| Vitest géométrie / moteur | `apps/tools/.../plan-lot7.test.ts` | 18 : pièce auto / manuelle, 9 opérations, désignation, groupes, liaison au mur (déplacé, pivoté, raccourci, supprimé, scindé, fusionné), accrochage (6 cas), symboles des 38 objets, SVG / DXF / A3, annuler / rétablir, recalage des pièces, performance 50–1 000 |
| Playwright | `tools-releve-lot7.spec.ts` | 15 (§17.2) |

### 17.2 Playwright Lot 7 (pile réelle, 15/15)

1. Palette (11 groupes, objets du cahier des charges) ; bureau libre (pièce auto Bureau) ; radiateur accroché à la face et lié (y = 150, niveau 15 cm) ; WC dans l'angle et lié.
2. Souris : redimensionner (+30 cm, coin fixe), glisser (+50 cm), tourner (¼ de tour) ; panneau : largeur, niveau 0, libellé, commentaire, rotation ; dupliquer, masquer ; verrouiller (glisser sans effet, refus serveur de suppression), déverrouiller.
3. Mur sud glissé : radiateur recalé ; Annuler ; détacher ; pièce manuelle puis automatique.
4. Calques : Mobilier masqué (mémorisé, relu après rechargement), Sanitaire verrouillé (WC non sélectionnable), Structure verrouillée, Cotations masquées.
5. Groupes : tout masquer / afficher, tout supprimer (confirmation refusée puis acceptée), corbeille relue du serveur, tout restaurer.
6. Annuler / rétablir : ajout, rotation (R), suppression (restauration serveur).
7. Fiche pièce : compteur réel et liste (Bureau, Salle d'eau).
8. Versioning : gel, outil Objet absent, RPC et écriture directe refusées ; plan projeté dérivé (copies + lignée) ; à déposer / déplacé / nouveau ; plan figé identique.
9. Export : SVG (4 calques d'objets, cercles), DXF (calques, CIRCLE), feuille A3 à l'échelle.
10. Sécurité : autre tenant (lecture, écriture, corbeille).
11. Tablette (§18).
12–15. Performances 50 / 250 / 500 / 1 000 (§15).

### 17.3 Échecs pgTAP préexistants (identiques Lots 4 / 5 / 6 / 7)
`platform_stripe_state_attestation_r72` (stub `pgsodium`, 14/30), 7 fichiers `studio_*` (fixture), `elsatia_tools_cloud_sync_entitlement_closure_v1` (GRANT `service_role` du banc). Aucun ne touche un objet Relevé.

### 17.4 Commandes rejouables

```text
scripts/local-postgres-bootstrap/rebuild_db.sh lot7_fresh                        → 349 migrations OK
cd supabase/tests && pg_prove -d lot7_fresh elsatia_tools_releve_metre_*.test.sql → 516/516
cd supabase/tests && pg_prove -d lot7_fresh *.test.sql                           → 143 fichiers, 9 KO connus
npx vitest run ; (apps/tools) npx vitest run ; npx tsc --noEmit ; (apps/tools) npx tsc --noEmit ; (apps/tools) npm run lint
node scripts/verify-migrations.mjs                                               → 349 valides
scripts/local-postgres-bootstrap/releve_e2e_stack.sh + (apps/tools) next dev --webpack -p 3020
  + npx playwright test tests/e2e/tools-releve-lot7.spec.ts tests/e2e/tools-releve-lot6.spec.ts --project=desktop-chromium → 31/31
  + npx playwright test tests/e2e/tools-releve-lot{2,3,4,5}.spec.ts tests/e2e/tools-atelier-lot5-nonregression.spec.ts --project=desktop-chromium → 52/52
```

## 18. Tablette (§16)

MOBILE EMULATED ONLY. 820×1180, tactile : outil, groupes et objets **au toucher** (boutons ≥ 44 px), lit posé au toucher, radiateur posé au toucher contre la face (lié), sélection au toucher, **glisser au doigt** (+60 cm mesurés en base à ±6 cm), **rotation au doigt** par la poignée (−90° en base), aucun débordement horizontal.

## 19. Non-régression (§20)

| Rejoué | Résultat |
|---|---|
| pgTAP Lots 2–6 (9 fichiers) | 465 / 465 sur la base Lot 7 — **un test adapté** (D8) |
| Playwright Lot 2, 3, 4, 5, Atelier | 52 / 52 (un seul passage) |
| Playwright Lot 6 | 16 / 16 |
| Vitest Lots 2–6 | inchangés, verts (domaine 231 → 257, Tools 2 118 → 2 136 : ajouts seulement) |
| Photos (Lot 4) | incluses dans les 52 ; le sélecteur de cible photo proposait déjà les équipements (inchangé) |

## 20. DECISION_REQUIRED (choix conservateurs retenus)

| # | Sujet | Choix |
|---|---|---|
| D1 | Branche | branche de session imposée, repositionnée en avance rapide sur le Lot 6 |
| D2 | « niveau » | l'**étage** est celui du plan ; `niveauMm` = cote de pose au-dessus du sol fini |
| D3 | Modèle de données | type d'élément `equipement` existant, attributs dans `donnees` (aucune colonne) ; catégories = sur-ensemble ordonné du Lot 2 |
| D4 | Calques | mémorisés dans `reglages` du plan (versionnés, annulables) ; plan figé : affichage local |
| D5 | Verrou | protection contre la fausse manipulation, **appliquée aussi par le serveur** ; masquer / afficher un objet verrouillé est refusé |
| D6 | Équipements hors plan (Lot 2) | **non adoptés** par les plans existants (pas de dimensions fiables) ; comptés dans la fiche pièce |
| D7 | Suppression d'une pièce | la cascade Lot 2 (pièce → éléments) s'applique aussi aux objets de la pièce ; restaurable avec la pièce |
| D8 | Test pgTAP Lot 5 « M2 » | vérifiait qu'un équipement ne peut PAS appartenir à un plan — exactement ce que le Lot 7 ouvre ; adapté avec un type toujours exclu (matériau), même code d'erreur |
| D9 | État projeté | admis sur tout plan (valeur validée), proposé à l'écran sur un plan projeté : une dérivation projeté → corrigé ne peut donc jamais bloquer |
| D10 | Rattachement photo d'un objet dont la pièce change | l'ancre existante n'est pas réécrite (garde Lot 4 évaluée à l'écriture de l'ancre) |

## 21. Limites réelles

| Sujet | État |
|---|---|
| Appareils physiques, Safari / WebKit iOS | **non testés** (MOBILE EMULATED ONLY) |
| Performances | `next dev`, pile locale ; glisser à 1 000 objets p95 50 ms (20 i/s) — à remesurer en build de production / Preview |
| Plan projeté | états posés et rendus ; pas de comparaison existant / projeté ni de métré de dépose |
| PDF | préparé (feuille A3 / A4 à l'échelle, vectorielle) ; pas de génération PDF côté serveur |
| Objets | rectangles orientés + symboles ; pas de formes libres, pas de bibliothèque fabricants, pas de 3D |
| Liaison au mur | position le long du mur libre (pas de contrôle de collision avec les ouvertures) |
| Sélection multiple | Maj + clic ; pas de sélection au lasso |
