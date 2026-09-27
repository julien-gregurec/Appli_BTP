# ELSATIA Tools — Relevé & Métré — Lot 3 — Structure terrain & relevé métier V1

**Date** : 2026-09-27
**Branche** : `claude/tender-gauss-inpj33` (branche de session, voir D1)
**Base** : Lot 2 qualifié `claude/friendly-cori-c3tw3n` @ `e122384e`, lui-même posé sur le train canonique V3 `integration/elsatia-canonical-train-v3` @ `ef7443c0` (dernier train, vérifié par `git fetch --all --prune`). Pas `main`.
**Nature** : rapport autonome. Tout ce qui est affirmé a été exécuté dans cette session.
**Hors périmètre, volontairement** : déploiement, preview, production, facturation Stripe réelle, synchronisation GP réelle, hors ligne (IndexedDB), éditeurs murs / ouvertures / mesures / photos, merge.

---

## 0. Verdict

> **RELEVE METRE LOT 3 LOCALLY QUALIFIED**

Le premier workflow métier Relevé & Métré est livré de bout en bout, sur la pile locale réelle (PostgreSQL 16 + vraies migrations + vraie RLS, GoTrue, PostgREST, navigateur) :

**Mes relevés → Nouveau relevé → Chantier → Bâtiment → Étage → Zone → Pièce**, avec fiche chantier et fiche pièce en sauvegarde automatique, duplication, réordonnancement, suppression maîtrisée et restauration, recherche, filtres, audit et contrôle de concurrence entre onglets — sur desktop, tablette et smartphone.

« Locally qualified » : prouvé localement ; **pas** en Preview, **pas** en production, **pas** sur appareils physiques.

### Chiffres clés (exécutés sur HEAD)

| Contrôle | Résultat |
|---|---|
| Install fraîche (bootstrap local PostgreSQL 16) | **345 / 345** migrations |
| Upgrade 344 → 345 avec données Relevé Lot 2 | OK ; lignes existantes valides (valeurs par défaut sûres) ; restauration post-upgrade OK ; **schéma identique** à l'install fraîche (`pg_dump -s`, privilèges inclus : **0 ligne de diff**) |
| `verify-migrations` | 345 valides, noms et horodatages uniques |
| pgTAP Relevé (5 fichiers) | **244 / 244** (174 Lot 2 + **70 Lot 3**) |
| pgTAP suite complète | 138 fichiers, 3 439 tests ; **mêmes 9 fichiers en échec, mêmes compteurs** que sur la base 344 (limites connues du banc, §14.3) |
| Vitest `packages/releve-domain` | **134 / 134** (+28) |
| Vitest racine (Gestion Pro + packages) | **1 988 / 1 988** (167 fichiers) |
| Vitest `apps/tools` | **2 023 / 2 023** (178 fichiers, +17) |
| `tsc --noEmit` racine et `apps/tools` | 0 erreur |
| ESLint racine et `apps/tools` | 0 erreur (15 avertissements antérieurs, aucun dans un fichier Relevé) |
| Build Tools web (`next build --webpack`) | OK — `/releves`, `/releves/nouveau`, `/releves/fiche`, `/releves/structure`, **`/releves/piece`** statiques |
| Build Tools natif (export Capacitor) | OK — `out/releves/{index,nouveau,fiche,structure,piece}` |
| Build Gestion Pro (`next build`) | OK |
| Playwright Lot 3 `tests/e2e/tools-releve-lot3.spec.ts` | **6 / 6** (pile réelle) |
| Playwright Lot 2 `tests/e2e/tools-releve-lot2.spec.ts` (non-régression) | **4 / 4** sur la nouvelle interface |

---

## 1. Base et branche

- `git fetch --all --prune` ; train le plus récent : `integration/elsatia-canonical-train-v3` @ `ef7443c0` (2026-09-27 05:45). Le Lot 2 qualifié (`e122384e`) le contient (ancêtre vérifié) : la branche de travail a été recréée depuis `e122384e`.
- Aucune branche distante ne porte de migration postérieure à `20260927000604` ; plage Lot 3 : **`20260927000701`**.
- **D1** : poussé sur la branche de session imposée `claude/tender-gauss-inpj33` (aucune autre branche, aucune PR, aucun merge).

## 2. Décision produit : Relevé Pro inclut Tools Pro

