# ELSATIA Tools — Relevé & Métré — Lot 3 — Structure terrain & relevé métier V1

**Date** : 2026-09-28
**Branche** : `claude/keen-keller-qs7t4e` (branche de session)
**Base** : Lot 2 Recovery V2 `e122384e` (`claude/friendly-cori-c3tw3n`) — arbre de travail identique à `e122384e` avant ce lot (voir §1)
**Hors périmètre** : photos, médias, capture (Lot 4, suspendu), plan / géométrie (lot 5), offline complet, synchronisation GP réelle, Stripe, Preview, production, merge.

---

## 0. Verdict

> **RELEVE METRE LOT 3 LOCALLY QUALIFIED**

Le workflow terrain **Mes relevés → Nouveau relevé → Chantier → Bâtiment → Étage → Zone → Pièce** est utilisable de bout en bout sur desktop, tablette et téléphone, avec enregistrement automatique, contrôle de concurrence, réordre, duplication, suppression contrôlée (corbeille), audit, recherche et version initiale réelle.

« Locally qualified » : prouvé sur PostgreSQL 16 avec les 345 vraies migrations et la vraie RLS, un vrai GoTrue, un vrai PostgREST et un vrai Chromium. **Pas** sur appareil physique, ni en WebKit iOS réel, ni en Preview, ni en production.

### Chiffres clés (exécutés dans cette session, sur l'état final)

| Contrôle | Résultat |
|---|---|
| Install fraîche | **345 / 345** migrations |
| Upgrade Lot 2 (344) → Lot 3 avec données (étages −1 / 0 / 2, zone, pièce) | OK ; catégories de niveau déduites (sous-sol, RDC, étage), données intactes ; **schéma identique** à l'install fraîche (`pg_dump -s`, 0 ligne de diff hors jeton `\restrict`) |
| `verify-migrations` | 345 valides, noms et horodatages uniques |
| pgTAP Lot 3 `elsatia_tools_releve_metre_structure_terrain_v1` | **57 / 57** |
| pgTAP Relevé (5 fichiers) + `r8/r9/r10` + manifeste RGPD | **316 / 316** (install fraîche) ; **307 / 307** sur base upgradée |
| pgTAP suite complète | 138 fichiers, 3 426 tests ; **mêmes 9 fichiers en échec que le V3 pur et le Lot 2** (banc : stub `pgsodium`, fixtures Studio, GRANT `service_role`) |
| Vitest `packages/releve-domain` | **130 / 130** (106 → 130) |
| Vitest racine | **1 984 / 1 984** (167 fichiers) |
| Vitest `apps/tools` (Atelier, arches, rosaces, dessin libre, photo calibrée, exports, Free / Pro compris) | **2 011 / 2 011** (177 fichiers) |
| `tsc` racine et Tools | 0 erreur |
| ESLint racine et Tools | 0 erreur ; aucun avertissement dans un fichier du lot |
| Build Tools web / natif (Capacitor) | OK — `/releves/piece` statique, `out/releves/piece` |
| Build Gestion Pro | OK |
| Playwright `tools-releve-lot3.spec.ts` | **8 / 8** (pile réelle) |
| Playwright `tools-releve-lot2.spec.ts` (non-régression) | **4 / 4** |

---

## 1. Base et correction de mission

- Aucun Lot 3 n'existait sur les branches distantes. Le Lot 4 avait été démarré directement sur le Lot 2 : il est **suspendu**. Son commit `3da5e893` est **conservé** dans l'historique, gelé par un revert (`266ececb`), et classé fichier par fichier dans [`ELSATIA_TOOLS_RELEVE_METRE_LOT4_WIP_CLASSIFICATION.md`](./ELSATIA_TOOLS_RELEVE_METRE_LOT4_WIP_CLASSIFICATION.md) (REUSABLE_AFTER_LOT3 / DEPENDENT_ON_LOT3 / DISCARD / DOCUMENTATION_ONLY).
- Après le revert, l'arbre est identique à `e122384e` (`git diff e122384e 266ececb` vide) : le Lot 3 est construit sur le Lot 2 seul. Aucun historique réécrit, aucun force-push.
- Aucune qualification Lot 4 dans ce rapport.

## 2. Décision produit

**Relevé Pro inclut Tools Pro : VALIDÉ** (catalogue `tools_offres_catalogue` et `TOOLS_OFFERS` du Lot 2, inchangés ; commentaire du domaine mis à jour). **Aucune activation commerciale** : Stripe, stores, SKU, `commercialement_active = false`, garde « pas d'achat de `releve-metre` » — tous inchangés.

## 3. Migration `20260928000701_tools_releve_metre_structure_terrain_v1.sql`

Plage neuve après le Lot 2 (604). Aucun numéro V3 / Lot 2 réutilisé. Le `…0605` du Lot 4 gelé devra être renuméroté après `…0701` à sa reprise. **Additive** : aucune colonne retirée, chaque ancienne valeur d'énumération admise (sur-ensemble testé), aucune donnée perdue.

