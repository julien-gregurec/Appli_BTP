BASE_SHA=24a0c2e993ec0836b492ea72f27ed7dc347a20fa
GP_BUSINESS_SHA=d617f7e
PERFORMANCE_SHA=a9b46f01
PLATFORM_SHA=2cd5ca6e
FINAL_SHA=88ba6bfe5caf31fa5aa4368d1b51b9c2b419f898 (tête qualifiée ; le commit suivant ne modifie que cette ligne du rapport)
MIGRATION_COUNT=408

FRESH_INSTALL=ALL_MIGRATIONS_APPLIED (408/408 ; catalogue = V9.1 + union exacte des 3 lots : 10 967 objets, 0 chevauchement, 0 conflit, 0 écart)
UPGRADE_V9_1=OK — 4 bases (fraîche, métier, historique, volumétrique 176 k devis) : 17/17 migrations, ZERO_PERTE, catalogue upgradé = fresh (ACL_DIFF=0, RLS_DIFF=0)
UPGRADE_PROD_210=UPGRADE QUALIFIÉ sans --bridge — ZERO_PERTE, ACL_DIFF=0, RLS_DIFF=0, OFFRES_INTACTES 24/24, INTERRUPTIONS=9/9, ponts PS1–PS4
ZERO_DATA_LOSS=OUI (V9.1 → V9.2 : 283 tables comparées ligne à ligne ×4 bases ; 210 → V9.2 : 153 tables / 56 188 lignes, P0 = 0)
PGTAP=172/181 suites propres, 9 161 ok — les 9 non propres sont exactement celles déjà non propres sur V9.1 (environnement : Studio dédié ×7, pgsodium réel, Tools cloud sync)
VITEST=GP 2 950 ✓ (1 échec attendu SEC-6, identique V9.1) · Tools 2 174 ✓ · Réserves 239 ✓ · Colors 436 ✓ · Studio non requis (aucun package partagé importé par Studio touché)
PLAYWRIGHT=GP métier 13/13 (matrice 6 rôles) · satellites/cross-app 16/16 (local 10, Preview simulée 4, Production simulée 2)
PERFORMANCE=OK — push 10 000 × 4 workers 0 perte / 0 doublon ; relances 10 000 factures 0 famine ; RLS 1k/20k/50k/100k (lecture croisée 1–6 ms) ; multi-tenant 3 000 requêtes 0 fuite ; endurance PostgREST 15 min 422 371 requêtes 0 erreur 0 fuite ; migration RLS 1503 : 0 deadlock, échecs propres et rejouables sous lecture lente
BUSINESS=17 défauts V9.1 corrigés + 3 nouveaux (N1 rentabilité avec avoir, N2 situations avec remise globale, N3 course du pointage oublié) conservés ; sondes PostgREST 42/42 ; endurance concurrente 0 écart ; B10/B22/B23 = DECISION_REQUIRED_PRODUCT
SATELLITES=fixture pilote 23/23, GP actif, Drone bientot fermé, publishable key Réserves, URLs environment-aware, Réserves → GP, Réserves :3040, url_preview propriétaire + AAL2, Tools env strict (3 builds + 2 refus) — pgTAP 45/45, Playwright 16/16
PRODUCTION_HARNESS=PRODUCTION_UPGRADE_HARNESS_LOCALLY_QUALIFIED sur V9.2 (sans --bridge) ; preflight 39/39 ; plan qualifié publié `scripts/upgrade/manifests/target-3fa52210.json`

# ELSATIA — TRAIN CANONIQUE V9.2 — convergence sémantique V1

## Verdict

# `ELSATIA_CANONICAL_TRAIN_V9_2_LOCALLY_QUALIFIED`

Les trois lots convergent en un train unique de **408 migrations** : 391 de V9.1 inchangées à l'octet, 17 ajouts
tracés (4 renumérotés, corps identiques). La composition est **prouvée** : catalogue V9.2 = V9.1 + union exacte des trois
deltas, 0 conflit. Toutes les exigences techniques locales des phases 1 à 14 sont vertes : fresh, 4 upgrades V9.1, Production 210
sans `--bridge`, pgTAP, PostgREST, Playwright, performance, pack Preview générique. Quatre défauts de convergence ont été trouvés et corrigés (CONV-1 à
CONV-4).

Pourquoi `LOCALLY_QUALIFIED` et non `PARTIALLY_QUALIFIED` : les points ouverts sont **tous** des décisions
(`DECISION_REQUIRED_PRODUCT` B10/B22/B23, `DECISION_REQUIRED_PRODUCTION`) que la mission interdit de trancher. Le code reste
fail-closed (bêta inchangée, preflight bloquant). Ils bloquent les gates **COMMERCIAL** et **PRODUCTION**, pas le gate
**LOCAL**. Restent NOT_PROVEN comme dans les lots : Supabase CLI réel (Docker absent), WebKit, PostgreSQL 17.