Retenue et documentée dans **`docs/product/ELSATIA_TOOLS_RELEVE_METRE_CONTRAT_PRODUIT_V1.md`** (remplace la décision de travail D4 du Lot 2).
- Déjà outillée côté serveur (catalogue `tools_offres_catalogue`, migration 602) : aucune migration nécessaire.
- Domaine : commentaires mis à jour, `RELEVE_PRO_PRODUCT_DECISION` (`includesToolsPro: true`, `realBillingActive: false`), test Vitest dédié.
- **Stripe non activé** : aucun produit, prix, SKU, webhook, abonnement ; `commercialement_active = false` ; garde anti-achat inchangée.

## 3. Commits

| Commit | Objet |
|---|---|
| `a2d99ec9` | migration 701 (additive) + pgTAP Lot 3 (70 tests) |
| `85a2a5fa` | domaine terrain + adaptateur Supabase + contrat GP + décision produit |
| `38889382` | interface terrain (structure, fiche pièce, fiche relevé, liste, autosave) + Playwright Lot 3 |
| `5f42bd4c` | tests adaptateur Lot 3 |
| *(ce rapport)* | contrat produit + rapport Lot 3 |

## 4. Migration `20260927000701_tools_releve_metre_lot3_structure_terrain.sql`

**Strictement additive** : aucune migration appliquée modifiée ; toute ligne valide avant l'est après (CHECK élargis, colonnes nullables ou avec défaut) ; pgTAP Lot 2 174/174 inchangé.

| Bloc | Contenu |
|---|---|
| Chantier | `client_nom`, `client_gp_id` (FK `clients`, même entreprise, permission `acces_clients` sauf recopie du lien du projet), `reference`, `description`, `date_releve`, `statut` (`a_relever`, `en_cours`, `termine`, `archive`) |
| Étage | `type_niveau` (`sous_sol`, `rdc`, `etage`, `entresol`, `mezzanine`, `combles`, `toiture`, `autre`) à côté du `niveau` entier (clé de tri) ; `altitude_mm` existait déjà |
| Zone | types `aile`, `secteur`, `appartement`, `plateau` ajoutés (zone technique = `local_technique` existant) ; zone toujours facultative |
| Pièce | types `circulation`, `local_technique`, `stockage` ajoutés ; `commentaire`, `statut` (`a_relever`, `en_cours`, `releve`, `a_verifier`) ; `surface_calculee_mm2`, `volume_calcule_mm3`, `calcule_le` **réservées au serveur** (réécrites par trigger pour tout utilisateur) |
| Garde de structure | trigger `tools_releve_structure_garde` : parents physiques **immuables** (étage→bâtiment, zone→étage, pièce→étage : les éléments métier portent `etage_id`) ; déplacements ouverts : bâtiment vers un autre chantier du relevé, pièce vers une autre zone du même étage ; jamais vers un parent supprimé ; **restauration seulement sous un parent actif** |
| Journal | actions `renommage`, `deplacement`, `reordonnancement`, `duplication` ; colonne `details` (identifiants et ordres uniquement, ≤ 2 000 o : jamais de contenu, RGPD) |
| RPC | `tools_releve_dupliquer_noeud` (SECURITY DEFINER + contrôle `edit` explicite, pas d'oracle d'existence), `tools_releve_reordonner` (SECURITY INVOKER, fratrie complète exigée, conflit `40001` si la liste a changé), `tools_releve_rechercher` (SECURITY INVOKER : filtrée par la RLS), `tools_releve_normaliser` |
| Droits | RPC : `authenticated` seulement ; fonction de garde : jamais appelable |

## 5. Workflow terrain (§2) et écrans

| Étape | Écran | Détail |
|---|---|---|
| Mes relevés | `/releves` | filtres **Actifs / Archivés / Récents / Corbeille**, recherche serveur (chantier, bâtiment, étage, zone, pièce) + filtre local, restauration depuis la corbeille |
| Nouveau relevé | `/releves/nouveau` | projet + premier chantier (qui hérite du client, de la référence et de la date) |
| Chantier | `/releves/fiche?id=` | fiche relevé et **fiche chantier** en sauvegarde automatique, ordre des chantiers, versions, activité, corbeille du relevé |
| Bâtiment → Étage → Zone | `/releves/structure?id=&chantier=&batiment=&etage=` | colonnes (desktop) / **navigation en profondeur** (≤ 900 px), actions par nœud, ajout rapide d'étages, propriétés d'étage en autosave |
| Pièce | **`/releves/piece?id=&piece=`** (nouveau, statique, compatible export natif) | fiche pièce en autosave, surface / volume calculés (affichés « — » tant que non calculés), pièce précédente / suivante |

