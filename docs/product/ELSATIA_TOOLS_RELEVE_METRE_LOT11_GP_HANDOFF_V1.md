# ELSATIA Tools / Gestion Pro — Relevé & Métré — Lot 11 — Tools → GP Costing Handoff V1

**Date** : 2026-10-01
**Branche** : `claude/beautiful-tesla-grj0pu` (branche de session imposée)
**Base plateforme** : train canonique V8 `53b4bc7` (*CANONICAL TRAIN V8 LOCALLY QUALIFIED*).
**Base produit** : Lot 10 `claude/blissful-thompson-ipjcxl` (contrat `elsatia.tools.estimation` 1.0.0), **porté** sur V8 (§1).
**Nature** : rapport autonome. Tout ce qui est affirmé ici a été exécuté dans cette session. Aucune PR, aucun merge, aucune Preview, aucune production.

---

## 0. Verdict

> **RELEVE METRE LOT 11 LOCALLY QUALIFIED**

Le travail produit dans Tools (relevé → métré → quantitatif → estimation simplifiée HT) est **réellement transmis** à Gestion Pro. Gestion Pro le reçoit comme un **import** : un snapshot immuable, versionné et tracé. Gestion Pro reste seul propriétaire du prix de vente, de la marge, de la remise, de la TVA, du devis et de sa version commerciale.

| Exigence | Résultat |
|---|---|
| Tools : « Envoyer vers Gestion Pro » | résumé avant envoi, confirmation explicite, envoi réel (RPC), résultat, historique des envois |
| GP : « Imports Tools / Relevé » | liste par source ; détail avec source, date, version, chantier, nombre d'ouvrages, montant estimatif Tools |
| Contrat | `elsatia.tools.estimation` 1.x accepté (mineures comprises), 2.x refusé ; `elsatia.tools.quantitatif` 1.0.0 imbriqué **inchangé** |
| Idempotence | même contenu → même import (empreinte **serveur**), jamais de doublon, réimport tracé |
| Nouvelle version | version n + 1 ; devis déjà travaillé **jamais modifié** ; « nouvelle version disponible » + comparaison |
| Snapshot | contrat reçu conservé à l'identique, immuable même pour le propriétaire des tables |
| Mapping | ouvrage Tools → prestation GP ; sans correspondance : ligne « non liée », aucune donnée perdue |
| Sécurité | même organisation, droits Tools, droits GP, chantier / client du tenant, cross-tenant refusé |
| Audit | qui, quand, source, version, import, réimport, devis, correspondances |
| Performance | 5 000 lignes : import serveur **2,1 s**, réimport 2,2 s, écran GP 3,1 s, comparaison 2,9 s |

### Chiffres clés (exécutés sur HEAD)

| Contrôle | Résultat |
|---|---|
| Install fraîche (V8 + Lot 10 + Lot 11) | **373 / 373** migrations |
| pgTAP Lot 11 `elsatia_tools_releve_metre_lot11_gp_handoff.test.sql` | **76 / 76** |
| pgTAP Relevé Lots 2 → 11 (14 fichiers) | **810 / 810** (Lots 2 → 10 : 734, aucun test adapté) |
| pgTAP suite complète (base neuve) | 165 fichiers, 8 216 tests : les 9 fichiers « limites du banc » connus (Studio ×7, pgsodium, cloud-sync) + 1 test Réserves **à ordre indéterminé** préexistant (§15) ; incident 131/131 et V8 32/32 **réparés** par ce lot (§1) |
| Vitest domaine `packages/releve-domain` | **387 / 387** (+1 ignoré : parité étendue opt-in), dont **9** `gp-handoff` (Lot 11) |
| Vitest racine (GP + domaine) | **2 642 / 2 642** (+37 ignorés) |
| Vitest `apps/tools` | **2 160 / 2 160** (+6 `plan-lot11`) |
| `tsc --noEmit` racine et `apps/tools` | 0 erreur |
| ESLint `apps/tools`, `src`, `packages`, recette | 0 erreur (4 avertissements `<img>` antérieurs, hors lot) |
| `verify:migrations`, `verify:train-expectations` | OK (attendus synchronisés : 373 / `20260930001501`) |
| **Playwright Tools → GP** `tools-releve-lot11-gp.spec.ts` | **11 / 11** (voir §13) |
| Playwright non-régression Relevé Lots 2 → 10 + Atelier | voir §14 |

