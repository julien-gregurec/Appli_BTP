# ELSATIA — Train canonique V2 : convergence finale

**Mandat** : construire le train canonique le plus à jour à partir du train V1
(`integration/elsatia-canonical-train-v1` @ `1c1fed66`, verdict `CANONICAL TRAIN LOCALLY QUALIFIED`)
en y intégrant les cinq missions terminées après lui, puis rejouer l'ensemble des gates.
Mission autonome : toute ambiguïté → `DECISION_REQUIRED` → choix conservateur → documenté → on continue.

**Interdits respectés** : aucun merge vers `main`, aucune Preview, aucune Production, aucune
réécriture d'historique, planificateur de purge RGPD **non activé**, lot Studio post-H **non intégré**.
Seule la branche `integration/elsatia-canonical-train-v2` est poussée.

| | |
|---|---|
| Branche | `integration/elsatia-canonical-train-v2` |
| Base | `origin/integration/elsatia-canonical-train-v1` @ `1c1fed66` (après `git fetch --all --prune`) |
| HEAD | le commit qui ajoute ce rapport (voir `git log -1`) ; dernier commit technique : `648ab3ff` |
| Migrations | **335** (V1 : 328) — les 328 de V1 sont **identiques octet pour octet** ; 7 nouvelles, toutes > `…346` |
| Environnement de gate | PostgreSQL 16 natif + pgTAP (apt), GoTrue compilé depuis les sources (v2.196.0), PostgREST v12.2.3 (binaire), mock Storage, `next dev` + Chromium Playwright 1194, FFmpeg système 6 (avec `drawtext`). Pas de Docker, pas de Supabase CLI. |

---

## 1. Missions intégrées

| # | Mission | Branche @ tête | Méthode | Commit du train | Migrations |
|---|---|---|---|---|---|
| A | Pilot Remaining Fails Closure V2 | `claude/festive-tesla-xl5out` @ `f78a29ce` | merge `--no-ff --no-commit`, renumérotation dans l'index | `f61509f5` | 5, renumérotées |
| B | Colors Full Qualification V2 | `claude/quirky-franklin-mb6eth` @ `76d57833` | idem | `da141d26` | 1, renumérotée |
| C | Data Retention / Backup Consistency V1 | `claude/hopeful-tesla-r6hbea` @ `fa0f30e4` | idem (base `26112ced` = RGPD V2, déjà ancêtre du train : 1 seul commit apporté) | `74152822` | 1, numéro conservé |
| D | Preview Execution Prep V3 | `claude/fervent-dirac-eez6pk` @ `5100a77d` | merge automatique, 0 conflit | `1db41cd6` | 0 |
| E | Studio Final Qualification V3 — **harnais/tests seulement** | `claude/festive-knuth-z26hq9` @ `cf89b9ec` | merge automatique, 0 conflit | `633daa21` | 0 |

Commits de convergence propres au train V2 :

| Commit | Objet |
|---|---|
| `61236625` | pgTAP Colors V16 aligné sur l'ACL colonnes Billing `…332` + preuve isolée du trigger `…355` (§5) |
| `648ab3ff` | Outils d'upgrade V1→V2 (seed complémentaire, instantané) ; `ELSATIA_PREVIEW_DB_VERIFY_V1.sql` et runbook V3 alignés sur 335 migrations (§7) |

Merge plutôt que cherry-pick : même raison que V1 (provenance Git auditable, déduplication et
renumérotation faites dans l'index **avant** le commit — aucune migration en double n'a jamais
existé dans un commit du train).

---

## 2. Déduplication