### §3 Chantier — nom, client, adresse, CP, ville, référence, description, date, statut
Tous éditables (fiche chantier). Futur rattachement GP : `chantier_gp_id` et `client_gp_id` (même entreprise, permission GP) ; l'écran indique « Rattachement Gestion Pro : prévu (synchronisation non activée) ».

### §4 Bâtiment — création, renommage, ordre, duplication, suppression contrôlée
Menu « ⋯ » par bâtiment : Renommer, Monter, Descendre, Dupliquer, Déplacer vers un autre chantier (si plusieurs), Retirer (confirmation avec impact).

### §5 Étage — Sous-sol, RDC, R+1, R+2, Combles
Nom libre + `type_niveau` + `niveau` entier : des combles au niveau 3 ou un entresol au niveau 1 sont possibles. Ajout rapide « + RDC / + R+n / + Combles / + Sous-sol ». Altitude (m) et hauteur sous plafond (cm) saisies en unités terrain, stockées en mm.

### §6 Zone — aile, secteur, appartement, plateau, lot, zone technique
Facultative ; une pièce peut rester « hors zone ». Retirer une zone ne retire pas ses pièces (elles restent sur l'étage, annoncé dans la confirmation).

### §7 Pièce — nom, type, hauteur, commentaire, statut, surface / volume calculés futurs
Types proposés en premier : bureau, chambre, séjour, cuisine, WC, SDB, circulation, local technique, stockage, extérieur, autre (+ types Lot 2 accessibles). Surface / volume : colonnes serveur, jamais saisies.

## 6. Identifiants (§8)
UUID générés **côté client** pour tout nouvel objet (relevé, chantier, bâtiment, étage, zone, pièce **et copie dupliquée** via `p_nouvel_id`) : prêt pour le hors ligne (rejeu idempotent). Aucun identifiant ne change lors d'un réordonnancement ou d'un déplacement.

## 7. Duplication (§9)
Bâtiment (→ étages → zones → pièces), étage (devient le niveau suivant : R+1 → R+2), zone (→ pièces), pièce. **Jamais** d'élément métier (murs, mesures, photos, annotations, quantités) ni de média ; le commentaire, le statut et les calculs d'une pièce ne sont pas recopiés (constats de terrain). Le journal trace `elements_copies: 0`, `medias_copies: 0`. Prouvé : pgTAP D1–D7, Vitest, Playwright.

## 8. Réordonnancement (§10)
Chantiers, bâtiments, étages, zones, pièces : « Monter / Descendre » (gros boutons, pas de glisser-déposer au pouce). Côté serveur : fratrie complète, atomique, identifiants inchangés ; une liste devenue obsolète (frère ajouté dans un autre onglet) est refusée (`40001`) plutôt que d'écrire des ordres ambigus. Étages : l'affichage reste trié par niveau (ordre physique).

## 9. Mobile (§11) et fil d'Ariane (§12)
- ≤ 900 px : **une colonne à la fois** (Bâtiments → Étages → Pièces) avec « ‹ retour », **barre d'action au pouce** collée en bas (« + Bâtiment / + Étage / + Pièce », 52 px), cibles ≥ 44–48 px, champs en 16 px (pas de zoom iOS), aucune table. Playwright à 390 × 844 : colonne unique, bouton ≥ 48 px dans la moitié basse, sans débordement horizontal.
- Fil d'Ariane partout : `Mes relevés › Projet › Chantier › Bâtiment A › R+1 › Zone Est › Bureau 12` (fonction pure `breadcrumbFor`, testée ; zone omise pour une pièce hors zone).

## 10. Autosave (§13) et concurrence (§14)
- Pas de bouton « Enregistrer » : `AutosaveController` (pur, testé) regroupe les frappes (700 ms), envoie à la sortie du champ, une écriture à la fois. États **Sauvegarde automatique / Enregistrement… / Enregistré / Échec + Réessayer / Conflit**.
- Chaque écriture porte la **révision lue** (`UPDATE … WHERE revision = n`, atomique). Deux onglets : le second reçoit « Modifié ailleurs entre-temps : rien n'a été écrasé » et choisit **Recharger la version à jour** ou **Garder ma saisie** (réapplication explicite sur la révision serveur). Prouvé par Playwright (deux onglets réels) et Vitest.
- Actions ponctuelles (renommer, déplacer, type de zone) : même contrôle de révision ; conflit → écran rechargé et message explicite.

## 11. Versioning (§15)
Fondation Lot 2 réutilisée : **INITIAL** proposée en premier (« Figer la version initiale », Playwright), puis **CORRIGÉE**, **PROJETÉE**, **TEL QUE CONSTRUIT** (alias `corrected`, `projected`, `as-built`). Les instantanés incluent automatiquement les champs Lot 3 (pgTAP V2). DECISION_REQUIRED D3 : pas de version initiale automatique à la création (elle figerait un relevé vide) : action explicite.

## 12. Suppression (§16)
Confirmation systématique annonçant l'impact (« Sont aussi retirés : 2 étage(s), 1 zone(s), 1 pièce(s). Rien n'est détruit… ») ; **suppression douce** en cascade maîtrisée (chantier → bâtiments → étages → zones / pièces / éléments) ; **corbeille du relevé** (nœuds racines restaurables, descendants restaurés avec eux) ; corbeille des relevés dans la liste. Aucune suppression physique n'est ouverte à l'application.

