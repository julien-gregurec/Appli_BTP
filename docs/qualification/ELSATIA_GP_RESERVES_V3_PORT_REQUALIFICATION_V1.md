# ELSATIA — GP ↔ Réserves : portage sur le train canonique V3 et requalification (V1)

| | |
|---|---|
| Date | 2026-09-27 |
| Base | `integration/elsatia-canonical-train-v3` @ `ef7443c0` (340 migrations, dernière `20260926000505`) |
| Lot porté | `claude/inspiring-maxwell-rtr9zu` @ `c689dba4` (GP RESERVES INTEGRATION LOCALLY QUALIFIED, construit sur V2 `819ebe56`) |
| Branche | `claude/gracious-cori-npu846` = V3 + 4 commits portés |
| Migration | `20260927000402_reserves_gp_integration_completion_v1.sql` — **numéro conservé** (voir §3) — train à **341** migrations |
| Moteur | PostgreSQL 16.13 réel + pgTAP ; Chromium 1194 (Playwright 1.62.1) ; GP, Réserves et Colors compilés (`next build` + `next start`) |
| Pile Supabase | Passerelle locale `tests/e2e/colors-pile-locale/passerelle.mjs` au-dessus du vrai PostgreSQL (pas de Docker) |

## Verdict

**GP RESERVES V3 LOCALLY QUALIFIED**

Le lot GP ↔ Réserves est porté sur le train V3 sans réécriture : 4 commits rejoués sans
conflit textuel, aucune migration V3 modifiée, et toutes les portes sont vertes sur la base V3.
Nombres du V3 pur sur les mêmes suites : pgTAP V3 = V3 pur + exactement 1 fichier (106/106),
Vitest GP = V3 + 19, Réserves e2e 59/59, Colors e2e 73/73. L'upgrade V3 → V3+GP sur données
réalistes ne présente aucun écart, et le schéma obtenu est identique au fresh. Aucune
régression, aucun défaut de sécurité ouvert.

---

## 1. Base

- `git fetch --all --prune` fait. `integration/elsatia-canonical-train-v3` existe (`ef7443c0`,
  rapport `ELSATIA_CANONICAL_TRAIN_V3_FINAL_CONVERGENCE.md`).
- `claude/inspiring-maxwell-rtr9zu` = V2 final (`819ebe56`) + 6 commits. Le V2 est ancêtre
  commun des deux branches.
- La branche de travail est repartie **du V3** (`git checkout -B … origin/integration/elsatia-canonical-train-v3`),
  puis les commits nécessaires ont été rejoués un par un (pas de merge mécanique).

## 2. Diff réel : classement

| Commit du lot | Contenu | Classement | Traitement |
|---|---|---|---|
| `92db5376` fix(reserves) qualification locale V1 | migration `…000401_reserves_qualification_correctifs_v1`, pgTAP, PDF, passerelle, specs | **IDENTICAL** | déjà dans le V3 (`04cdce28`), migration renumérotée `20260926000503` par `c30190cd` (SQL inchangé). Diff ligne à ligne : seule différence = 7 lignes de `ELSATIA_PREVIEW_DB_VERIFY_V1.sql` → **SUPERSEDED** par les attendus générés du V3 |
| `bf22fe9e` docs Réserves 59/59, Colors 73/73 | rapport | **IDENTICAL** | déjà dans le V3 (`ec27d986`, diff vide) |
| `f679e029` feat(reserves-gp) synchronisation | migration `20260927000402` + pgTAP 106 assertions | **NEW** | cherry-pick propre → `ccff1f32` |
| `8c951193` feat(gp) bloc ELSATIA Réserves | `BlocReservesChantier.tsx`, `reserves-gp.ts` (+ test), fiche chantier GP, `multi-app-server.ts`, pages chantier/plans Réserves, `donnees.ts` | **NEW** | cherry-pick propre → `b2c28171` |
| `594c9dcd` test(e2e) recette cross-app ; action hors garde | route `/chantiers/[id]/reserves`, `layout.tsx`, `module-permissions.ts` : **NEW** ; `gp-reserves-integration.spec.ts`, `prepare-gp-reserves-integration.sql`, `gp-reserves-pile-locale/preparer-base.sh`, route de téléchargement de la passerelle : **TEST_ONLY** | NEW + TEST_ONLY | cherry-pick propre → `c438b981` |
| `c689dba4` docs qualification V1 | rapport V1, contrat §6 : **NEW** ; `ELSATIA_PREVIEW_DB_VERIFY_V1.sql` 337/`…000402` à la main : **SUPERSEDED** | NEW + SUPERSEDED | `372fcecd` : rapport et contrat repris ; DB verify **non** repris à la main, attendus régénérés par `npm run sync:train-expectations` (mécanisme V3) |