| Élément | Classement | Preuve / traitement |
|---|---|---|
| Merge Studio Worker V2 porté par D (`40d19026`) et E (`4c4101cf`) | **IDENTICAL** | Déjà dans le train (`e8050504`, même tête `afd39126`) ; merge sans delta sur ces fichiers |
| `ELSATIA_STUDIO_VIDEO_WORKER_REAL_BASELINE_V2.md` (D et E) | **IDENTICAL** | Même blob, aucun conflit |
| Pilot quick wins (CH-08, CM-06, PL-05, PE-06) portés par la base de A (`b2d4bc7b`) | **IDENTICAL** | `b2d4bc7b` ancêtre du train V1 : rien n'est réappliqué |
| RGPD Purge V2 (base de C, `26112ced`) | **IDENTICAL** | Ancêtre du train ; C n'apporte qu'un commit |
| Correctif e2e NF-01 du train V1 (`415474f6`) vs correctif NF-01 de A | **CONFLICT** → résolu | Version A (fournisseur unique, montant requis) + attente de document du train conservée |
| Note V1 « `E2E_BASE_URL=http://localhost:3100` obligatoire » | **SUPERSEDED** | A ajoute `allowedDevOrigins: ["127.0.0.1"]` (`next.config.ts`, dev uniquement) — cause racine traitée |
| `playwright.config.ts` (train : `PW_CHROME_PATH` ; B : configuration bi-application) | **CONFLICT** → résolu | Config B + `launchOptions` `PW_CHROME_PATH` sur `desktop-chromium` |
| `config/env-manifest.json` (train : `PW_CHROME_PATH`, `STRIPE_PORTAL_CONFIGURATION_ID` ; B : 11 variables de recette ; D : champs/scripts Preview) | **CONFLICT** (B) → union ; D auto-mergé | Union par nom, aucune variable modifiée des deux côtés ; `scan.exclude_paths` du train conservé |
| `src/app/api/cron/abonnements/route.ts` (train : portes cron/relances, capacité, suspensions ; A : FA-08 ; C : planificateur RGPD) | **CONFLICT** (C) → résolu | Structure du train ; planificateur placé **dans** `executerJobsHistoriques` (double verrou, §6) |
| `.env.local.example` | **CONFLICT** (C) → union | |
| `src/lib/supabase/proxy.ts` (A : PE-07 `session_revoquee` ; D : `/api/tools/monetization`) | **NEW** ×2 | Auto-mergé, zones disjointes |
| Migration Colors `…355` vs Billing `…332` | **NEW** (défense en profondeur) | Sur le train, l'ACL colonnes de `…332` ferme déjà le contournement ; le trigger reste utile si l'ACL régresse (§5) |
| Lot Studio post-H (`fix/studio-signup-closed-v1`) | **ARCHITECTURE_DECISION_REQUIRED** | Absent de E (aucune migration, aucun fichier `apps/studio/src`) ; reste isolé |
| Conflit purge RGPD ↔ facture émise | **ARCHITECTURE_DECISION_REQUIRED** (juridique) | Inchangé depuis V1, §8 |

---

## 3. Migrations

### 3.1 Séquence

- 328 migrations V1 : `cmp` fichier par fichier → **toutes identiques**.
- 7 nouvelles, **toutes après `20260923000346`** (dernière de V1) → chemin d'upgrade V1→V2 **monotone**
  (aucune migration « antérieure à la dernière appliquée », que `supabase db push` refuserait sans
  `--include-all`).
- `verify:migrations` : ✅ **335 migrations valides, noms et horodatages uniques**.
- `20260923000347` volontairement **laissé libre** : le rapport V1 l'a réservé à la proposition
  RGPD-PURGE-VS-FACTURE-EMISE (§8).

### 3.2 Tableau de renumérotation (SQL octet pour octet inchangé)