## 13. Permissions (§17) — prouvées en base (pgTAP P1–P28) et dans le navigateur

| Acteur | view | create | edit (autosave, dupliquer, réordonner, déplacer, retirer un nœud) | delete (relevé) |
|---|---|---|---|---|
| Propriétaire (métreur) | ✔ | ✔ | ✔ | ✔ (P28) |
| Manager d'organisation (admin Relevé) | ✔ tous (P1) | ✔ | ✔ tous (P2–P3) | ✔ (P4) |
| Membre métreur — relevé privé d'un autre | ✘ (P5, recherche P6) | ✔ le sien (P12) | ✘ (P7–P8) | ✘ |
| Membre métreur — relevé partagé | ✔ | — | ✔ (P9–P10) | ✘ (P11) |
| Membre consultation | ✔ partagé (P13) | ✘ (P17) | ✘ (P14–P16) | ✘ |
| Tools Pro sans add-on | ✘ (P18) | ✘ | ✘ (P19) | ✘ |
| Autre tenant | ✘ (P20, recherche P21) | ✘ dans A (P25) | ✘ (P22–P24, sans oracle d'existence) | ✘ |
| Anonyme | ✘ (P27) | ✘ | ✘ (RPC non exécutables, P26) | ✘ |

Navigateur : tenant B ne voit ni le relevé, ni la pièce (URL directe), ni les résultats de recherche (Playwright 5).
DECISION_REQUIRED D4 : retirer un **nœud** reste une modification (`edit`, règle du Lot 2) ; seule la corbeille du **relevé** exige `delete`. Choix conservateur car tout nœud retiré reste restaurable et audité.

## 14. Audit (§18), recherche (§19), filtres (§20)
- Journal : **création, renommage, déplacement** (avec origine / destination), **réordonnancement, suppression, restauration, duplication**, partage, version. Affiché dans la fiche relevé (« Activité »). pgTAP J1–J7, Playwright 2.
- Recherche : nom de relevé / référence / client, chantier (nom, référence, ville, client), bâtiment, étage, zone, pièce ; insensible à la casse et aux accents ; ≥ 2 caractères ; résultats cliquables vers le bon écran ; RLS appliquée (INVOKER).
- Filtres : **actif** (non archivé), **archivé** (statut `archive`), **récent** (modifié < 30 jours), **corbeille**.

## 15. Contrat GP (§21)
`gp-sync.ts` (toujours `contract-only`, aucune écriture GP) enrichi de façon additive : `chantier.reference`, `chantier.dateReleve`, `chantier.statut`, `floor[].typeNiveau`, `room[].statut` ; client du chantier prioritaire sur celui du projet. Description de chantier et commentaire de pièce restent internes à Tools (constats libres). Idempotence, conversions d'unités et « jamais de prix » inchangés (tests Lot 2 verts).

## 16. Tests (§22)

| Suite | Fichier | Tests | Couvre |
|---|---|---|---|
| pgTAP | `supabase/tests/elsatia_tools_releve_metre_lot3_structure_terrain.test.sql` | **70** | hiérarchie H1–H12, duplication D1–D7, ordre O1–O4, cascade C1–C5, versions V1–V4, audit J1–J7, recherche S1–S4, RLS / cross-tenant / anon P1–P28 |
| Vitest domaine | `terrain.test.ts` (19), `sql-parity.test.ts` (+8), `entitlement.test.ts` (+1) | +28 | domaine, formulaires (validation), navigation (fil d'Ariane), permissions, filtres, recherche |
| Vitest Tools | `autosave.test.ts` (5), `forms.test.ts` (5), `navigation.test.ts` (+3), `releve-adapter.test.ts` (+4) | +17 | autosave (saving/saved/error/retry/conflit), formulaires (cm/m, confirmation), navigation, adaptateur |
| Playwright | `tests/e2e/tools-releve-lot3.spec.ts` | **6** | création projet, chantier, bâtiment, étage, zone, pièce, édition, rechargement, persistance, duplication, ordre, suppression / restauration, version initiale, deux onglets, recherche, filtres, autre tenant, smartphone |

### 16.1 Commandes rejouables

```text
scripts/local-postgres-bootstrap/rebuild_db.sh lot3_fresh                 → 345 migrations OK
cd supabase/tests && pg_prove -d <db> elsatia_tools_releve_metre_*.test.sql → 244/244
cd supabase/tests && pg_prove -d <db> *.test.sql                          → 138 fichiers, 3 439 tests, 9 KO connus
npx vitest run ; (apps/tools) npx vitest run                              → 1 988/1 988 ; 2 023/2 023
npx tsc --noEmit ; (apps/tools) npm run typecheck ; npx eslint ; (apps/tools) npm run lint
(apps/tools) NEXT_PUBLIC_TOOLS_ENV=local npm run build ; npm run build:native ; (racine) npx next build
node scripts/verify-migrations.mjs                                         → 345 valides
scripts/local-postgres-bootstrap/releve_e2e_stack.sh + (apps/tools) next dev --webpack -p 3020
  + npx playwright test tests/e2e/tools-releve-lot2.spec.ts tests/e2e/tools-releve-lot3.spec.ts --project=desktop-chromium → 10/10
```

### 16.2 Upgrade avec données
Base 344 + relevé Lot 2 (chantier, bâtiment, étage, zone `logement`, pièce `sejour` supprimée) → 701 : chantier `en_cours`, étage `type_niveau` NULL (déduit par le domaine), pièce `a_relever`, pièce restaurable après upgrade (journal : création, suppression, restauration) ; `pg_dump -s` identique à l'install fraîche 345.

### 16.3 Échecs pgTAP préexistants (identiques avant / après)
`platform_stripe_state_attestation_r72` (stub `pgsodium`, 14/30), 7 fichiers `studio_*` (fixture), `elsatia_tools_cloud_sync_entitlement_closure_v1` (GRANT `service_role` du banc). Mêmes fichiers et compteurs sur la base 344 ; aucun ne touche un objet Relevé.

## 17. Non-régression (§23)
- Aucun fichier hors périmètre Relevé modifié (31 fichiers, tous `releve*`, `packages/releve-domain`, migration / tests Lot 3).
- Tools : 178 fichiers Vitest / 2 023 tests verts, dont Atelier, arches, rosaces, dessin libre, photo calibrée, exports PDF / DXF / SVG / PNG / impression, accès Free / Pro (`access`, `billing`) ; builds web et natif OK.
- Gestion Pro : Vitest racine 1 988 verts, build OK. pgTAP : aucune régression.
- Relevé Lot 2 : pgTAP 174/174, Playwright Lot 2 4/4 sur la nouvelle interface.

## 18. Limites

| Sujet | État |
|---|---|
| Qualification | locale uniquement : ni Preview, ni production, ni appareils physiques (émulation 390 px / 820 px) |
| Hors ligne | modèle prêt (UUID client, révisions, conflits, suppression douce) ; IndexedDB et file de synchro non livrés |
| Surface / volume | colonnes serveur prêtes, calcul à partir des murs aux lots suivants |
| Synchro GP | contrat enrichi, aucune écriture GP |
| Réordonnancement | boutons Monter / Descendre (pas de glisser-déposer) |
| Runbook preview | voir D2 |

## 19. DECISION_REQUIRED (choix conservateurs pris)

| # | Sujet | Choix |
|---|---|---|
| D1 | Branche | branche de session `claude/tender-gauss-inpj33`, base = Lot 2 qualifié sur V3 |
| D2 | Attendus du train preview (`verify:train-expectations` signale une dérive) | **non modifiés** : dérive préexistante depuis le Lot 2 (344), cette branche n'est pas le train ; à la jonction : `npm run sync:train-expectations` (345 / `20260927000701`) |
| D3 | Version initiale automatique à la création | non : action explicite « Figer la version initiale » (un instantané vide n'a pas de valeur) |
| D4 | Retirer un nœud : `edit` ou `delete` ? | `edit` (règle Lot 2), nœuds toujours restaurables et audités ; `delete` reste exigé pour le relevé |
| D5 | « Zone technique » | valeur existante `local_technique` (libellé « Zone technique ») plutôt qu'un doublon |
| D6 | Déplacements autorisés | bâtiment entre chantiers du relevé, pièce entre zones du même étage ; changement d'étage refusé (éléments rattachés à l'étage) → dupliquer |
| D7 | Duplication du commentaire / statut de pièce | non recopiés (constats de terrain), comme photos et mesures |
| D8 | Tablette portrait (≤ 900 px) | navigation en profondeur comme le smartphone ; colonnes au-delà |

## 20. Matrice de conformité

| § | Exigence | Statut | Preuve |
|---|---|---|---|
| 0 | Base V3 la plus récente + Lot 2 `e122384e`, pas `main` | FAIT | §1 |
| 1 | Relevé Pro inclut Tools Pro, documenté, Stripe non activé | FAIT | contrat produit, Vitest |
| 2 | Parcours Mes relevés → … → Pièce, desktop / tablette / smartphone | FAIT | Playwright 1, 6 ; Lot 2 3–4 |
| 3 | Chantier : 9 champs + futur GP | FAIT | H1–H2, Playwright 1 |
| 4 | Bâtiment : création, renommage, ordre, duplication, suppression contrôlée | FAIT | D1, O1–O2, C1, Playwright 2 |
| 5 | Étage : sous-sol, RDC, R+n, combles, niveau / altitude | FAIT | H3–H4, Vitest |
| 6 | Zone intermédiaire facultative (aile, secteur, appartement, plateau, lot, technique) | FAIT | H5, Playwright 1 |
| 7 | Fiche pièce (nom, type, hauteur, commentaire, statut, surface / volume futurs) | FAIT | H6–H8, Playwright 1 |
| 8 | Identifiants stables, UUID client | FAIT | D1, Vitest |
| 9 | Duplication sans photos / mesures | FAIT | D2–D7 |
| 10 | Réordonnancement sans casser les références | FAIT | O1–O4, Playwright 2 |
| 11 | Mobile terrain | FAIT | Playwright 6 |
| 12 | Fil d'Ariane | FAIT | Vitest, Playwright 1 |
| 13 | Autosave saving / saved / error / retry | FAIT | Vitest autosave, Playwright 1 |
| 14 | Concurrence deux onglets, pas d'écrasement silencieux | FAIT | Playwright 3, Vitest |
| 15 | Versions INITIAL + CORRECTED / PROJECTED / AS_BUILT | FAIT | V1–V4, Playwright 2 |
| 16 | Suppression : confirmation, soft-delete, cascade maîtrisée | FAIT | C1–C5, Playwright 2 |
| 17 | Permissions owner / manager / membre / autre tenant / anon × view / create / edit / delete | FAIT | P1–P28, Playwright 5 |
| 18 | Audit création / renommage / déplacement / suppression / restauration | FAIT | J1–J7 |
| 19 | Recherche chantier / bâtiment / pièce | FAIT | S1–S4, Playwright 4 |
| 20 | Filtres actif / archivé / récent | FAIT (+ corbeille) | Vitest, Playwright 4 |
| 21 | Compatibilité contrat GP, pas de sync | FAIT | §15 |
| 22 | pgTAP / Vitest / Playwright demandés | FAIT | §16 |
| 23 | Non-régression Atelier, arches, rosaces, dessin libre, photo calibrée, exports, Free, Pro | FAIT | §17 |
| 24 | Rapport + verdict | FAIT | ce document |
| — | Aucun déploiement, preview, production | RESPECTÉ | — |