**CONFLICT : aucun.** Ni conflit textuel ni conflit sémantique. Points d'interaction avec les
nouveautés du V3 vérifiés un par un (§6, §9) :

- **Export RGPD V3** (`exporter_donnees_entreprise`, 505) : `reserves_contacts` porte
  `entreprise_id`, elle est donc découverte automatiquement. Export du tenant A : 4 contacts présents.
- **Purge RGPD V3** (`rapport_purge_entreprise` / driver de purge) : `reserves_contacts` est
  classée `DELETE` (6 lignes) et **entièrement supprimée** (0 après purge, tenant `purgée=t`).
- **Gardes Réserves R-01 à R-05 (503)** : inchangées, contrôle DB verify 16 → 7/7.
- **Attendus du train** (`verify:train-expectations`) : régénérés, `OK : attendus à jour`.
  Le générateur réécrit aussi les nombres balisés des documents V3 (convergence V3, pack
  Preview, runbook V3) : 341 / `20260927000402`.

## 3. Migration

| | |
|---|---|
| Dernière migration réelle du V3 | `20260926000505_rgpd_export_tables_enfants.sql` |
| Migration du lot | `20260927000402_reserves_gp_integration_completion_v1.sql` |
| Décision | **numéro conservé** : `20260927000402` > `20260926000505`, donc déjà postérieur à tout le V3 |
| Unicité | vérifiée sur **toutes** les branches distantes : aucun autre fichier `20260927000402` (en vol : `20260926000506`, `20260927000506/507`, `…000601–604`, `…000701`, `…000801`, `20260928000701`, sans collision) |
| Migrations V3 | **aucune modifiée** (`git diff origin/integration/elsatia-canonical-train-v3 -- supabase/migrations` = 1 fichier ajouté) |
| `npm run verify:migrations` | ✅ 341 migrations valides, noms et horodatages uniques |

Renuméroter aurait changé l'identifiant d'une migration déjà qualifiée et référencée (rapport
V1, contrat) sans gain d'ordre : la mission ne le demandait que « si nécessaire ».

## 4. Fonctionnalités préservées (fiche chantier GP)

Code porté tel quel (diff vide avec le lot sur ces fichiers) et reprouvé en navigateur (§8) :
bloc **ELSATIA Réserves** avec **Total / Ouvertes / En cours / Attente levée / Levées** (+ retard),
actions **« Utiliser dans ELSATIA Réserves »**, **« Ouvrir dans Réserves »** (URL issue du catalogue
`applications_elsatia`), **« Mettre à jour depuis Gestion Pro »**.

## 5. GP → Réserves, idempotence, plans, contacts, R-04