| SOURCE | OLD_VERSION | NEW_VERSION | STATUS | DEPENDENCY | REASON |
|---|---|---|---|---|---|
| A `festive-tesla` | `20260923000328_fa08_bascule_factures_en_retard` | `20260923000350` | RENUMBERED | `recalc_paiements_facture` (`20260921000302`) | Upgrade monotone depuis V1 (328 < 346) |
| A | `20260923000329_pl03_historique_affectations` | `20260923000351` | RENUMBERED | prédicat PL-05 (`20260923000327`) | Upgrade monotone depuis V1 |
| A | `20260923000330_pt08_regularisation_pointage_responsable` | `20260923000352` | RENUMBERED | `declarer_pointage_oublie` (`20260723000130`) | **Collision** avec Colors `…330` + upgrade monotone |
| A | `20260923000331_pe07_revocation_appareil_invalide_session` | `20260923000353` | RENUMBERED | `est_membre_actif_reel` (`20260922000309`) | **Collision** avec RGPD V2 `…331` du train |
| A | `20260923000332_nf01_soumission_note_frais_justificatif_stocke` | `20260923000354` | RENUMBERED | `transition_note_frais` (`20260713000059`) | **Collision** avec Billing `…332` du train |
| B `quirky-franklin` | `20260923000330_proteger_suspension_entreprise` | `20260923000355` | RENUMBERED | `proteger_facturation_entreprise` (`20260816000204`) | **Collision** avec PT-08 + upgrade monotone |
| C `hopeful-tesla` | `20260923000400_purge_preuve_et_garde_annulation` | `20260923000400` | KEPT | `tables_conservees_purge` (`…331`), RPC demande/annulation (`20260719000114`) | Aucune collision, déjà en fin de chaîne |

Références mises à jour hors migrations : en-têtes des 5 suites pgTAP Pilot, commentaire du cron
FA-08, commentaire du spec NF-01, commentaire du test Colors V16. Les rapports de qualification
sources gardent leurs anciens numéros (historique).

### 3.3 Dépendances / redéfinitions — vérification

Pour chaque fonction redéfinie par une nouvelle migration, la **dernière** définition dans le train
avant elle a été recherchée (`create or replace function`) :

| Fonction redéfinie | Par | Dernière définition antérieure du train | Verdict |
|---|---|---|---|
| `a_permission`, `est_membre_actif` | `…353` (PE-07) | `20260718000110`, `20260714000075` | Base de A = même définition → reprise exacte |
| `est_membre_actif_reel` | `…353` | `20260922000309` (présente dans la base de A) | idem |
| `contexte_acces_proxy`, `enregistrer_appareil_courant`, `revoquer_appareil_compte` | `…353` | `20260719000117`, `20260716000085` | idem |
| `transition_note_frais` | `…354` | `20260713000059` | idem |
| `proteger_facturation_entreprise` | `…355` | `20260816000204` (la migration le dit elle-même) | idem |
| `demander_/annuler_suppression_entreprise` | `…400` | `20260719000114` (la migration le dit elle-même) | idem |
| `tables_conservees_purge` | `…400` | `…331` (liste reprise + 2 tables F9) | idem |

Aucune migration superseded ni contradictoire parmi les 7. Aucun nom métier en double.

---

## 4. Pilot

| Gate | Résultat |
|---|---|
| `npm run pilot:acceptance:v3` (reconstruction à froid de `pilot_gp` : 335 migrations, GoTrue réel, PostgREST réel, mock Storage) | ✅ exit 0 ; scénarios auth/session **tous PASS** (dont révocation, bannissement, suspension en cours de session) ; runner backend **70 PASS / 1 MANUAL_EXPECTED / 0 FAIL** sur 71 |
| Playwright `pilot-acceptance-v2` + `-v3` + `pilot-remaining-fails-v2` (`next dev` + Chromium) | ✅ **38/38 en un seul passage** (24 + 8 + 6), sans vider le rate-limiter entre specs |
| pgTAP ciblés NF-01, FA-08, PL-03, PT-08, PE-07, CH-08, CM-06, PL-05, PL-02 | ✅ tous verts |
| Cron réel `/api/cron/abonnements` (FEATURE_CRONS_ENABLED=true) | ✅ `facturesEnRetard.ok`, `suspensionsImpayes.ok`, `purgeRgpd.mode = off`, `platform.purge_audit` = 0 ligne |

Les dix corrections demandées sont présentes et prouvées :