Qualification **locale uniquement**. Aucune Preview réelle, aucune Production, aucun Stripe (Test ou Live), aucun secret
réel (secrets de banc générés aléatoirement, jamais versionnés), aucun merge `main`, aucune modification des 391
migrations V9.1 (vérifiées à l'octet), aucune règle métier inventée.

| | |
|---|---|
| Base | `integration/elsatia-canonical-train-v9.1` @ `24a0c2e9` (391 migrations), **non modifiée** |
| Lot A — GP BUSINESS HARDENING | `integration/elsatia-gp-business-hardening-v9-1` @ `d617f7e` (`GP_BUSINESS_HARDENING_V9_1_PARTIAL`), +8 migrations `…1401-1408` |
| Lot B — PERFORMANCE HARDENING | `integration/elsatia-performance-hardening-v9-1` @ `a9b46f01` (`…LOCALLY_QUALIFIED`), +4 migrations |
| Lot C — PLATFORM READINESS | `integration/elsatia-platform-readiness-v9-1` @ `04c7a658` (rapport) — arbre de migrations qualifié `2cd5ca6e`, +5 migrations |
| Train | `integration/elsatia-canonical-train-v9.2` — **408 migrations**, dernière `20261003001504` |
| Pack opérateur Preview | importé de `claude/zen-clarke-qchnnt` @ `0c8d2f77`, **rendu générique** (phase 14) |
| Environnement | PostgreSQL 16 local (Docker absent : pas de `supabase start`), pgTAP, PostgREST 12.2.3 officiel, passerelle auth/Storage locale du dépôt, apps compilées (`next build` + `next start`), Chromium 1194 |

## 1. Phase 1 — inventaire croisé

Matrice complète générée depuis git : [`canonical-train-v9-2/INVENTAIRE_CROISE.md`](canonical-train-v9-2/INVENTAIRE_CROISE.md)
(LOT · FILE · OBJECT · BASE · CONFLICT · DUPLICATE · DEPENDENCY · ACTION, 290 lignes, `scripts/qualification/v9-2/inventaire_croise.py`).

| Lot | Commits | Fichiers | Migrations | Fonctions SQL | Policies | Triggers | Index | Tests / outillage / runbooks |
|---|---:|---:|---:|---|---|---|---|---|
| GP | 13 | 62 | 8 | 12 (facturation, paiement, pointage oublié, totaux, rentabilité, `pointages_couts_appliques`) | 0 | 1 (`facture_emise_non_annulable`) | 0 | pgTAP témoin 43, 3 suites réalignées, Vitest, Playwright 13, sondes PostgREST, endurance, upgrade |
| PERF | 13 | 63 | 4 | 15 (file push ×6, relances ×2, ensembles RLS ×7) | **65 réécrites** (13 tables) | 0 | 3 | pgTAP ×3, contrats rouge/vert, bancs push/relances/RLS/PostgREST, rollbacks testés |
| PLATFORM | 17 | 165 | 5 | 3 | 0 | 0 | 0 | pgTAP satellites 45, Playwright 16, harnais Production complet, preflight, runbook rollback V9.x, fixture pilote |

Chevauchements identifiés :

| Chevauchement | Nature | Résolution |
|---|---|---|
| Versions `20261003000101`, `20261003000201` (PERF ↔ PLATFORM) | **collision** (même version, objets différents) | 4 migrations PERF renumérotées `…1501-1504` (§2) |
| `config/env-manifest.json` (GP ↔ PLATFORM) | sections distinctes | fusion git sans conflit, vérifiée (`verify:env-manifest` OK) |
| Pack Preview, runbook V3, DB verify (GP ↔ PLATFORM) | attendus **générés** du train (396 vs 399) | régénérés pour 408 par `sync:train-expectations` |
| `lignes_devis` / `lignes_factures` altérées par GP `…1408` (CHECK NOT VALID) et par le pont `…0201` (`add column if not exists`) | tables communes, objets différents | compatibles ; prouvé : fresh, 4 upgrades V9.1, Production 210, PS1–PS4 |
| Fonctions SQL définies par plusieurs lots | **aucune** (DUPLICATE vide) | — |
| Dépendances SQL inter-lots | **aucune** (DEPENDENCY vide) ; le lot perf réécrit des policies sans toucher aux fonctions GP | équivalence RLS 54/54 rejouée **après** GP |

Défauts de convergence trouvés (absents de chaque lot pris seul, ou préexistants dans un lot et révélés par le train) :

| ID | Défaut | Origine | Correctif |
|---|---|---|---|
| CONV-1 | `verify:env-manifest` KO : `CHARGE_DELAI_MAX_MS` (banc PostgREST perf) non déclarée | lot PERF | déclarée (outillage local e2e, non secrète) |
| CONV-2 | `test:seeds` KO : 10 scripts SQL perf non classés au registre (déjà rouge sur le lot perf seul) | lot PERF | classés `CI_ONLY`, `session_replication_role` déclaré pour la variante rapide |
| CONV-3 | `ponts-scenarios.sh` PS2 rouge : l'empreinte comptait le **nouveau** trigger GP `facture_emise_non_annulable` comme une réécriture | interaction GP ↔ PLATFORM (outillage) | PS2 : données identiques + triggers préexistants identiques, ajouts listés ; règle des ponts inchangée |
| CONV-4 | scripts de retour arrière perf nommés d'après des versions qui désignent désormais des migrations plateforme | renumérotation | renommés `rollback_2026100300150x.sql`, table de correspondance `scripts/perf/hardening/rollback/README.md` |

## 2. Phase 2 — migrations

`scripts/qualification/v9-2/integrite-train.sh` → [`integrite-train.txt`](canonical-train-v9-2/integrite-train.txt) : **INTEGRITE_TRAIN=OK**.

- 391 migrations V9.1 présentes et **identiques à l'octet** ; 17 ajouts tous **postérieurs** à `20261002001302` (aucune insertion avant une migration publiée), versions uniques, ordre strict.
- Chaque ajout est tracé vers son lot et identique à l'octet au fichier qualifié du lot.
- `verify:migrations` 408 valides ; `test:migration-targets` 7/7 ; Preview à jour de V9.1 → 17 en attente, toutes > ledger : **`db push` sans `--include-all`** (prouvé par le pack générique, §14).

| Rang | Version V9.2 | Origine | Renumérotation |
|---:|---|---|---|
| 392 | `20261003000101_applications_bientot_non_utilisables_v1` | PLATFORM (A-05) | — |
| 393 | `20261003000102_plateforme_url_preview_proprietaire_v1` | PLATFORM (A-11) | — |
| 394 | `20261003000103_reserves_url_locale_port_distinct_v1` | PLATFORM (A-10) | — |
| 395 | `20261003000201_pont_upgrade_prod_phase0_lignes_entreprise_v1` | PLATFORM (pont phase 0, marqueur `-- elsatia:upgrade-phase0`) | — |
| 396 | `20261003000202_pont_upgrade_prod_controle_lignes_v1` | PLATFORM (contrôle final) | — |
| 397-404 | `20261003001401` … `1408` | GP (B16/B19/N2, B17, B24, B12/B35/N3, B37, B25/N1, B28, B05/B07/B31) | — |
| 405 | `20261003001501_push_file_durable_v1` | PERF P1-A | ex-`20261003000101` |
| 406 | `20261003001502_relances_auto_candidats_eligibles_v1` | PERF P1-B | ex-`20261003000201` |
| 407 | `20261003001503_rls_ensembles_entreprises_autorisees_v1` | PERF P1-C | ex-`20261003000301` |
| 408 | `20261003001504_taches_chantier_created_idx_v1` | PERF index | ex-`20261003000401` |

Preuve d'équivalence des renumérotées ([`renumerotation-preuve.txt`](canonical-train-v9-2/renumerotation-preuve.txt)) — sha256 du fichier et du corps fonctionnel (commentaires et lignes vides retirés), avant = après :

| Source → cible | sha256 fichier | sha256 corps | Équivalent |
|---|---|---|---|
| `…000101` → `…001501` | `5a16f7c1…` = `5a16f7c1…` | identique | OUI |
| `…000201` → `…001502` | `5b3d8f74…` = `5b3d8f74…` | identique | OUI |
| `…000301` → `…001503` | `9dbadb2f…` = `9dbadb2f…` | identique | OUI |
| `…000401` → `…001504` | `afaa07a4…` = `afaa07a4…` | identique | OUI |

## 3. Phase 3 — ordre de convergence

Ordre réel retenu (dépendances vérifiées, aucune inter-lot) :

1. **Ponts Production** `…0201` (phase 0) / `…0202` (contrôle) — versions inchangées (référencées à l'octet par le plan qualifié et le preflight P6). Le pont de phase 0 est appliqué **en premier** sur une base historique par le harnais / preflight, quel que soit son rang lexical ; sur fresh / Preview / V9.1 c'est un no-op.
2. **Sécurité / intégrité GP** `…1401-1408`.
3. **Performance / RLS** `…1501-1504` : après GP (priorité demandée) ; la RLS ensembliste s'applique aux policies V9.1 que GP ne modifie pas (garde « expression V9.1 attendue » de la migration verte).
4. **Satellites** `…0101-0103` : versions conservées (aucune dépendance avec GP / perf ; les renuméroter n'apportait rien et invalidait les preuves du lot).
5. UI, 6. tests / outillage : code applicatif sans conflit.

Écart assumé à l'ordre « indicatif » : les satellites (4) précèdent lexicalement GP (2) — aucune dépendance, aucun objet commun (prouvé par la composition du catalogue, §9). Le contrôle final `…0202` n'est plus la dernière version lexicale : il vérifie `entreprise_id` des lignes **avant** la RLS ensembliste qui s'appuie dessus — ordre plus sûr.

## 4. Phase 4 — GP business

Intégré tel que qualifié par le lot (aucune règle nouvelle) et **re-prouvé sur le train V9.2** :

| Contrôle | Résultat V9.2 |
|---|---|
| Témoin pgTAP `gp_business_hardening_v9_1` (43 assertions, rouge sur V9.1) | **43/43** |
| Suites réalignées B24/B25 (`gp_rentabilite_agregats_v1` 60, `gp_facture_brouillon_modification_v1` 34, `gp_dashboard_search_perf_dashboard_indicateurs` 13) | vertes |
| Sondes PostgREST réelles C/D/I (financier, confidentialité salariés, ACL) | **42/42** ([jsonl](canonical-train-v9-2/postgrest-sondes-v92.jsonl)) |
| Endurance concurrente (12 cycles) : 36 facturations → 12, 24 paiements jumeaux → 12, 24 pointages oubliés jumeaux → 12 (**N3**), plafond 24 h | **9 invariants, 0 écart** ([json](canonical-train-v9-2/endurance-gp-concurrente.json)) |
| N1 rentabilité avec avoir, N2 situations avec remise globale | pgTAP #16-19 verts |
| Coût horaire (`pointages.cout_horaire_applique`) | **fermé** : `authenticated` sans privilège de colonne ; lecture par `pointages_couts_appliques` (membre actif + `voir_cout_interne_employe` / `acces_rentabilite`) ; chef/salarié 42501 (sondes D01-D14), Playwright S12 aucun coût affiché |
| Interaction avec la RLS ensembliste du lot perf (mêmes tables `pointages`, `factures`, `devis`) | témoin GP 43/43 et équivalence RLS 54/54 sur la même base V9.2 |

**DECISION_REQUIRED_PRODUCT — non résolus, aucune règle inventée** : B10, B22, B23 (§DECISIONS).

## 5. Phase 5 / 13 — performance

Base : V9.1 + `generate_fixture.sql` + tenants volumétriques **1k (k=11), 20k (k=13), 50k (k=14), 100k (k=15)** (176 312 devis,
174 200 factures, 172 260 notifications ; 1,2 Go), **upgradée en V9.2** par le script d'upgrade (§10). Mesures : conteneur
4 vCPU partagé, PostgreSQL 16, PostgREST 12.2.3 `db-pool = 10` ; preuves [`canonical-train-v9-2/perf/`](canonical-train-v9-2/perf/).

| Banc | Exigence | Résultat V9.2 |
|---|---|---|
| **Push** `charge_file_push.sh … 10000 4 apres` | 10 000 notif., 4 workers, 0 perte, 0 doublon | **0 perdue, 0 traitée deux fois**, 100/100 poisons abandonnés après 5 tentatives, 10 400 traitements, 6,4 s (1 629 notif./s) ([json](canonical-train-v9-2/push_charge_10k_4w.json)) |
| **Relances** cron réel (`traiterRelancesAutomatiques`, PostgREST, JWT service_role) | 10 000 documents, 0 famine | 10 000 factures / 5 tenants : **2 000/2 000 dues atteintes** en 2 passages, 0 doublon, 0 dépassement du maximum ([json](canonical-train-v9-2/relances_charge_10k.json)) |
| **RLS** `bench_explain.sh` 1k / 20k / 50k / 100k | — | lecture propre 1 000 lignes 6–9 ms ; liste RLS seule 7–31 ms ; page au milieu 6–60 ms ; comptages 6–29 ms ; **lecture croisée vide 1–6 ms, 0 ligne, constante** ; seule exception connue : `taches` own_count ≈ 0,35 s (pas d'`entreprise_id`, limite du lot) ([csv](canonical-train-v9-2/perf/rls_explain_v92.csv)) |
| **Multi-tenant** PostgREST | ≥ 3 000 requêtes, 0 fuite | **3 000 requêtes** entrelacées 4 tenants (1k → 100k), 10 clients : 0 erreur, **0 fuite**, 0 lecture croisée non vide, p50 14 ms / p95 74 ms / max 318 ms ([json](canonical-train-v9-2/perf/pgrst_multitenant_3000.json)) |
| **Endurance** PostgREST | ≥ 15 min | **15 min**, 10 clients, 4 tenants : **422 371 requêtes**, 469 req/s, 0 erreur, **0 fuite**, 0 lecture croisée non vide, p50 13 ms / p95 69 ms / max 410 ms, stables minute par minute ([json](canonical-train-v9-2/perf/pgrst_endurance_15min.json)) |
| Upgrade volumétrique | — | 17 migrations, chacune < 0,7 s (`…1503` 105 ms, `…1504` 182 ms, `…0202` 617 ms) |

**Migration RLS `…1503` sous trafic** (`scripts/qualification/v9-2/rls-verrous-sous-trafic.sh`, base V9.1 volumétrique amenée
juste avant `…1503`, 13 verrous ACCESS EXCLUSIVE pris d'un coup, `lock_timeout` 10 s) — [résultats](canonical-train-v9-2/perf/rls_1503_verrous_sous_trafic.txt) :

| Scénario | 1503 | Durée | Policies après | Rejeu après la fin du trafic | Deadlocks | Clients |
|---|---|---:|---|---|---:|---|
| T0 trafic absent | ✅ | 86 ms | V9.2 | — | 0 | — |
| T1 trafic léger (8 clients, lectures filtrées par entreprise) | ✅ | 301 ms | V9.2 | — | 0 | 34 208 transactions, 0 erreur |
| T1B trafic lourd V9.1 (listes / comptages non filtrés, ce que 1503 corrige) | ❌ propre (`lock timeout`) | 10,2 s | **V9.1 intactes** | ✅ 77 ms | 0 | 0 erreur |
| T2 lecture lente (transaction de lecture + `pg_sleep(30)`) | ❌ propre (`lock timeout`) | 10,0 s | **V9.1 intactes** | ✅ 88 ms | 0 | — |
| T3 lecture lente + trafic léger | ❌ propre (`lock timeout`) | 10,2 s | **V9.1 intactes** | ✅ 101 ms | 0 | 2 551 transactions, 0 erreur |

Conclusion : jamais d'interblocage ni d'attente infinie ; tout échec est **propre** (transaction annulée, policies V9.1 à
l'identique) et **rejouable**. Sous lectures longues (précisément celles que la RLS V9.1 rend lentes), l'application
demande une fenêtre creuse ou un trafic fermé → `DECISION_REQUIRED_PRODUCTION` / runbook (`RLS_1503_FENETRE`).
Premier passage du banc : trafic léger mal nommé (pgbench sans script : aucun trafic réel) — détecté, corrigé, garde
`BANC_INVALIDE` ajoutée ; le passage archivé est le second.

## 6. Phase 6 — satellites

| Correctif | Preuve V9.2 |
|---|---|
| Fixture pilote (Karim : GP + Colors + Tools + Réserves, jamais Drone ; Belaid sans habilitation) | assertions **23/23** (préparation de la base de recette), Playwright local |
| GP actif (indépendant de la date) | assertions `gp_etat_commercial = active` |
| Drone `bientot` fermé (catalogue oui, application non) | pgTAP `satellites_preview_readiness_v1` **45/45** ; Playwright « Drone (A-05) » |
| Publishable key Réserves (+ repli transitoire alias) | Vitest Réserves 239/239 ; build Réserves ✅ |
| URLs environment-aware (LOCAL / PREVIEW / PRODUCTION, inconnu → aucun lien) | Playwright 3 modes ; « aucun `*.elsatia.fr` en Preview » |
| Réserves → GP ; Réserves en local sur **3040** | Playwright « GP → Réserves → GP » ; Réserves servie sur 3040 ; migration `…0103` (upgrade : seule ligne modifiée, attendue) |
| `url_preview` propriétaire + AAL2 | pgTAP A-11 ; Playwright (refus `http`, `javascript:`, hôte hors liste ; délégué sans formulaire) |
| Tools env strict | builds Tools local ✅ / preview ✅ / production ✅ ; refus ✅ `staging`, ✅ Preview → `app.elsatia.fr` |

Recette navigateur `tests/e2e/satellites-preview-readiness.spec.ts` (`scripts/qualification/v9-2/recette-satellites.sh`, 4 apps compilées) : **LOCAL 10/10, PREVIEW simulée 4/4, PRODUCTION simulée 2/2**. Premier passage : 1 échec en Preview simulée dû à **mon banc** (base recréée entre les modes, alors que la recette définit l'`url_preview` de Colors en mode local) — corrigé (une base pour les trois modes, comme le lot), rejoué vert.

## 7. Phase 7 — ponts Production (harnais sans `--bridge`)

Production 210 synthétique (`5777abb`, profil ACL Supabase, palier 500, remédiation UPG-P1-1 **simulée sur la copie locale**) → V9.2 (408), [`prod-210-v500/journal.log`](canonical-train-v9-2/prod-210-v500/journal.log) :

| Exigence | Résultat |
|---|---|
| Classification | 210 appliquées ; 198 en attente (13 hors ordre → `--include-all` **Production uniquement**) ; phase 0 = `20261003000201` |
| Application | 198 migrations ; ledger **408** = fichiers de la cible |
| **ZERO_PERTE** | ✅ 153 tables / 56 188 lignes, P0 = 0 ; 7 tables différentes, toutes déclarées (`expected-changes.json`) |
| **ACL_DIFF=0** | ✅ fermeture upgradé = fresh (15 familles, 12 549 lignes) |
| **RLS_DIFF=0** | ✅ 0 table existante modifiée en RLS ; 120 nouvelles, toutes RLS |
| **OFFRES_INTACTES** | ✅ `legacy_offers` **24/24** : essentiel **59 €**, pro **129 €**, premium **249 €** (annulé), mini **69 € négocié** non remappé |
| Isolation | ✅ 21/21 |
| **INTERRUPTIONS=9/9** | ✅ S1a/S1b, S2a/S2b, S3a/S3b, S4 (ledger en avance détecté par `…0202`), S5 restauration, S6 idempotence ([résultats](canonical-train-v9-2/prod-210-v500/interruptions/resultats.txt)) |
| Ponts PS1–PS4 | ✅ PS1 sans ledger 408/408 ; PS2 V9.1 peuplée : données identiques, triggers préexistants identiques (ajout GP listé) ; PS3 phase 0 idempotente ; PS4 contrôle final |
| Performance sanity | 18 mesures, 0 régression ; **les régressions `planning_semaine` du lot plateforme (×10–×20) disparaissent** grâce au lot perf (59 → 7 ms) |
| Verdict | **UPGRADE QUALIFIÉ** ; préconditions bloquantes du plan : `bloquant_essai_hors_fenetre`, `bloquant_essai_perpetuel`, `bloquant_essai_tronque_expire` (fail-closed) |

Restent identiques au lot (déclarés, non bloquants) : 38 écarts de la sonde RLS réelle (pertes d'accès « essai expiré » et PL-05), avertissement `lignes_inventaire` SELECT à `authenticated`.

## 8. Phase 8 — décisions Production

Aucune règle inventée ; le code reste **fail-closed** : le preflight refuse la phase principale tant que les préconditions
mesurées en lecture seule ne sont pas nulles (`bloquant_essai_*`, `bloquant_lignes_factures_emises_non_preparees`), la
remédiation UPG-P1-1 n'existe qu'en **proposition** (`remediation_essai_perpetuel_PROPOSITION.sql`), le propriétaire plateforme reste
inactif jusqu'à revendication MFA, la déconnexion reste globale (contrat figé par la recette). Voir DECISIONS_REQUIRED_PRODUCTION.

## 9. Phase 9 — installation fraîche

`rebuild_db.sh v92_fresh` : **ALL_MIGRATIONS_APPLIED — 408/408**.

Preuve de **composition** (`catalogue.sql` + `composition_catalogue.py`) : chaque lot construit **seul** sur V9.1, delta calculé ;
attendu = V9.1 + union des deltas ; comparé à V9.2 fraîche — schéma, colonnes, contraintes, index, triggers, policies,
fonctions (définition md5, SECURITY DEFINER, volatilité, propriétaire), ACL tables / colonnes / fonctions / schémas, privilèges par défaut :

| | |
|---|---|
| Objets | V9.1 10 896 → V9.2 **10 967** |
| Delta GP | acl_colonne 26, acl_fonction 2, acl_table 1, contrainte 5, fonction 12, trigger 1 |
| Delta PERF | acl_fonction 12, colonne 5, contrainte 1, fonction 15, index 3, policy 65 |
| Delta PLATFORM | acl_fonction 1, fonction 3 |
| Chevauchements / conflits / écarts | **0 / 0 / 0** — `COMPOSITION=OK` ([catalogue](canonical-train-v9-2/fresh-composition-catalogue.txt)) |
| Données de référence (281 tables, colonnes volatiles neutralisées) | 0 écart — `COMPOSITION=OK` ([données](canonical-train-v9-2/fresh-composition-donnees.txt)) |

## 10. Phase 10 — upgrade V9.1 → V9.2

`scripts/qualification/v9-2/upgrade-v9-1-v9-2.sh` : empreinte **ligne à ligne** de 283 tables (public, private, platform,
auth, storage) restreinte aux colonnes préexistantes, avant / après ; clés métier (factures, paiements, devis,
pointages, documents, entreprises/abonnements, appartenances) ; catalogue upgradé comparé à V9.2 fraîche.

| Base | Contenu | Migrations | Tables modifiées | Clés métier | Catalogue = fresh | Verdict |
|---|---|---|---|---|---|---|
| fraîche | V9.1 vide | 17/17 | `applications_elsatia` (attendu) | identiques | ✅ | 0 perte |
| métier | seed pilote 28 comptes + fixture satellites + isolation multitenant + devis remisé, facture, paiement, avoir, notifications | 17/17 | + `entreprises_dashboard_cache` (recalcul 1406, attendu) | 11 factures, 5 paiements, 303 pointages… identiques | ✅ | 0 perte |
| historique | métier + données devenues invalides (budget < 0, dates inversées, remise 150 %, facture émise puis annulée, pointage rejeté, > 24 h / jour) | 17/17 | idem | identiques ; NOT VALID tolère l'historique | ✅ | 0 perte |
| volumétrique | 176 312 devis, 174 200 factures, 81 798 paiements, 172 k notifications, 6 tenants (1k → 100k), 1,2 Go | 17/17, **toutes < 0,7 s** (1503 : 105 ms) | idem | 346 003 765,25 € TTC, 146 106 472,54 € payés — identiques | ✅ | 0 perte |

Résultats : [`upgrade-v9-1/`](canonical-train-v9-2/upgrade-v9-1/). Seules modifications de colonnes préexistantes :
`applications_elsatia.url_locale` de Réserves (`…0103`, si valeur d'origine) et le cache tableau de bord (`…1406`).
Les nouvelles colonnes push (`…1501`) marquent l'arriéré > 25 h `expiree_avant_migration` (aucune colonne existante modifiée).

## 11. Phase 11 — tests

| Porte | Résultat |
|---|---|
| `verify:migrations` | ✅ 408 valides |
| `verify:train-expectations` | ✅ 408 / `20261003001504` / 39 contrôles (+ SQL post-cutover du pack) |
| `verify:secrets` | ✅ aucun secret |
| `verify:env-manifest` / `test:env-manifest` | ✅ (après CONV-1) / 70/70 |
| `test:migration-targets` / `test:preview-pack` / `test:preview-v9` | 7/7 / 32/32 / **29/29** |
| `test:production-v9x-preflight` / `test:seeds` / `test:preflight-preview` / `test:dr-guard` | 39/39 / 48/48 (après CONV-2) / 5/5 / 10/10 |
| pgTAP complet | 172/181 propres (9 non propres = V9.1) — [liste](canonical-train-v9-2/pgtap-complet-v92.txt) |
| Vitest | GP 2 950 · Tools 2 174 · Réserves 239 · Colors 436 |
| typecheck (4 apps) | 0 erreur |
| lint (4 apps) | 0 erreur (GP : 15 avertissements identiques à V9.1) |
| build | GP ✅ · Réserves ✅ · Colors ✅ · Tools local / preview / production ✅ (+ 2 refus attendus) |
| PostgREST réel | sondes 42/42 ; endurance 0 écart ; relances par le cron réel ; charge RLS (§5) |
| Playwright GP métier / permissions / pointages / facturation | 13/13 |
| Playwright cross-app / auth / logout / Preview simulée / Production simulée | 16/16 |
| WebKit / Safari | NOT_PROVEN (binaire absent, `playwright install` proscrit) |
| Supabase CLI réel (Docker) | NOT_PROVEN (démon absent) — équivalent : PostgreSQL nu sans droits implicites |

## 12. Phase 12 — recette métier

Parcours rejoué sur V9.2 (Playwright `gp-business-hardening-v9-1.spec.ts`, 6 rôles, base vierge) : client (identité
obligatoire) → chantier (budget < 0 et dates inversées refusés) → devis 3 taux de TVA, remises ligne + globale = calcul
indépendant **au centime** (4 856,67 HT / 5 648,96 TTC) → acceptation → **facture unique** = devis au centime (refacturation
refusée) → émission (échéance antérieure refusée, **plus d'annulation après émission**) → paiement (double clic = **un seul**
encaissement) → impression FR → affectation d'équipe / planning, pointage oublié (doublon refusé, **24 h max**) → **rejet**
et validation par le chef (totaux hors rejetés) → **rentabilité** (CA émis hors brouillon, main-d'œuvre validée) → **clôture**
→ **avoir** imprimé citant la facture rectifiée. Documents émis immuables : sondes C01-C08 ; confidentialité des coûts :
D01-D14 + S12 ; **CA net** d'avoirs : pgTAP N1, S10.

## 14. Phase 14 — pack opérateur Preview générique

`scripts/preview/v9/` (importé de `claude/zen-clarke-qchnnt`, 372 → 389) **ne code plus aucun nombre** de migrations :

| Ledger Preview fourni | CURRENT_LEDGER | TARGET_LEDGER | PENDING_MIGRATIONS |
|---|---|---|---|
| socle V8 (813 originale) | 372 / `20261002000813` | 408 / `20261003001504` | 36 |
| V9.1 | 391 / `20261002001302` | 408 / `20261003001504` | 17 |

- Conformité : préfixe exact du train (pas de trou, d'étrangère, d'ordre inversé, de nom différent), plancher 813 **originale**,
  toutes les en-attente postérieures au ledger → `db push` **sans `--include-all`** ; `--include-all` / `migration repair` = ARRÊT ;
  dry-run = exactement les PENDING dans l'ordre (±1 refusé) ; option `--attendu-courant <n>`.
- **Garde Preview `pgvvpqyjziyapbbkydmc` conservée** ; Production refusée (ref, hôtes `*.elsatia.fr`) ; DRY-RUN par défaut, `--apply-preview` exige `--confirm-ref`.
- **Phase 0** : le pont marqué `-- elsatia:upgrade-phase0` est un no-op en Preview (300 au ledger) et le plan le signale ; ledger sans `20260921000300` → refus explicite (historique Production : `scripts/upgrade/preflight.mjs --phase 0`).
- SHA déployé = HEAD (porte code liée à ce SHA) ; SQL post-cutover synchronisé par `train-expectations.mjs` (+ contrôles `push_reserver_lot_service`, `pointages_couts_appliques`, `plateforme_definir_url_preview_application`).
- `test:preview-v9` **29/29** (dont un test qui interdit 17/372/389 dans `lib/`) ; `preview:v9:preflight` sur la branche du train : **`PREVIEW_V9_OPERATOR_PACK_READY`** (hors ligne). Rapport : `ELSATIA_V9_PREVIEW_OPERATOR_PACK_V1.md` §V9.2.

## 15. Phase 15 — gate actualisé

| Gate | État | Preuve / reste |
|---|---|---|
| **CODE_GATE** | ✅ **PASSED** | intégrité du train, composition, typecheck, lint, Vitest, builds, verify:* |
| **LOCAL_GATE** | ✅ **PASSED** | fresh, 4 upgrades, Production 210, pgTAP, PostgREST, Playwright, performance |
| **PREVIEW_GATE** | ⛔ **NOT_RUN** | pack opérateur READY hors ligne ; exige : export du ledger réel, sauvegarde, `db push --dry-run` réel, inventaire Vercel, attestation k1, recette HTTP / pilote (EXTERNAL_CONFIGURATION_REQUIRED) |
| **PRODUCTION_GATE** | ⛔ **BLOCKED** | décisions Production ouvertes (UPG-P0-2, troncature, UPG-P1-1, UPG-SEC-1) ; aucune preuve hébergée ; preflight fail-closed |
| **COMMERCIAL_GATE** | ⛔ **BLOCKED** | B10 / B22 / B23 (DECISION_REQUIRED_PRODUCT), Stripe Live non configuré / non testé, logout |

**LOCAL QUALIFIED n'est pas PRODUCTION READY** : aucune preuve hébergée n'a été produite.

## DECISIONS_REQUIRED_PRODUCT

| Code | Sujet | État dans le train |
|---|---|---|
| **B10** | facturation avancée (acomptes, avoirs, situations) et relances encore **bêta** dans l'offre | inchangé (bêta) |
| **B22** | déduction des acomptes dans les situations ; cumul des situations au-delà de l'avancement | aucune règle ; V9.1 plafonne seulement « déjà facturé + période ≤ contractuel » |
| **B23** | retenue de garantie : impression, déduction du net, libération | calculée, ni imprimée ni déduite |
| B20 inverse | après un avoir partiel, plus aucun paiement du solde réellement dû | inchangé (sur-restriction sûre) |
| PENDING vs VALIDATED | heures « à vérifier » dans les totaux | inchangé |
| Quantité négative de devis, client sans identité en base, liste des taux de TVA | UI corrigée, base inchangée | — |
| CA copilote « émis net d'avoirs » (remplace « hors avoirs ») | cohérence 3 écrans | à confirmer produit |

## DECISIONS_REQUIRED_PRODUCTION

| Code | Sujet | Comportement fail-closed |
|---|---|---|
| `UPG_P0_2` | dates d'essai invalides (Stripe `trial_end` > début + 30, fin < début) : `…0204` échoue | précondition `bloquant_essai_hors_fenetre` ; preflight refuse |
| `UPG_P0_2_TRONCATURE` | essai Stripe en cours **tronqué** par `…0204` → accès coupé | précondition `bloquant_essai_tronque_expire` |
| `UPG_P1_1` | essai **sans date** (« essai perpétuel ») | précondition `bloquant_essai_perpetuel` ; SQL de régularisation **proposé** seulement |
| `UPG_SEC_1` | **propriétaire plateforme** (`julien@elsatia.fr` par `…0233`) | inactif jusqu'à revendication MFA |
| `LOGOUT_SCOPE` | déconnexion **globale** vs locale (GP, Colors, Réserves) | globale conservée, recette figée |
| `RLS_1503_FENETRE` | `…1503` prend 13 verrous ACCESS EXCLUSIVE (`lock_timeout` 10 s) : sous lectures longues V9.1 elle échoue proprement | appliquer en heure creuse / trafic fermé ; rejouable (§5) |

## EXTERNAL_CONFIGURATION_REQUIRED

- Preview : accès base `pgvvpqyjziyapbbkydmc` (export du ledger, sauvegarde, `db push --dry-run` puis application), projets Vercel (variables, dont **`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` de Réserves** et retrait de l'alias ANON ensuite), `NEXT_PUBLIC_TOOLS_ENV=preview`, `url_preview` réelles par l'écran propriétaire (AAL2), attestation de clé bancaire k1, `RATE_LIMIT_HMAC_KEY`, VAPID (push).
- Production : décisions ci-dessus, sauvegarde, fenêtre de maintenance (phase 0 puis phase principale), preflight sur attestations réelles.
- Stripe Live : non configuré, non testé (interdit dans cette mission).
- Environnement de qualification : Docker / Supabase CLI réel, WebKit — non disponibles ici.

## Reproduire

```bash
git fetch origin integration/elsatia-canonical-train-v9.2 && git checkout integration/elsatia-canonical-train-v9.2
apt-get install -y postgresql-16-pgtap && pg_ctlcluster 16 main start   # + PostgREST 12.2.3 (binaire officiel)
npm ci && for a in tools colors reserves; do npm ci --prefix apps/$a; done && (cd tests/e2e/colors-pile-locale && npm ci)
scripts/qualification/v9-2/integrite-train.sh && scripts/qualification/v9-2/renumerotation-preuve.sh
scripts/local-postgres-bootstrap/rebuild_db.sh v92_fresh                                # 408/408
git worktree add --detach /var/tmp/wt_v91 24a0c2e9 && /var/tmp/wt_v91/scripts/local-postgres-bootstrap/rebuild_db.sh ref_v91
# composition : construire chaque lot seul (worktrees d617f7e, a9b46f01, 2cd5ca6e), catalogue.sql + composition_catalogue.py
scripts/qualification/pgtap-run-v3.sh v92_fresh                                         # 172/181
scripts/qualification/v9-2/preparer-bases-upgrade.sh ref_v91 u91
for b in metier historique; do scripts/qualification/v9-2/upgrade-v9-1-v9-2.sh u91_$b u92_$b v92_fresh /tmp/upg_$b; done
# volumétrique : ref_v91 + scripts/perf/generate_fixture.sql + volume_tenant.sql k=11 n=1000 + volume_tenant_rapide.sql k=13/14/15 n=20000/50000/100000
scripts/qualification/v9-2/upgrade-v9-1-v9-2.sh vol_v91 vol_v92 v92_fresh /tmp/upg_vol
scripts/qualification/v9-2/rls-verrous-sous-trafic.sh vol_v91 /tmp/rls_lock
scripts/upgrade/build-source.sh h210_v500_rem --vol 500 --remediation scripts/upgrade/sql/remediation_essai_perpetuel_PROPOSITION.sql
scripts/upgrade/production-to-v9x.sh --target-sha HEAD --target-migration-count 408 --source-db h210_v500_rem --out /tmp/upg/final
scripts/upgrade/interruption.sh h210_v500_rem HEAD 408 /tmp/upg/inter
scripts/upgrade/ponts-scenarios.sh --target-sha HEAD --base-v91 24a0c2e9 --source-210 h210_v500_rem --out /tmp/upg/ps
# navigateur (secrets de banc aléatoires) : gp-business-hardening-pile-locale/preparer-base.sh + finance-pile-locale/demarrer-pile.sh,
# next build && next start -p 3100 ; scripts/qualification/v9-2/recette-satellites.sh v92_fresh /tmp/e2e/sat
npm run verify:migrations && npm run verify:train-expectations && npm run verify:secrets && npm run verify:env-manifest
npm run test:preview-v9 && npm run preview:v9:preflight
```