## 1. Base : Lot 10 porté sur V8 (sans fusion aveugle)

- `git merge-base` Lot 10 / V8 = `a622540` (Lot 9) : V8 contient déjà les Lots 2 → 9. Le Lot 10 = **5 commits** au-dessus.
- Branche de session repositionnée sur `53b4bc7`, puis `cherry-pick` des 5 commits du Lot 10 : **sans conflit**. Migration `20260930001401` postérieure à la dernière V8 (`20260928000812`) : ordre monotone conservé.
- **Défaut de port détecté et réparé** : le Lot 10 (qualifié hors train) crée 3 tables sans rappeler `incident_installer_gardes()`. Sur V8 + Lot 10, pgTAP `incident_safe_mode_v1` test 23 et `v8_convergence_incident_gardes_v1` test 1 échouent (**have 3, want 0** : tables écrivables en mode lecture seule). La migration du Lot 11 rappelle `incident_installer_gardes()` : **131 / 131** et **32 / 32**, plus un test dédié (S6).
- Attendus du train synchronisés (`npm run sync:train-expectations`) : 373 migrations, dernière `20260930001501`.

| Commit | Objet |
|---|---|
| `443151a`…`2dea8f0` | Lot 10 porté (5 commits, contenu identique) |
| `aed3b66` | migration `20260930001501` (additive) + pgTAP Lot 11 |
| `2707606` | Tools : « Envoyer vers Gestion Pro », domaine `gp-handoff`, Vitest |
| `6daeb64` | GP : « Imports Tools / Relevé », unité m³, Vitest GP |
| `3f8f905` | recette Playwright Tools → GP ; performances (import linéaire, RLS une fois par requête, détail GP sans snapshot) |
| `8a57f62` | attendus du train |
| *(ce rapport)* | rapport + test de non-régression GP |

## 2. Architecture

```
Tools (navigateur)                              Base partagée (même organisation)                 Gestion Pro (serveur Next)
──────────────────                              ─────────────────────────────────                 ──────────────────────────
Estimation (Lot 10)                             RPC gp_tools_importer_estimation                  /devis/imports-tools
 buildEstimationGpPayload  ──contrat 1.x──▶      1. droits GP puis Tools                            liste par source (relevé × état)
 « Envoyer vers Gestion Pro »                     2. contrat (nom, 1.x, HT, aucune donnée           /devis/imports-tools/[id]
  résumé → confirmer                                 commerciale, références)                       détail, lignes, terrain, audit
                                                  3. estimation RECALCULÉE (moteur Lot 10)          comparaison de versions
                                                     et comparée ligne à ligne                      correspondances → prestations
                                                  4. empreinte serveur → idempotence               « Créer un devis brouillon »
                                                  5. snapshot + lignes + journal                     (gp_tools_import_creer_devis)
```

- **Une seule écriture côté Tools** : la RPC d'import. Aucune table GP écrite directement, aucun devis demandé.
- **Le serveur fait foi** : le contrat est construit dans le navigateur (photos, annotations, revêtements, pièces), mais ses lignes, quantités, montants retenus, plans et total sont **recomparés** à l'estimation recalculée par le moteur SQL du Lot 10. Tout écart → `PT409 SOURCE_OBSOLETE`. Un montant forgé, une ligne omise ou un ouvrage supprimé entre-temps ne passent pas (pgTAP O1–O4, Playwright).
- **Dossier lu par le serveur** : client et chantier viennent de `tools_releves.chantier_gp_id` / `client_gp_id` (liens GP déjà gardés par le Lot 2 : même entreprise, permissions GP). Le client est déduit du chantier GP s'il n'est pas lié. Jamais depuis le contrat.

### Modèle (migration `20260930001501`, additive)