| Sujet | Contenu |
|---|---|
| Chantier | `client_nom`, `client_gp_id` (lien GP préparé, même entreprise + permission `acces_clients`), `reference`, `description`, `date_releve`, `statut` (à planifier / en cours / terminé / archivé) |
| Étage | `categorie_niveau` (sous-sol, RDC, entresol, étage, combles, toiture, extérieur, autre) déduite pour l'existant ; `niveau` **facultatif et décimal** (`numeric(5,1)`) ; `altitude_mm` déjà présente (futur calage) |
| Zone | types aile, secteur, appartement, plateau, zone technique (+ anciens) ; `commentaire` |
| Pièce | types circulation, local technique, stockage (+ anciens) ; `commentaire`, `statut` (à relever / en cours / relevée / vérifiée), `surface_declaree_mm2` |
| Déplacements | pièce ↔ zone du même étage (clé composite) ; zone et pièce ne changent jamais d'étage (trigger) |
| Audit | actions `renommage`, `deplacement`, `reordre`, `duplication` ; écriture sans changement non journalisée |
| RPC (SECURITY INVOKER, donc RLS) | `tools_releve_reordonner`, `tools_releve_dupliquer`, `tools_releve_rechercher` ; helper SECURITY DEFINER borné `tools_releve_journaliser_duplication` |

## 4. Exigences

| § | Exigence | Réalisation | Preuve |
|---|---|---|---|
| 3 | Workflow Mes relevés → … → Pièce | écrans liste, nouveau, fiche, structure, **fiche pièce** (`/releves/piece`) | Playwright 1 |
| 5 | Chantier : nom, client, adresse, CP, ville, référence, description, date, statut ; futur GP | carte chantier éditable (autosave) ; premier chantier pré-rempli depuis le relevé ; `client_gp_id` + contrat GP enrichi | pgTAP H1–H2, Vitest, Playwright 1 |
| 6 | Bâtiment : création, renommage, ordre, suppression contrôlée, duplication | outils du nœud sélectionné | Playwright 2, Vitest, pgTAP O1–O2, U1–U3 |
| 7 | Étage libre (Sous-sol, RDC, R+1, R+2, Combles), non limité à un entier ; niveau/altitude futurs | catégorie + niveau facultatif décimal + altitude ; tri : niveau, sinon catégorie (combles en haut) | pgTAP H3–H4, M1–M3, Vitest, Playwright 1 |
| 8 | Zone facultative (aile, secteur, appartement, plateau, lot, zone technique) | pièces « hors zone » ; zone supprimée = pièces détachées, pas supprimées | pgTAP H5, C4 |
| 9 | Fiche pièce (nom, type, hauteur, commentaire, statut) + préparation surface, volume, revêtements, photos, mesures, équipements | `pieceFiche` : hauteur pièce sinon étage (provenance affichée), surface **déclarée**, volume = surface × hauteur, compteurs d'éléments rattachés (« à venir » sinon) — aucune valeur inventée | Vitest, Playwright 1 (61,25 m³) |
| 9 | Types minimum | bureau, chambre, séjour, cuisine, WC, SDB, circulation, local technique, stockage, extérieur, autre (proposés en premier) + anciens | pgTAP H6, parité |
| 10 | Navigation permanente Projet › Bâtiment › Étage › Zone › Pièce | fil d'Ariane collant ; desktop : 3 colonnes ; téléphone / tablette portrait : **une colonne à la fois** | Playwright 6–8 |
| 11 | Identifiants stables, UUID client | UUID générés côté client (inchangé Lot 2) ; RPC renvoient l'UUID créé ; offline complet non implémenté | — |
| 12 | Réordonner bâtiments, étages, zones, pièces sans casser les relations | RPC exigeant **tous** les frères (liste partielle / parents mélangés refusés) ; pièces réordonnées dans leur zone | pgTAP O1–O5, R2, R4 ; Vitest |
| 13 | Dupliquer bâtiment / étage / pièce sans recopier photos / mesures | structure seule ; statuts « à relever », surfaces et commentaires non recopiés ; étage copié au niveau suivant | pgTAP U1–U6 ; Vitest ; Playwright 2 |
| 14 | Autosave saving / saved / error / retry | `AutosaveController` (domaine, testé) + `useNodeAutosave` ; pas de bouton Enregistrer par champ | Vitest (4 cas) ; Playwright 1–3 |
| 15 | Pas d'écrasement silencieux (onglets / utilisateurs) | révision optimiste sur chaque modification ; conflit → « Modifié ailleurs — recharger » | Vitest ; Playwright 3 (serveur non écrasé) |
| 16 | Versioning : INITIAL réel ; CORRECTED / PROJECTED / AS_BUILT préparés | RPC Lot 2 ; `ensureInitialVersion` ; instantané incluant les champs Lot 3 | pgTAP V1–V3 ; Vitest ; Playwright 4 |
| 17 | Audit : création, renommage, déplacement / réordre, suppression, restauration | journal + historique affiché sur la fiche | pgTAP A1–A5, C2 ; Playwright 2 |
| 18 | Pas de suppression accidentelle | confirmation avec impact (étages / zones / pièces emportés), suppression douce, **corbeille** avec restauration | Vitest ; Playwright 2 ; pgTAP C1–C4 |
| 19 | RLS : owner, org manager, membre autorisé, autre organisation, authentifié non autorisé, anonyme, service_role | matrice testée ; aucun cross-tenant | pgTAP R1–R12 ; Playwright 5 |
| 20 | Recherche chantier / bâtiment / pièce ; filtres actif / archivé / récent | RPC sous RLS, jokers échappés ; UI « Mes relevés » | pgTAP S1–S5 ; Vitest ; Playwright 4–5 |
| 21 | Compatibilité contrat GP Lot 2 | 17 sections inchangées ; champs **additifs** (chantier : référence, client, date, statut ; étage : catégorie, niveau nullable ; pièce : statut, surface déclarée) ; aucune description ni commentaire transmis | Vitest `gp-sync` vert |
| 22 | Mobile réellement utilisable | cibles ≥ 44 px, champs 16 px, un niveau à la fois, actions principales sous le nœud | Playwright 6–8, captures relues |
| 24 | Non-régression | Tools 2 011 verts ; Lot 2 pgTAP + Playwright verts | §0 |
| 25 | Migrations : fresh, upgrade, comparaison | §0 | — |