| Exigence | Preuve fresh (pgTAP / e2e) | Preuve sur base V3 upgradée (données réalistes) |
|---|---|---|
| Adresse, CP, ville, référence, client, dates | P 1.x, 3.01–3.02 ; E parcours | chantier repris : `12 rue des Tanneurs / 68000 / Colmar / CHA-REC-001 / client / 2026-08-28 → 2026-11-26` |
| Sous-traitants, contacts, plans | P 1.x ; E étape 1 (2 / 4 / 2) | 2 entreprises, 4 contacts, 2 plans |
| **10 synchronisations** | P 2.01–2.12 ; E étape 2 (10 clics) | 10 appels consécutifs : **1 chantier**, 2 entreprises (2 origines distinctes), 4 contacts (4 clés), 2 plans (2 documents) ; rapports 2 à 10 « inchangés » |
| Import historique 00268 | P 2.x | chantier créé **avant** l'upgrade par `reserves_importer_chantier_gp`, puis synchronisé après : `cree=false`, **même chantier** (`3558b6f5…`) |
| Plan modifié dans Réserves / plan portant une réserve | P 3.07–3.15 ; E étape 11 (version 1 conservée, signalée) | — |
| Version plus récente | P 3.08–3.11 (activée seulement après dépôt confirmé) | — |
| **Contact ≠ compte ni droit** | P 5.01–5.05 ; E étape 7 | après 10 synchronisations : `habilitations_applications_utilisateurs`, `entitlements_utilisateurs_elsatia`, `utilisateurs_entreprises`, `auth.users`, intervenants rattachés à une organisation : **tous inchangés** |
| Archivage GP | P 7.01–7.02 | chantier GP `archive` : état lisible (total 1), synchronisation possible |
| **Suppression GP (R-04)** | P 7.05–7.07 | chantier GP supprimé sous la session du gestionnaire : chantier Réserves **conservé et détaché** (`chantier_gp_id` null), réserve et 2 contacts intacts, plus d'état GP |

Constat sur la base upgradée : supprimer le chantier `a4…001` est refusé par GP lui-même (devis
accepté verrouillé — jeu RGPD V3), et `a4…002` par des pointages. Ce sont des règles GP propres ;
Réserves ne bloque rien. R-04 a été prouvé sur `a4…002` après retrait des pointages de test.

## 6. Upgrade V3 → V3 + GP (données réalistes)

Protocole : base fraîche V3 (340) → jeu réaliste du rapport V3 §8 (fixtures isolation + RGPD
facture émise + contrats acceptés, décor GP ↔ Réserves, recettes Réserves V3/V4/V6, seed pilote
GP, Colors `RECB0001 → COLU0001`, compléments V1→V2 et V2→V3 ; 49 utilisateurs) + import
historique GP 00268 → `upgrade_snapshot.py` → migration `…000402` → instantané → comparaison.

| Contrôle | Résultat |
|---|---|
| Application de `20260927000402` | ✅ 0 erreur, 0 warning |
| Row counts (248 tables public/platform/auth/storage) | ✅ **0 écart** ; 1 table nouvelle `reserves_contacts` (0 ligne) |
| Checksums métier (54 tables, dont les 9 tables Réserves) | ✅ **54/54 identiques** |
| RLS — policies | ✅ 599 inchangées ; +4 (`reserves_contacts_select/insert/update/delete`, `authenticated`) |
| RLS — sonde réelle (49 utilisateurs × 16 tables) | ✅ **0 écart** |
| Droits de table | ✅ 0 retiré ; `reserves_contacts` : `authenticated` CRUD sous RLS, **rien pour anon** |
| EXECUTE | ✅ 0 fonction existante modifiée ; 13 nouvelles : les 3 RPC (`synchroniser`, `confirmer_plan`, `etat`) pour `authenticated` seulement ; `poser_contact`, les 4 gardes et la cohérence : fermées à anon/authenticated |
| Schéma upgrade vs fresh V3+GP (`pg_dump -s`, public/platform/storage, 28 797 lignes) | ✅ **identique** (seuls diffèrent les jetons aléatoires `\restrict`) |
| `ELSATIA_PREVIEW_DB_VERIFY_V1.sql` fresh | ✅ 17 contrôles, aucun bloquant en échec |
| `ELSATIA_PREVIEW_DB_VERIFY_V1.sql` upgradée | ✅ comme V3 : seul le bucket `logos` public, issu de la fixture RGPD, est signalé (constat déjà présent au rapport V3) |
| Harnais RGPD V3 (`rgpd-end-to-end-v3.sh`, 6 exécutions) | ✅ **résultats identiques au rapport V3 §9** : `pg_restore` 0 erreur, rejeu = purge d'origine, factures et autres tenants inchangés ; S3 (tenant A, porteur des contacts GP) `complete` en politique activée |