| ID | Preuve DB | Preuve UI |
|---|---|---|
| NF-01 | `nf01_…` (`…354`) | spec v3 NF-01 ✅ |
| FA-08 | `fa08_…` (`…350`) | spec remaining FA-08 ✅ (appel réel du cron) |
| PL-03 | `pl03_…` (`…351`) | spec remaining PL-03 ✅ |
| PT-08 | `pt08_…` (`…352`) | spec remaining PT-08 ×2 ✅ |
| PE-07 | `pe07_…` (`…353`) | spec remaining PE-07 ✅ (même JWT → RLS fermée, puis `/login`) |
| CH-09 | vitest `carte-tuiles` 6/6 | spec remaining CH-09 ✅ |
| PE-06 | — | spec v3 PE-06 ✅ |
| CH-08 | `ch08_…` | spec v3 CH-08 ✅ |
| CM-06 | `cm06_…` | — |
| PL-05 | `pl05_…` (+ ACL `…346`) | runner backend ✅ |

### Matrice des 143 contrôles

```
                Train V1     Pilot V2 (branche)   Train canonique V2
PASS            130          135                  135
FAIL              5            0                    0
MANUAL_EXPECTED   5            5                    5
REMOTE_ONLY       3            3                    3
Total           143          143                  143
```

Objectif atteint, **aucune régression** : les 5 FAIL de V1 (CH-09, FA-08, PL-03, PE-07, PT-08) sont
PASS, et chaque cas PASS de V1 reste couvert par la même preuve rejouée (backend 70/71, Playwright
38/38, pgTAP).

---

## 5. Colors

| Gate | Résultat |
|---|---|
| pgTAP Colors (9 fichiers) | ✅ **444/444** |
| Vitest Colors | ✅ **431/431** (39 fichiers) |
| Playwright Colors (`npm run test:e2e:colors`, passerelle locale + `next start`, base reconstruite à 335 migrations par `preparer-base.sh`) | ✅ **73/73** (dont `colors-suspension-session`) |
| build Colors (`ELSATIA_APPLICATION_ENV=local`, puis env complet de recette) | ✅ ×2 |
| typecheck / lint Colors | ✅ / ✅ |

**Migration de suspension `…355` — vérification spéciale.** Premier passage pgTAP complet :
**1 régression de test** introduite par la convergence (`colors_suspension_application_v16` #61,
« gestionnaire : update suspension silencieusement filtré par RLS »). Cause : sur le train, Billing
`…332` retire à `authenticated` le privilège `UPDATE` sur `suspension_prevue_at`, `impaye_*`,
`dernier_reglement_at` (vérifié par `has_column_privilege`) → refus **42501 avant la RLS**. Le
produit est **plus strict**, pas moins : le contournement que `…355` ferme l'est déjà par l'ACL.
Correctif de test (`61236625`) :
- #61 attend désormais `throws_ok 42501` ;
- l'ACL masquant le trigger pour l'admin tenant, **2 assertions** prouvent le trigger seul (ACL
  rouverte dans la transaction de test) — défense en profondeur si l'ACL régresse (cf. GP `189`
  qui l'aurait fait, écarté en V1).
- **Contre-épreuve** : avec la définition précédente (`…204`) de `proteger_facturation_entreprise`,
  3 échecs (66-68). Avec `…355` : 92/92.

---

## 6. Data Retention

Intégré (correctifs techniques sûrs uniquement) : F9 (archives notes de frais RETAIN),
`platform.purge_audit` append-only, `preuve_purge_entreprise`, `restaurer_echeance_depuis_preuve`,
garde d'annulation/nouvelle demande quand la purge a commencé, `lister_purges_echues`,
`consigner_planificateur_purge`, planificateur TS.

**Planificateur OFF** — prouvé :
- `RGPD_PURGE_PLANIFICATEUR_MODE` absent → `mode: off`, **0 appel HTTP** (exécuteur
  `.qualification-tools/planificateur_purge_e2e.mts`) ; `execute` sans `RGPD_PURGE_DECISION_REF`
  → retombe sur `off` ;