| Table | Rôle |
|---|---|
| `gp_tools_imports` | un import = **import id**, **source id** (`source_releve_id` + `source_etat`), **source version** (1, 2, 3…), empreinte serveur SHA-256, clé d'idempotence Tools, contrat (nom, version), dossier (relevé, chantier, client, transmission), vérification serveur, compteurs, montant estimatif HT, statut, devis tiré, pointeurs version précédente / suivante, **snapshot** (contrat reçu à l'identique) |
| `gp_tools_imports_lignes` | lignes normalisées : ouvrage (réf., clé, code, désignation, lot, catégorie), nature, état projeté, **unité GP** (m², m³…), quantité, PU et montant estimatifs, correction, emplacement chantier › bâtiment › étage › zone › pièce, correspondance, ligne et ouvrage du contrat (`donnees`) |
| `gp_tools_correspondances_ouvrages` | ouvrage Tools (clé `code\|unité`, comme `ouvrageCle()`) → prestation du catalogue GP |
| `gp_tools_imports_journal` | audit append-only |

Contraintes : `unique(entreprise, relevé, état, version)` et **`unique(entreprise, relevé, état, empreinte)`** ; pas de clé étrangère vers le relevé (l'historique GP survit à un relevé supprimé) ; tables en lecture seule pour `authenticated`, écriture par RPC uniquement ; garde incident `gestion_pro` installée.

## 3. Données transmises (§3 de la mission)

| Donnée | Où |
|---|---|
| client, chantier | `dossier` (serveur) + colonnes `client_id`, `chantier_id`, `client_nom`, `chantier_nom` |
| bâtiment, étage, zone, pièce | `lignes.emplacement` (texte) + `donnees.ligne.emplacement` (références) ; `snapshot.pieces` |
| plan / version | `snapshot.source.plans` (plan, numéro, état, gel) ; `verification.plans` |
| ouvrages, lots, unités | `snapshot.quantitatif.ouvrages` ; colonnes `designation`, `lot`, `categorie`, `unite` |
| quantités, états | colonnes `quantite`, `etat_projet` (existant / dépose / neuf / déplacement) ; `snapshot.etatsProjetes` |
| revêtements | `snapshot.revetements` (métré Lot 8) |
| ouvertures | quantités d'ouvrages calculées sur les ouvertures (Lot 9) ; géométrie dans les versions Tools |
| prix estimatifs Tools | colonnes `prix_unitaire_estimatif`, `montant_estimatif`, `montant_calcule`, `corrige` ; `snapshot.prix` (composantes) |
| photos (références), annotations, anomalies | `snapshot.photos` (chemins de stockage, aucun octet), `snapshot.annotations`, `snapshot.anomalies` |
| métadonnées | contrat, moteurs, clé d'idempotence, auteur et date de transmission, empreinte serveur |

## 4. Gestion Pro propriétaire du chiffrage (§4)

- Tools ne crée **jamais** de devis : la seule création de devis est `gp_tools_import_creer_devis`, appelée **par un utilisateur GP** (permission `gerer_devis`) depuis l'écran d'import.
- Le devis créé est un **brouillon sans numéro** (le numéro GP n'est attribué qu'à l'émission, règle GP inchangée).
- Une ligne de devis par ouvrage × état projeté × nature :
  - ligne **liée** : désignation, type, unité, **prix de vente** et **TVA** de la prestation GP ; quantité Tools ;
  - ligne **non liée** : désignation Tools, base estimative HT Tools comme point de départ, TVA par défaut GP (20 %) ; description « base estimative HT Tools … € · import Tools vN ».
- Totaux HT / TVA / TTC calculés par les déclencheurs GP existants (`20260928000812`). Exemple réel (Playwright) : 21 m² × 14,75 + 21 m² × **72,00 (prix GP)** + 350 = **2 171,75 € HT**.
- Un seul devis par import (`23505 DEVIS_EXISTANT`).

## 5. Import explicite côté GP (§5)

Écran `/devis/imports-tools` (lien « Imports Tools / Relevé » sur la liste des devis et sur Ouvrages & métrés) :

- **source** « Tools · Relevé & Métré · état », **date** de réception, **version** (+ version de contrat), **chantier**, client, **nombre d'ouvrages**, lignes (liées), **montant estimatif Tools HT**, statut : « À chiffrer », « Devis brouillon créé », « Devis créé · nouvelle version disponible », « Remplacé par une version plus récente » ;
- détail : dépose / neuf / déplacement / existant, heures, pièces jointes, lignes (300 premières, toutes conservées), correspondances (100 ouvrages par page), terrain (anomalies, annotations, photos), traçabilité (empreinte, total serveur, journal).

## 6. Idempotence (§6)

- **Empreinte serveur** = SHA-256 des plans (plan#numéro) et des lignes (référence | quantité | montant retenu) recalculées par le serveur. Indépendante de la clé client : un contrat identique avec une autre `idempotencyKey`, ou en version de contrat 1.3.0, reste « déjà importé » (pgTAP D3, K3 ; Playwright).
- Verrou consultatif par source : trois envois **concurrents** du même contenu → un seul import (Playwright « double envoi »).
- Réponse « déjà transmis (version n) : contenu identique, aucun doublon créé », réimport tracé (`reimport_identique`).

## 7. Mise à jour : nouvelle version (§7)

- Contenu différent → version n + 1, liée à la précédente (`precedent_import_id` / `nouvelle_version_id`).
- **Aucun devis n'est touché** : Playwright compare les lignes et totaux du devis travaillé avant / après le réimport (égalité stricte, y compris `updated_at`) ; pgTAP Q8 (prix de vente modifié à la main dans GP conservé).
- L'import précédent affiche « Nouvelle version disponible : vN » et « Comparer et ouvrir » ; créer un devis depuis une version périmée est refusé (`PT409 VERSION_PERIMEE`).
- Comparaison `gp_tools_import_comparer(a, b)` : écart total, compteurs ajoutées / supprimées / modifiées / identiques, écart par lot, détail des 500 premiers écarts.

## 8. Snapshot (§8)

- `snapshot` = contrat reçu **à l'identique** (pgTAP I4 : égalité jsonb).
- Garde : seuls le statut, le devis tiré, le pointeur de version suivante, le compteur de lignes liées et les remises à NULL des clés étrangères évoluent. Toute autre modification → `42501`, **même pour le propriétaire des tables** (pgTAP T11). Lignes : seule la correspondance évolue. Journal : append-only.
- Si Tools change ensuite (prix, ouvrage supprimé, relevé supprimé), l'historique GP reste lisible : versions, snapshots, comparaison.

## 9. Mapping ouvrage Tools → bibliothèque GP (§9)

- Cible : **catalogue de prestations GP** (`prestations_catalogue`), seule bibliothèque GP utilisée par l'éditeur de devis.
- Clé : `ouvrageCle()` du domaine (code, ou nom, en minuscules | unité), stable entre relevés de l'entreprise.
- Correspondance enregistrée à l'écran, puis appliquée à l'import ; « Réappliquer les correspondances » après une évolution du catalogue.
- **Prestation supprimée ou désactivée** : la base retire le lien (`ON DELETE SET NULL`) ; la ligne redevient « non liée » à la réapplication, désignation, quantité et base estimative intactes (pgTAP M5–M7).
- Prestation d'un autre tenant : refusée (M2).

## 10. Sécurité (§10)

| Contrôle | Mise en œuvre | Preuve |
|---|---|---|
| même organisation | relevé lu **côté serveur**, entreprise = celle du relevé ; client / chantier / prestation vérifiés dans cette entreprise | pgTAP T9, M2 |
| droits Tools | `tools_releve_peut(relevé, 'sync-gp')` : rôle métreur / administrateur Relevé, capability `releve-metre` | pgTAP T1, T2 |
| droits GP | membre **réel** (pas une session support), Gestion Pro commercialement ouvert, permission `gerer_ouvrages` (envoi), `acces_devis` (lecture), `gerer_devis` (devis, correspondances) | pgTAP T10, T13 ; Playwright « GP fermé » |
| chantier accessible | lien chantier / client gardé par le Lot 2 (même entreprise + permissions GP) | Lot 2 + I3 |
| cross-tenant | relevé d'un autre tenant indiscernable d'un relevé inexistant ; imports, lignes, journal invisibles ; comparaison / devis / historique refusés | pgTAP T4–T8 ; Playwright « Sécurité » |
| anonyme | aucune RPC | S4, T12 |
| écriture directe | tables en lecture seule ; journal append-only | S2 ; Playwright |

RLS de lecture : `entreprise_id = any ((select gp_tools_entreprises_lisibles())::uuid[])` — mêmes règles (`est_membre_actif` + `acces_devis`), **évaluées une fois par requête** (InitPlan) au lieu d'une fois par ligne (§12).

## 11. Audit (§11)

`gp_tools_imports_journal` (append-only) : `import`, `nouvelle_version`, `reimport_identique`, `devis_cree`, `correspondance`, `correspondances_appliquees` — avec **auteur**, **date**, **source** (relevé, état), **version**, **import**, version de contrat, compteurs, devis. En plus : `journal_activite` GP (`import_tools` import / réimport ; `devis` création). L'écran d'import affiche la traçabilité.

## 12. Performance (§13)

Pile réelle, `next dev` (Tools et GP), mesures Playwright (`RELEVE_E2E_PERF_OUT`) :

| Lignes (ouvrages) | Préparation du contrat | Envoi (écran) | dont serveur | Réimport identique | Nouvelle version | Liste GP | Détail GP | Comparaison | Devis brouillon |
|---|---|---|---|---|---|---|---|---|---|
| 100 (20) | 0,12 s | 0,20 s | 0,11 s | 0,31 s | 0,34 s | 0,87 s | 1,67 s | 1,73 s | 1,51 s |
| 1 000 (200) | 0,18 s | 0,56 s | 0,42 s | 0,53 s | 0,79 s | 0,93 s | 2,60 s | 2,75 s | 2,26 s |
| 5 000 (1 000) | 0,27 s | 2,70 s | 2,10 s | 2,22 s | 2,77 s | 0,90 s | 3,07 s | 2,91 s | 6,47 s |

Corrections faites pendant la recette (mesures avant → après, 5 000 lignes) :

1. lignes serveur : `EXISTS` sur le tableau d'ouvrages (quadratique, évalué 3 fois) → jointure par hachage évaluée une fois : **import 10,0 s → 2,1 s** ;
2. RLS par ligne (`est_membre_actif` + `a_permission` × 5 000) → helper évalué une fois par requête : comptage des lignes 5,3 s → quelques ms ;
3. détail GP : le snapshot entier (9,3 Mo) n'est plus lu, seules ses sections affichées ; correspondances paginées : **détail 25,9 s → 3,1 s**, comparaison 17,5 s → 2,9 s.

Le contrat de 5 000 lignes pèse ≈ 9 Mo. Mesures `next dev`, à remesurer en build de production / Preview.

## 13. Gestion des erreurs (§14) — Playwright `tools-releve-lot11-gp.spec.ts`

| Cas | Comportement prouvé |
|---|---|
| **GP inaccessible (réseau)** | requête coupée avant le serveur : « Gestion Pro est injoignable … vous pouvez renvoyer sans risque », rien d'écrit, bouton « Renvoyer » → import |
| **GP fermé** (abonnement GP suspendu pendant que l'écran est ouvert) | refus serveur « Gestion Pro n'est pas accessible pour cette entreprise » ; rechargé, le bouton est désactivé |
| **contrat invalide** | nom inconnu, données commerciales (`tauxTva`, `prixVente`…), ligne en double, état ou relevé incohérent : `22023`, rien d'écrit |
| **version inconnue** | `2.0.0` refusée (« Gestion Pro accepte elsatia.tools.estimation 1.x ») ; `1.4.0` acceptée |
| **ouvrage supprimé** | côté Tools après chargement : `PT409`, « L'estimation a changé… », « Recharger l'estimation » puis envoi OK ; côté GP (prestation supprimée) : ligne non liée, données conservées |
| **double import** | « déjà transmis », 3 envois concurrents → 1 import |
| **import interrompu** | réponse perdue après écriture serveur → renvoi = « déjà transmis (version n) », aucun doublon ; panne au milieu de l'écriture des lignes (pgTAP X1–X4) → rien d'écrit (ni import, ni ligne, ni journal), reprise en version n sans trou |

## 14. Tests (§15) et non-régression (§16)

| Suite | Fichier | Tests |
|---|---|---|
| pgTAP | `elsatia_tools_releve_metre_lot11_gp_handoff.test.sql` | **76** : S1–S8 schéma / droits / gardes, I1–I8 import, D1–D5 idempotence, K1–K9 contrat, O1–O4 serveur fait foi, N1–N3 versions, Q1–Q10 devis, M1–M7 correspondances, X1–X4 import interrompu, A1–A4 audit, T1–T14 sécurité / cross-tenant / GP fermé |
| Vitest domaine | `packages/releve-domain/src/gp-handoff.test.ts` | 9 : parité contrat ↔ SQL (nom, 1.x, clés commerciales, référence de ligne), Tools sans devis, résumé, résultat, messages, erreurs, historique |
| Vitest Tools | `apps/tools/src/lib/releve/plan/plan-lot11.test.ts` | 6 : RPC unique, idempotence, erreurs typées, réseau / interruption, réponse illisible, historique |
| Vitest GP | `src/lib/imports-tools.test.ts` | 8 : statuts, source, regroupement, comparaison, correspondances, erreurs, route et permissions, unité m³ et liens |
| Playwright Tools → GP | `tests/e2e/tools-releve-lot11-gp.spec.ts` | 11 : envoi, double envoi, écran GP, correspondance + devis, nouvelle version, erreurs, sécurité, non-régression GP, performance ×3 |

Non-régression :

- pgTAP Relevé Lots 2 → 10 : 734 / 734, inchangés.
- Playwright Relevé Lots 2 → 10 + Atelier : voir le tableau des commandes (§16).
- Devis GP : Vitest racine (dont devis) 2 642 / 2 642 ; pgTAP devis de la suite complète ; Playwright : liste des devis, nouveau devis, éditeur du devis importé, chantiers et fiche chantier.
- Contrat `elsatia.tools.quantitatif` 1.0.0 : inchangé (validateur et tests du Lot 9 intacts, imbriqué tel quel).

## 15. pgTAP — suite complète et DB verify

Base neuve `lot11c` (373 migrations), `pg_prove *.test.sql` : **165 fichiers, 8 216 tests**.

| Fichier en échec | Cause | Lien avec le Lot 11 |
|---|---|---|
| Studio ×7, `platform_stripe_state_attestation_r72`, `elsatia_tools_cloud_sync_entitlement_closure_v1` | limites du banc (Studio dédié, pgsodium réel), identiques sur V8 pur | aucun |
| `reserves_v3_parcours_bout_en_bout` test 31 | les 4 lignes d'historique d'une réserve sont créées dans **une seule transaction** : même `created_at` (affiché à la microseconde près), donc `order by created_at` est **indéterminé**. Selon la disposition physique de la base, l'ordre sort juste (V8 pur, base V8 + Lots 10-11 appliqués après coup) ou non (bases neuves V8 + Lots 10-11). Test et fonction `reserves_export_historique` à départager (tri secondaire) — **tâche séparée**, hors périmètre | aucun (tables Réserves non touchées) |

Comparaison : V8 pur, même banc, même heure : 163 fichiers, mêmes 9 fichiers « banc » (+ `reserves_v3…` vert). Avant ce lot, la base V8 + Lot 10 échouait en plus sur `incident_safe_mode_v1` et `v8_convergence_incident_gardes_v1` (§1) : **réparés**.

`ELSATIA_PREVIEW_DB_VERIFY_V1.sql` sur la base neuve : **35 / 37**, mêmes 2 contrôles d'environnement Preview que V8 pur (`url_preview` des applications, propriétaire plateforme revendiqué), sans lien avec les migrations.

## 16. Commandes rejouables

```text
scripts/local-postgres-bootstrap/rebuild_db.sh lot11c                              → 373 migrations OK
cd supabase/tests && pg_prove -d lot11c elsatia_tools_releve_metre_*.test.sql      → 810/810 (734 + 76)
cd supabase/tests && pg_prove -d lot11c *.test.sql                                 → seuls les 9 fichiers « banc » connus
npx vitest run ; (apps/tools) npx vitest run ; npx tsc --noEmit ; (apps/tools) npx tsc --noEmit ; (apps/tools) npm run lint
npm run verify:migrations ; npm run verify:train-expectations
scripts/local-postgres-bootstrap/releve_e2e_stack.sh releve_e2e
psql -d releve_e2e -f scripts/local-postgres-bootstrap/releve_lot11_gp_seed.sql   (permissions GP des comptes, GP ouvert, entreprise active)
(apps/tools) next dev --webpack -p 3020 ; (racine) next dev -p 3100   (même NEXT_PUBLIC_SUPABASE_URL)
RELEVE_E2E_GP_URL=http://localhost:3100 RELEVE_E2E_SERVICE_ROLE_KEY=<clé locale> … npx playwright test tests/e2e/tools-releve-lot11-gp.spec.ts --project=desktop-chromium
npx playwright test tests/e2e/tools-releve-lot{2..10}.spec.ts tests/e2e/tools-atelier-lot5-nonregression.spec.ts --project=desktop-chromium
```

## 17. DECISION_REQUIRED (choix conservateurs retenus)

| # | Sujet | Choix |
|---|---|---|
| D1 | Base | V8 + Lot 10 **cherry-pické** (5 commits, sans conflit) plutôt qu'une fusion des lignées ; défaut de garde incident du Lot 10 réparé par la migration du Lot 11 |
| D2 | Qui construit le contrat | le navigateur (contrat Lot 10 inchangé : photos, annotations, revêtements), mais **le serveur recalcule et compare** ; refus au moindre écart |
| D3 | Source / version | source = relevé × état documenté ; version = compteur GP par source ; idempotence sur l'**empreinte serveur** (et non sur la clé client) |
| D4 | Version de relevé Tools | pas de version Tools créée à l'envoi (les versions Tools ont un sens métier : initial / corrigé / projeté / as-built) ; `tools_releves_exports_gp` (contrat v1 du Lot 2, `version_id` obligatoire) n'est pas alimenté ; l'état des envois est lisible depuis Tools par `gp_tools_imports_releve` |
| D5 | Bibliothèque GP | `prestations_catalogue` (bibliothèque de l'éditeur de devis), correspondance par clé d'ouvrage Tools ; pas de création automatique de prestation |
| D6 | Devis | création **explicite** par GP, brouillon sans numéro, une fois par import, interdite depuis une version périmée ; agrégation par ouvrage × état × nature ; ligne non liée au PU estimatif Tools (point de départ, à chiffrer), TVA par défaut GP |
| D7 | Nouvelle version | jamais d'écrasement ; l'import précédent sans devis passe « remplacé », celui avec devis reste « devis créé » + bannière |
| D8 | Droits GP | `gerer_ouvrages` pour envoyer (prédicat `sync-gp` existant), `acces_devis` pour lire, `gerer_devis` pour chiffrer / correspondre ; sessions support exclues de l'import et de la lecture |
| D9 | Entrée de menu | lien « Imports Tools / Relevé » sur Devis et Ouvrages, route `/devis/imports-tools` (droits `/devis`). Pas d'entrée de barre latérale : `acces_devis` est une permission socle, et le contrat de navigation socle (`acces-socle-essai.test.ts`) est conservé |
| D10 | Unité m³ | ajoutée aux unités GP (`UNITES`), additive |

## 18. Limites réelles

| Sujet | État |
|---|---|
| Appareils physiques, Safari / WebKit | non testés (Chromium desktop) |
| Builds de production | performances mesurées en `next dev` ; à remesurer en build / Preview |
| Jeu pilote de recette | `seed_entreprise_pilote_btp.sql` crée l'entreprise « il y a 2 mois » : son essai GP est déjà échu (B-4 V8). La recette rouvre l'essai via `releve_lot11_gp_seed.sql` (et rejoue elle-même le cas « GP fermé ») |
| Devis 5 000 lignes | création 6,5 s (≈ 1 000 lignes de devis, déclencheurs GP par ligne : tâches, verrou) |
| Photos | transmises par référence (chemins), GP ne les affiche pas encore en vignettes |