Observation (non bloquante, conforme aux conventions du V3) : les 4 helpers purs
`reserves_gp_champ`, `reserves_gp_champ_conserve`, `reserves_gp_email` et `reserves_gp_texte`
(`sql immutable`, invoker, sans accès aux données) restent exécutables par défaut, comme
14 autres helpers immuables du V3.

## 7. Sécurité

| Profil | Preuves |
|---|---|
| Manager (gérant, admin Réserves) | P 6.03 ; E parcours complet |
| Chef de chantier (responsable Réserves, sans `gerer_chantiers` GP) | P 6.08–6.12 ; E test 4 (met à jour **son** chantier) |
| Salarié affecté (émetteur Réserves) | P 6.13–6.17 ; E test 2 (compteurs, aucun bouton) |
| Dirigeant GP **sans rôle Réserves** | P 6.04–6.05 ; E test 1 (aucun bloc) |
| Tenant B | P 8.01–8.12 ; E test 5 (fiche de A en 404, synchronisation refusée, aucune donnée de A) |
| Organisation **sans entitlement** Réserves | P 6.01–6.02 (état `NULL`, synchronisation refusée) |
| Invité externe (entreprise C) | P 6.19–6.22 (pas d'annuaire, sa fiche seulement) |

Toutes rejouées sur V3 : pgTAP 106/106, Playwright 5/5 (×2).

## 8. Parcours cross-app réel

`tests/e2e/gp-reserves-integration.spec.ts`, GP et Réserves compilés, base neuve à chaque passe :
**5/5, deux passes propres consécutives** (21,5 s ; 18,9 s).

GP (manager) → fiche chantier → « Utiliser dans ELSATIA Réserves » → 10 mises à jour sans
doublon → « Ouvrir dans Réserves » → création d'une **réserve** attribuée à une entreprise
reprise → GP `2/1/1/0/0` → **invitation** explicite de C, rattachement, **acceptation** et
**demande de levée** par C → GP `2/1/0/1/0` → **levée validée** → **résumé GP** `2/1/0/0/1` →
nouvelle version GP d'un plan utilisé : non appliquée, signalée des deux côtés.

Note de harnais : le spec est en mode série et suppose un chantier « non suivi ». Le rejouer sur
la même base échoue par construction (test 2 : bloc déjà suivi). Il faut repréparer la base
(`preparer-base.sh`) avant chaque passe, comme en V1.

## 9. Régressions

| Suite | V3 pur | V3 + GP | Écart |
|---|---|---|---|
| pgTAP maximal (une base neuve par fichier, `pgtap-run-v3.sh`) | 133 fichiers, 124 propres, 3 181 ok, 14 not ok | 134 fichiers, **125** propres, **3 287** ok, 14 not ok | **exactement** +1 fichier `reserves_gp_integration_completion_v1` 106/106 ; les 9 non-propres sont **identiques** (hérités : `platform_stripe_state_attestation_r72`, `elsatia_tools_cloud_sync_entitlement_closure_v1`, 7 × `studio_*`) |
| pgTAP Réserves (9 fichiers) | 594 | **700/700** | +106 |
| Vitest GP | 1 854 | **1 873** | +18 `reserves-gp.test.ts`, +1 `next-route-exports.test.ts` (nouvelle route contrôlée) |
| Vitest Réserves / Colors / Tools | — | ✅ 178 / 431 / 1 992 | inchangés vs rapport V1 |
| Playwright Réserves (V3, V4, V4 mobile, V5, V6 sécurité, V6 perf.) | 59/59 | ✅ **59/59** (1 + 11 + 6 + 13 + 23 + 5) | 0 ; V5 avec `--grep-invert "rechargement hors ligne"`, comme au rapport V3 |
| Playwright GP ↔ Réserves | — | ✅ 5/5 ×2 | nouveau |
| Playwright Colors (passerelle partagée **touchée** : +1 route GET de téléchargement sous RLS) | 73/73 | ✅ **73/73** (colors + colors-mobile) | 0 |

Note Colors : un premier passage à 65/73 venait d'un environnement de recette incomplet
(`COLORS_NUANCIER_FICHIER` et URLs Colors/compte absentes : « Aucun nuancier n'est chargé »).
Avec l'environnement documenté par `ELSATIA_COLORS_FULL_QUALIFICATION_V2.md` §8 : 73/73.
Aucun rapport avec le lot.

## 10. Portes complètes

| Porte | Résultat |
|---|---|
| Fresh `rebuild_db.sh` | ✅ **341/341**, 0 erreur (V3 pur : 340/340) |
| Upgrade V3 → V3+GP | ✅ §6 |
| `npm run typecheck` (GP, Tools, Réserves, Colors) | ✅ |
| `npm run lint` | ✅ 0 erreur (15 warnings préexistants, hors lot) |
| Build Gestion Pro (`next build`) | ✅ (route `ƒ /chantiers/[id]/reserves` présente) |
| Build Réserves | ✅ (avec `ELSATIA_APPLICATION_ENV=local`, garde de build préexistante) |
| Build Colors (recette) | ✅ |
| `verify:migrations` / `verify:train-expectations` | ✅ 341 / OK |

## 11. Écarts ouverts (non bloquants, hérités du V1)

G-02 (pas de bâtiment/zone dans GP), G-03 (sync à la demande), G-04 (nom de plan possédé par
Réserves), G-05 (anciennes versions de plan non purgées), G-06 (annuaire lisible par les rôles
« voir » de l'hôte), D-01 (hôte suspendu), H-01 (Storage S3 et GoTrue réels non couverts
localement). Détail : `ELSATIA_GP_RESERVES_INTEGRATION_COMPLETION_V1.md` §10. **Preview** :
appliquer `20260927000402` après le train V3 ; DB verify attend désormais 341 / `20260927000402`.

## 12. Reproduire

```bash
git checkout claude/gracious-cori-npu846 && npm ci
for a in tools colors reserves; do npm ci --prefix apps/$a; done; npm ci --prefix tests/e2e/colors-pile-locale
pg_ctlcluster 16 main start; apt-get install -y postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl

scripts/local-postgres-bootstrap/rebuild_db.sh gpv3                 # 341/341
scripts/qualification/pgtap-run-v3.sh gpv3                          # 125/134 propres (V3 : 124/133)
npm run typecheck && npm run lint && npm test
npm run verify:migrations && npm run verify:train-expectations

# Variables de recette (JWT HS256 signés par PASSERELLE_SECRET_JWT) : voir
# ELSATIA_GP_RESERVES_INTEGRATION_COMPLETION_V1.md §11 ; Colors : + COLORS_NUANCIER_FICHIER=
# $PWD/tests/e2e/fixtures/colors-nuancier-recette.json NEXT_PUBLIC_COLORS_URL NEXT_PUBLIC_ELSATIA_ACCOUNT_URL
tests/e2e/gp-reserves-pile-locale/preparer-base.sh gpres_e2e       # à refaire avant chaque passe
node tests/e2e/colors-pile-locale/passerelle.mjs &
npx next build && npx next start -p 3100 &
npm --prefix apps/reserves run build && npm --prefix apps/reserves run start &
E2E_BASE_URL=http://127.0.0.1:3100 E2E_RESERVES_URL=http://localhost:3020 \
  npx playwright test tests/e2e/gp-reserves-integration.spec.ts --project=desktop-chromium --workers=1

# Upgrade : base V3 (340) + jeu du rapport V3 §8 + import 00268, puis
python3 scripts/local-postgres-bootstrap/upgrade_snapshot.py upg avant.json
psql -d upg -f supabase/migrations/20260927000402_reserves_gp_integration_completion_v1.sql
python3 scripts/local-postgres-bootstrap/upgrade_snapshot.py upg apres.json --colonnes-de avant.json
scripts/qualification/rgpd-end-to-end-v3.sh upg
```