- choix conservateur du train : l'appel est placé **dans** `executerJobsHistoriques`, donc derrière
  `FEATURE_CRONS_ENABLED` **en plus** de sa propre porte (double verrou) ;
- `.env.example` / `.env.preview.example` / `.env.local.example` : valeurs **vides** (= off) ; les 3
  variables sont déclarées au manifeste (`category: legal`, `fail_mode: closed`) ;
- cron réel exécuté sur la pile Pilot : `purgeRgpd = {mode: off, raison: desactive_par_defaut}`.

Tests : pgTAP `purge_preuve_et_garde_annulation` ✅ ; vitest `rgpd`, `rgpd-purge-planificateur` ✅
(dans les 1 853 GP).

---

## 7. Preview tooling

| Élément | Résultat |
|---|---|
| `npm run preflight:preview` | Rapport **NO-GO — 28 erreurs ENV** : aucune valeur réelle dans ce bac à sable (attendu, Preview hors mandat) ; bloque bien, notamment `STUDIO_REDIS_URL` local |
| `test:preflight-preview` | ✅ 5/5 |
| `smoke:email:preview` / `test:smoke-email` | ✅ 12/12 (pas d'envoi réel : hors mandat) |
| `test:env-manifest` | ✅ 67/67 |
| `build:gestion-pro` | ✅ (`prebuild:gestion-pro` + `next build`) |
| Redis readiness (worker Studio) | ✅ `redis-readiness.test.ts` dans la suite worker |
| Tools monetization routing | ✅ `proxy-routes-serveur-a-serveur.test.ts` (dans les 1 853 GP) |
| `ELSATIA_PREVIEW_DB_VERIFY_V1.sql` | ✅ exécuté sur la base fresh V2 : 11/13 ok, les 2 non-ok **non bloquants** (URLs Preview et propriétaire plateforme, gestes Preview). **Défaut corrigé** (`648ab3ff`) : le contrôle bloquant attendait `321 / 20260922000330` (T0) et aurait bloqué à tort une Preview du train ; aligné sur `335 / 20260923000400`, vérifié avec un registre CLI simulé à 335 versions. Runbook V3 aligné. |

---

## 8. Full fresh

`rebuild_db.sh v2_fresh` : ✅ **335/335** migrations sur base vide (≈ 21 s). Rejeu instrumenté
(sortie complète capturée, fichier par fichier) : **0 ERROR** ; 1 seul `WARNING: there is no
transaction in progress`, émis par `20260908000277_platform_support_access_communications_v1`
(migration du tronc T0, `COMMIT` superflu, inoffensif, déjà présent en V1). Aucune erreur cachée.
Deux reconstructions à froid supplémentaires ont réussi dans les harnais Pilot (`pilot_gp`) et
Colors (`colors_e2e`).

---

## 9. Upgrade V1 → V2

Protocole :
1. base `v1_upgrade` = amorce + les **328 migrations exactes de V1** (`git archive` de la branche V1) ;
2. seed métier : `seed_entreprise_pilote_btp.sql` (28 salariés, 7 chantiers, 9 devis, 7 factures,
   300 affectations, 300 pointages, 6 notes de frais, commandes, stock, congés), `colors-pilote.sql`
   (2 entreprises, seaux, emplacements), `upgrade_v1_v2_seed_complement.sql` (Boutique : commande
   **payée via la RPC du webhook** + commande en attente ; entitlements entreprise et utilisateur ;
   préavis RGPD non échu) — 3 entreprises, 35 utilisateurs, 2 289 lignes ;
3. instantané `upgrade_snapshot.py` ; application des **7 migrations V2** ; instantané.

| Contrôle | Résultat |
|---|---|
| Application des 7 migrations | ✅ 0 erreur, 0 warning |
| Row counts (241 tables : public, platform, auth, storage) | ✅ **0 écart** ; 2 tables nouvelles, vides : `affectations_historique`, `sessions_revoquees` |
| Checksums métier (34 tables : factures, lignes, paiements, devis, affectations, pointages, sessions, congés, notes de frais + documents/versions, commandes/dépenses/règlements fournisseurs, stock, boutique ×3, entitlements ×3, Colors ×4, appareils, journal…) | ✅ **34/34 identiques** (calculés sur le jeu de colonnes V1) |
| Factures | ✅ aucun statut modifié par l'upgrade (FA-08 ne bascule qu'à l'appel du cron) |
| RLS — flags | ✅ inchangés ; les 2 nouvelles tables ont la RLS active |
| RLS — policies (598) | ✅ 0 supprimée, 0 modifiée (empreinte `qual`/`with_check`) ; 1 ajoutée (`affectations_historique_lecture`) |
| RLS — sonde réelle (35 utilisateurs × 12 tables, `set local role authenticated` + claims) | ✅ **0 écart** (203 cellules non nulles) |
| Schéma après upgrade vs fresh V2 (`pg_dump -s`, ACL comprises, 54 563 lignes) | ✅ **identique** |

Constat au passage : le seed complémentaire a tenté d'antidater l'échéance d'une facture
`envoyee` ; `verrouiller_facture_emise` l'a **refusé** — comportement voulu du produit, le seed a
été corrigé.

---

## 10. Full gates

| App | typecheck | lint | tests | build |
|---|---|---|---|---|
| Gestion Pro | ✅ | ✅ 0 erreur (15 warnings préexistants) | ✅ **1 853/1 853** (157 fichiers ; V1 : 1 806) | ✅ `build:gestion-pro` |
| Tools | ✅ | ✅ | ✅ 1 992/1 992 | ✅ (`NEXT_PUBLIC_TOOLS_ENV=local`) |
| Colors | ✅ | ✅ | ✅ 431/431 | ✅ (`ELSATIA_APPLICATION_ENV=local`) |
| Reserves | ✅ | ✅ | ✅ 178/178 | ✅ (`ELSATIA_APPLICATION_ENV=local`) |
| Studio | ✅ | ✅ | ✅ 260/260 | ✅ |
| Worker Studio | ✅ | — | 28 passed, 4 skipped ; `analysis.test.ts` en échec (OpenCV optionnel absent — **identique** aux baselines V1/V2) | — |

Worker : grâce à `STUDIO_FFMPEG_PATH`/`STUDIO_FFPROBE_PATH` (apport E), les tests tournent sur le
FFmpeg système **sans substitution du binaire** `ffmpeg-static` (méthode V1) : 28 passed contre 22
en V1.

| Gate transverse | Résultat |
|---|---|
| `verify:migrations` | ✅ 335 |
| `verify:secrets` | ✅ 2 677 fichiers, aucun secret (2 exceptions nommées) |
| `verify:env-manifest` | ✅ 0 erreur, 14 DECISION_REQUIRED non bloquantes (préexistantes) |
| Tests preflight / env / smoke e-mail | ✅ 5 + 67 + 12 |
| **pgTAP maximal** (126 fichiers, base fresh) | **115 PASS** ; **2 809 ok / 23 not ok** |

Les 11 fichiers pgTAP non verts sont **exactement ceux de V1**, même nombre d'assertions en échec
(23) :

| Fichier | Cause (inchangée depuis V1) |
|---|---|
| `purge_entreprise_architecture_v2` (8), `purge_entreprise_supprimee` (1) | Conflit RGPD ↔ facture émise (§12) |
| 7 suites `studio_*` historiques | Fixtures bloquées par `studio_signup_policy` du tronc ; la nouvelle suite `studio_final_qualification_v3` (34) est verte |
| `platform_stripe_state_attestation_r72` (14) | Stub `pgsodium` du bac à sable |
| `elsatia_tools_cloud_sync_entitlement_closure_v1` | Privilèges par défaut Supabase non reproduits localement |

Nouvelles suites vertes : `fa08`, `pl03`, `pt08`, `pe07`, `nf01`, `colors_suspension_application_v16`
(92), `colors_cross_tenant_operations_v17` (79), `purge_preuve_et_garde_annulation` (43),
`studio_final_qualification_v3` (34).

Hors gates demandés : `seed-elsatia-preview-year.test.mjs` a 1 échec environnemental (« liaison
Vercel locale absente », pas de `.vercel/project.json` dans le bac à sable) ; fichier non modifié
par le train V2.

---

## 11. Stripe

| Gate | Résultat |
|---|---|
| Vitest Stripe/Boutique/abonnement/webhook/remise/capacité (24 fichiers) | ✅ **344/344** |
| — Billing : `invoice.paid` rétablit l'accès et efface la suspension programmée ; `payment_failed` garde la suspension immédiate | ✅ |
| — **3DS** : `invoice.payment_action_required` ne suspend jamais l'accès | ✅ |
| — **Out-of-order** : garde d'événements (plus récent appliqué, plus ancien ignoré, égalité départagée, premier appliqué) | ✅ |
| — Idempotence : événement déjà traité non renotifié ; clé d'idempotence déterministe | ✅ |
| pgTAP Stripe/Boutique/capacité/billing (15 fichiers, hors `r72`) | ✅ **360/360** |
| **Paiement concurrent réel** (2 sessions psql, même commande, même checkout) sur la base upgradée | ✅ la 2ᵉ session **bloque 2,5 s** jusqu'au commit de la 1ʳᵉ ; stock **10 → 7** (une seule décrémentation) ; **1** dépense, **1** règlement fournisseur ; statut `payee` |
| `verify:stripe-prices` | SKIP (pas de clé Stripe — attendu) |

---

## 12. RGPD

Rejoué (ne dépend pas de la décision facture) : `purge_preuve_et_garde_annulation` 43/43, vitest
`rgpd` + `rgpd-purge-planificateur`, planificateur off (§6), row counts/RLS à l'upgrade avec un
préavis de suppression en cours (intact).

**Conflit purge ↔ facture émise — explicitement séparé**, inchangé depuis V1 : sur le train,
`purge_entreprise_architecture_v2` 18/26 et `purge_entreprise_supprimee` 19/20. Revérifié sur V2 :
trigger `verrou_facture_emise` désactivé dans une copie jetable → `architecture_v2` **26/26** ;
reste l'invariant statique F3 (#17), déjà analysé en V1 §6. F9 (`…400`) ne change rien à ce
conflit. Mode d'échec sûr (aucune suppression partielle), planificateur désactivé.

---

## 13. Décisions

| ID | Statut | Choix conservateur appliqué |
|---|---|---|
| `DECISION_REQUIRED:MIGRATION-RENUMBERING-V2` | tranchée ici | Toutes les nouvelles migrations > `…346` (upgrade V1→V2 monotone) ; `…347` laissé libre pour RGPD |
| `DECISION_REQUIRED:RGPD-PLANIFICATEUR-PLACEMENT` | tranchée ici | Dans les jobs historiques (double verrou `FEATURE_CRONS_ENABLED` + mode) |
| `DECISION_REQUIRED:RGPD-PURGE-VS-FACTURE-EMISE` | **ouverte** (juridique) | Verrou conservé ; proposition prête (V1 §6) |
| Décisions juridiques de rétention / activation de la purge automatique (rapport Data Retention V1) | **ouvertes** | Planificateur OFF |
| Studio Supabase partagé vs dédié | **ouverte** | Lot post-H isolé ; seuls harnais/tests repris |
| `DECISION_REQUIRED:DEVIS-ACCEPTE-CHANTIER-ID`, `BILLING-GRACE-PERIOD`, CM-06 métier | **ouvertes** (V1) | inchangés |
| `DECISION_REQUIRED:PREVIEW-PROJECT-INVENTORY` | **ouverte** | Hors mandat |

---

## 14. Verdict

```
CANONICAL TRAIN V2 LOCALLY QUALIFIED
```

- 5 missions postérieures intégrées (Studio : harnais/tests seulement), déduplication documentée,
  7 migrations ajoutées dont 6 renumérotées, séquence monotone, 328 migrations V1 inchangées.
- Fresh 335/335 sans erreur cachée ; upgrade V1→V2 sur données réalistes : 0 écart de lignes,
  34/34 checksums, RLS réelle identique pour 35 utilisateurs, schéma identique au fresh.
- 5 applications : typecheck, lint, tests, build **verts**.
- Pilot : **135 PASS / 0 FAIL / 5 MANUAL_EXPECTED / 3 REMOTE_ONLY** ; backend 70/71 + Playwright 38/38.
- Colors : pgTAP 444, vitest 431, Playwright 73/73 ; migration de suspension prouvée (contre-épreuve).
- Stripe : 344 vitest, 360 pgTAP, concurrence réelle prouvée, 3DS et hors-ordre couverts.
- pgTAP : **0 régression** (mêmes 11 fichiers qu'en V1, même 23 assertions, toutes expliquées).

**Pourquoi pas `READY FOR PREVIEW`** : (1) `preflight:preview` est NO-GO faute de valeurs réelles
(ne peut pas être levé dans ce bac à sable) ; (2) `RGPD-PURGE-VS-FACTURE-EMISE` et les décisions
de rétention restent ouvertes (échec sûr, planificateur off) ; (3) décision Studio partagé/dédié
ouverte ; (4) pgTAP non à 100 % pour des raisons héritées (fixtures, stub `pgsodium`, privilèges).

**Pourquoi pas `BLOCKED`** : aucun de ces points n'est une incohérence du train ; tous échouent de
façon sûre ou relèvent de l'environnement ou d'une décision propriétaire.

**Prochaines actions** : (a) trancher `RGPD-PURGE-VS-FACTURE-EMISE` (proposition V1 §6 →
`20260923000347`) ; (b) trancher l'inventaire Preview et renseigner les variables → `preflight:preview`
GO ; (c) sur la Preview, `ELSATIA_PREVIEW_DB_VERIFY_V1.sql` attend désormais 335 / `20260923000400`.

---

## Annexe — reproduire

```bash
git checkout integration/elsatia-canonical-train-v2 && npm ci   # + npm ci dans apps/* et workers/studio-video
pg_ctlcluster 16 main start ; apt-get install -y postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl

# Fresh + pgTAP
scripts/local-postgres-bootstrap/rebuild_db.sh v2_fresh
su postgres -c "psql -c 'create database v2_pgtap template v2_fresh'"
su postgres -c "psql -d v2_pgtap -c 'create extension pgtap' -c 'alter database v2_pgtap set search_path = public, extensions'"
cd supabase/tests && su postgres -c "pg_prove -d v2_pgtap *.test.sql"

# Upgrade V1 -> V2 : base aux 328 migrations de V1 (git archive), puis
#   supabase/production/seed_entreprise_pilote_btp.sql, MDP_RECETTE=… tests/e2e/fixtures/colors-pilote.sql
#   (après les colonnes auth.users de preparer-base.sh), scripts/local-postgres-bootstrap/upgrade_v1_v2_seed_complement.sql
python3 scripts/local-postgres-bootstrap/upgrade_snapshot.py v1_upgrade avant.json
#   … appliquer les 7 migrations > 346 …
python3 scripts/local-postgres-bootstrap/upgrade_snapshot.py v1_upgrade apres.json --colonnes-de avant.json

# Pilot
npm run pilot:acceptance:v3
# .env.local : NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 + clés signées (jwt_bridge.mjs sign), CRON_SECRET, FEATURE_CRONS_ENABLED=true
npx next dev -p 3100
PW_CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome E2E_BASE_URL=http://localhost:3100 \
  npx playwright test tests/e2e/pilot-acceptance-v2.spec.ts tests/e2e/pilot-acceptance-v3.spec.ts \
  tests/e2e/pilot-remaining-fails-v2.spec.ts --project=desktop-chromium --workers=1

# Colors e2e : voir ELSATIA_COLORS_FULL_QUALIFICATION_V2.md §8 (+ PLAYWRIGHT_CHROMIUM_EXECUTABLE)
```