## 5. Défauts trouvés et corrigés pendant la qualification

| Défaut | Découvert par | Correction |
|---|---|---|
| La duplication (SECURITY INVOKER) écrivait dans le journal, en lecture seule pour `authenticated` → 42501 pour tout utilisateur | pgTAP U1 | helper SECURITY DEFINER borné (droit `edit`, copie et source dans le même relevé, copie créée dans la transaction) |
| Réordre par un profil consultation : 0 ligne modifiée **sans erreur** (RLS) | pgTAP R4 | refus explicite `42501` si pas `edit` |
| « Recharger » après conflit ne rafraîchissait pas le formulaire | Playwright 3 | remontage du formulaire sur les valeurs serveur |
| Fil d'Ariane de la structure : le nom du projet n'ouvrait plus la fiche | Playwright **Lot 2** (non-régression) | le projet reste un lien vers la fiche |

## 6. Tests ajoutés

| Suite | Fichier | Tests |
|---|---|---|
| pgTAP | `supabase/tests/elsatia_tools_releve_metre_structure_terrain_v1.test.sql` | 57 (H, D, O, U, A, C, V, S, R, M) |
| Vitest domaine | `structure-terrain.test.ts` (chantier, étages libres, fiche pièce, déplacement, ordre, duplication, corbeille, recherche, journal, versions, droits, autosave) ; `sql-parity.test.ts` (+4) ; `validation.test.ts` (niveau décimal) | +24 |
| Vitest Tools | `releve-lot3-adapter.test.ts` (révision optimiste, RPC, mapping ancien / nouveau, libellés complets, navigation fiche pièce) | +5 |
| Playwright | `tests/e2e/tools-releve-lot3.spec.ts` | 8 |

Formulaires : la validation (`validateNodePatch`, brouillons) et la machine d'autosave sont testées en Vitest ; les composants React eux-mêmes le sont par Playwright (pas d'environnement DOM dans le Vitest de Tools).

## 7. Mobile

Émulation Chromium (viewport, `isMobile`, tactile, user-agent) : iPhone-like 390×844, Android-like 412×915, tablette 820×1180 — une colonne à la fois, fil d'Ariane toujours visible après défilement, remontée par le fil, aucun débordement horizontal, cibles ≥ 44 px. **Pas** d'essai sur appareil physique ni WebKit iOS réel.

## 8. Limites

| Sujet | État |
|---|---|
| Offline complet (dépôt IndexedDB de la structure, synchro) | non implémenté (hors demande) ; UUID client et révisions prêts |
| Glisser-déposer | non : réordre par ↑ / ↓ (RPC accepte déjà une liste complète) |
| Surface calculée | lot 5 (plan) ; seule la surface déclarée existe, étiquetée comme telle |
| Recherche « bâtiment » | ouvre la structure au premier niveau (le résultat ne porte pas le chantier) |
| Déplacer un étage vers un autre bâtiment | autorisé en base, pas encore d'écran |
| Suppression définitive | non exposée (corbeille seulement) ; purge RGPD d'entreprise inchangée |
| Qualification | locale ; ni Preview, ni production, ni appareil physique |

## 9. DECISION_REQUIRED (choix conservateurs)

| # | Sujet | Choix |
|---|---|---|
| D1 | Numérotation | 701 pour le Lot 3 ; le 605 du Lot 4 gelé sera renuméroté après |
| D2 | Contrat GP | champs ajoutés sans description ni commentaires libres (minimisation) |
| D3 | Duplication | structure seule, statuts remis à « à relever », surfaces / commentaires non recopiés |
| D4 | Runbook preview | si intégration à un train : `(345, '20260928000701')` (Lot 4 exclu) |

## 10. Suite

Verdict **LOCALLY QUALIFIED** : la reprise du Lot 4 est autorisée — réapplication de `3da5e893` sur ce Lot 3, migration renumérotée, requalification dans un **rapport Lot 4 séparé**.
