# ELSATIA — PLATFORM READINESS V9.1 (satellites Preview readiness + ponts Production V2)

| | |
|---|---|
| Date | 2026-10-03 |
| Base | `integration/elsatia-canonical-train-v9.1` @ `24a0c2e993ec0836b492ea72f27ed7dc347a20fa` (391 migrations) |
| Branche | `integration/elsatia-platform-readiness-v9-1` |
| Lot A (source) | `integration/elsatia-satellites-preview-readiness-v1` @ `b7519a20` (base `877a4b9f`) |
| Lot B (source) | `claude/zen-ramanujan-pku73u` @ `064e2b73` (harnais + rapport `ELSATIA_PRODUCTION_UPGRADE_HARNESS_V1.md`) |
| Train candidat | **396 migrations** : 391 V9.1 + 3 satellites (`20261003000101…103`) + 2 ponts (`20261003000201`, `…0202`) — toutes **postérieures** à `20261002001302` ; aucune migration existante modifiée |
| SHA qualifié (arbre de migrations) | voir §PROD_210_UPGRADE (`2cd5ca6eea19d03371f0eca38dfaf689269b174a`) |
| Déploiement | **AUCUN.** Ni Preview, ni Production, ni Stripe live, ni Vercel. Bases PostgreSQL 16 locales jetables uniquement |

## Verdict

**`PLATFORM_READINESS_V9_1_LOCALLY_QUALIFIED`**

Harnais Production : **`PRODUCTION_UPGRADE_HARNESS_LOCALLY_QUALIFIED`** (et non plus PARTIAL : P6 vert, ponts dans le train).

- **Lot A** : les correctifs satellites A-01, A-02, A-05, A-07, A-08, A-09, A-10, A-11 et TOOLS_ENV sont portés sur V9.1
  et re-prouvés sur la base V9.1 : fresh 396/396, pgTAP 168/177 propres (mêmes 9 non-propres d'environnement qu'avant),
  `satellites_preview_readiness_v1` 45/45, Vitest des 4 apps, builds (Tools ×3 modes), recette navigateur **16/16**
  (local 10, Preview simulée 4, Production simulée 2). Déconnexion globale **conservée** (`DECISION_REQUIRED_LOGOUT_SCOPE`).
- **Lot B** : UPG-P0-1 / UPG-LOCK-1 / UPG-P3-1 sont résolus **dans le train** par deux migrations **post-V9.1**
  (`20261003000201` phase 0, `20261003000202` contrôle final) — aucune insertion avant une migration appliquée en Preview.
  Harnais **sans `--bridge`** sur le SHA `2cd5ca6e` : ZERO_PERTE, ACL_DIFF = 0, RLS_DIFF = 0, anciennes offres 24/24,
  interruptions 9/9 ; 100 000 lignes : application **2 174 s → 28 s**, `300` **2 149 s → 0,6 s** ; preflight vert sur le
  vrai SHA (phase 0 puis phase principale), P6 compris.
- **Ce verdict est local.** L'upgrade de la vraie Production reste conditionné, par le preflight, aux préconditions de
  données mesurées en lecture seule et aux décisions listées en §DECISIONS_REQUIRED (UPG-P0-2, troncature d'essai,
  UPG-P1-1, UPG-SEC-1) — aucune n'a été tranchée ni régularisée ici. Limites inchangées : PostgreSQL 16 local (Production 17),
  pas de GoTrue / Storage réels, WebKit non prouvé, durées = ordres de grandeur d'une VM 4 vCPU.

---

## SATELLITES_PORT

### Méthode

La branche satellites part de `877a4b9f` ; V9.1 = `877a4b9f` + **un** commit (`24a0c2e`) qui ne touche que
`docs/qualification/ELSATIA_CANONICAL_TRAIN_V9_1_CONVERGENCE_V1.md`, `scripts/qualification/upgrade-v9-post-v9-hardening.sh`
et `src/lib/post-v9-flux-service.postgrest.test.ts`. Aucun fichier commun avec le lot satellites : pas de merge, les
six commits satellites ont été **rejoués un par un** sur V9.1 (cherry-pick, zéro conflit), puis chaque correctif a été
**re-vérifié sur la base V9.1** (rien n'a été pris pour acquis du rapport source) :

| ID | Porté par | Vérifié sur V9.1 par |
|---|---|---|
| **A-01** fixture pilote : Karim Haddad GP + Colors + Tools + Réserves, jamais Drone ; Karim Belaid sans habilitation | `supabase/production/fixture_preview_satellites_pilote.sql` (+ assertions 23 cas) | `preparer-base.sh` joue seed + fixture + **assertions 23/23** (sinon arrêt) ; Playwright « lanceur GP (Karim) … jamais Drone », « même entreprise, sans habilitation (Belaid) » |
| **A-02** pilote indépendant de l'expiration | même fixture (`actif`, échéance 2099-12-31, aucune suspension) | assertions `structure:gp_etat_commercial = active`, `structure:gp_independant_du_temps` |
| **A-05** Drone `bientot` : catalogue oui, app non | `20261003000101_applications_bientot_non_utilisables_v1.sql` | pgTAP `satellites_preview_readiness_v1` 45/45 ; Playwright « Drone (A-05) » |
| **A-07** Réserves : `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` + repli transitoire `ANON_KEY` | `apps/reserves/src/lib/supabase/cles.ts`, garde de build, manifeste | Vitest Réserves 239/239 ; **build Réserves avec le seul nom canonique** (0 avis) ; build avec alias = AVIS de transition |
| **A-08** URLs cross-app environment-aware (LOCAL→local, PREVIEW→Preview, PRODUCTION→production, inconnu → aucun lien) | `packages/application-access/src/navigation.ts` + GP/Colors/Tools/Réserves | Vitest (package, GP, Colors, Tools, Réserves) ; Playwright 3 modes, contrôle transversal « aucun `*.elsatia.fr` en Preview » |
| **A-09** Réserves → GP / autres apps | `apps/reserves/src/lib/selecteur-applications.ts`, `Coquille.tsx` | Playwright « GP → Réserves → GP », « Réserves : liens Preview » |
| **A-10** Réserves en local sur **3040** | `apps/reserves/package.json`, `20261003000103` (si valeur d'origine) | Playwright (Réserves servie sur 3040, Tools sur 3020) |
| **A-11** `url_preview` : RPC propriétaire seul, AAL2, HTTPS, `*.vercel.app`, journalisée, formulaire plateforme | `20261003000102_plateforme_url_preview_proprietaire_v1.sql`, `src/app/actions/multi-app.ts`, `/plateforme/applications` | pgTAP 30 cas A-11 ; Vitest action 16 ; Playwright « url_preview (A-11) » (refus `http`, `javascript:`, hôte hors liste ; délégué sans formulaire) |
| **TOOLS_ENV** strict `local` / `preview` / `production` | `apps/tools/scripts/verify-public-env.mjs`, `site.ts` | builds Tools **local ✅ preview ✅ production ✅** ; refus ✅ : valeur inconnue (`staging`), `VERCEL_ENV=preview` + `production`, Preview vers `app.elsatia.fr` |

### Logout — `DECISION_REQUIRED_LOGOUT_SCOPE` (comportement conservé)

GP (`src/app/actions/auth.ts`), Colors (`apps/colors/src/app/actions.ts`) et Réserves appellent toujours
`supabase.auth.signOut()` **sans option** = portée `global` de supabase-js : se déconnecter d'une application ferme les
sessions du compte dans les autres (et sur les autres appareils). Tools et Studio sont en `scope: "local"`.
**Aucune modification** dans ce lot ; la recette Playwright fige le contrat actuel (« logout : retour à /login ;
déconnexion globale ») et devra être adaptée si la décision change.

## PRODUCTION_BRIDGES

### B1 — Analyse

**Pourquoi `20260921000300` échoue** (reproduit ici sur la Production 210 synthétique, cible V9.1 `24a0c2e9`, sans
pont) :

```
❌ dry-run : échec 20260921000300_correctif_perf_rls_lignes_devis_factures.sql
ERROR:  Les lignes d'une facture émise ne peuvent plus être modifiées
CONTEXT:  PL/pgSQL function trg_lignes_factures_brouillon_only() line 10 at RAISE
```

300 ajoute `entreprise_id` aux lignes de devis / factures puis la backfille par `UPDATE`. En Production 210, cinq
triggers utilisateur sont actifs sur ces deux tables (relevé sur la base 210 reconstruite) :

| Table | Trigger | Effet sur l'UPDATE de 300 |
|---|---|---|
| `lignes_factures` | `lignes_factures_brouillon_only` (BEFORE) | **refuse** toute ligne d'une facture non brouillon → **UPG-P0-1** |
| `lignes_factures` | `recalc_facture_apres_ligne` (AFTER) | recalcul complet de la facture par ligne → coût quadratique (**UPG-LOCK-1**), `factures.updated_at` réécrit (**UPG-P3-1**) |
| `lignes_devis` | `recalc_devis_apres_ligne` (AFTER) | idem devis |
| `lignes_devis` | `synchroniser_taches_ligne_devis` (AFTER) | resynchronisation des tâches par ligne |
| `lignes_devis` | `verrou_lignes_devis_accepte` (BEFORE) | ne refuse que sous identité membre (`est_membre_actif`) — sans effet en migration |

Les ponts v2 du harnais (`20260921000298` / `…0399`) neutralisaient quatre de ces triggers **autour** de 300. Ils ne
peuvent **pas** être intégrés tels quels : leurs versions s'insèrent **avant** des migrations déjà appliquées en Preview
(299, 300, 301…), ce que la mission interdit (B2). Analyse complémentaire : leur garde `to_regclass(...) is not null and
exists (select … from supabase_migrations.schema_migrations …)` échoue sur une base **sans** ledger Supabase
(PL/pgSQL prépare toute l'expression) — défaut retrouvé ici sur notre propre pont par le rejeu `rebuild_db.sh`, corrigé
(SQL dynamique, commit `8bcb71e`).

### B2 — Numérotation et conception retenue

Contrainte : aucune version antérieure à `20261002001302` (dernière V9.1), aucune version antérieure à une migration
appliquée en Preview. Conséquence logique : un pont **post-V9.1** est appliqué, dans l'ordre lexical, **après** 300 —
il ne peut donc pas protéger 300 s'il est joué dans l'ordre. Solution : **un pont de phase 0**, versionné après tout le
train, que la Production historique applique **en premier**, et qui rend 300 inoffensive au lieu de la contourner.

| Fichier | Rôle | Fresh / Preview / V9.1 | Production 210 |
|---|---|---|---|
| `20261003000201_pont_upgrade_prod_phase0_lignes_entreprise_v1.sql` (marqueur `-- elsatia:upgrade-phase0`) | Ajoute `entreprise_id` **nullable sans contrainte** aux deux tables de lignes et y copie la valeur du parent, triggers utilisateur des deux tables neutralisés **dans sa seule transaction** puis réactivés à l'identique avant COMMIT (vérifié dans la transaction : sinon exception) | **No-op** : 300 au ledger, ou colonnes déjà `NOT NULL` | Appliqué en **phase 0**, avant `db push --include-all`. Ensuite 300 : `add column if not exists` sans effet, et son `UPDATE … where entreprise_id is distinct from parent` **ne touche plus aucune ligne** → aucun trigger ne se déclenche ; 300 pose `NOT NULL`, FK composite, index, trigger `fixer_*`, policies comme sur un fresh |
| `20261003000202_pont_upgrade_prod_controle_lignes_v1.sql` | Contrôle final idempotent : réactive les triggers métier des lignes s'ils ont été désactivés à la main (ex. ponts 298/399 jamais intégrés), **refuse** (transaction annulée) une `entreprise_id` absente, nullable ou ≠ parent | No-op (vérification seule) | Appliqué en dernier, dans l'ordre lexical |

Préconditions : le pont ne fait **rien** si 300 est au ledger ; sinon il ne transforme que `entreprise_id` des lignes,
valeur portée par le parent (aucun total, aucune tâche, aucun verrou métier n'en dépend). **Données transformées** :
uniquement `lignes_devis.entreprise_id`, `lignes_factures.entreprise_id` (colonnes nouvelles, NULL → valeur du parent) —
exactement ce que 300 aurait écrit. **Locks** : `ACCESS EXCLUSIVE` sur les deux tables de lignes pendant sa transaction
(mesures §LOCK_TIMES). **Idempotence** : rejoué, il ne retouche que les lignes non préparées (0 au 2ᵉ passage, PS3).
**Ordre** : phase 0 (201) → 181 migrations historiques en attente dans l'ordre lexical (13 hors ordre, `--include-all`)
→ satellites 101–103 → 202. Aucun trigger ne reste désactivé entre deux migrations (contrairement aux ponts v1/v2, qui
laissaient les triggers coupés de 298 à 399).

**Effet sur les quatre cibles** (prouvé, §FRESH_INSTALL, §V9_1_UPGRADE, §PROD_210_UPGRADE) :

| Cible | Effet des ponts | Preuve |
|---|---|---|
| 1. fresh install (ledger Supabase) | 201 et 202 appliquées en dernier, sans effet | fresh du harnais 396/396, schéma = référence |
| 1 bis. fresh sans ledger (rejeu psql local) | idem (correctif SQL dynamique) | `rebuild_db.sh` 396/396 ; PS1 |
| 2. V9.1 déjà construite, peuplée (forme Preview) | sans effet : empreinte lignes / devis / factures / triggers **identique** | PS2 |
| 3. upgrade Production 210 | 300 ne touche plus aucune ligne ; aucune facture émise refusée ; `updated_at` intacts | harnais 500 et 100 000 |
| 4. Preview déjà au-delà de 300 | 201 : « 20260921000300 déjà au ledger — aucune action » ; 202 : vérification | PS2 (même cas) |

**Procédure Production à deux temps** (runbook `docs/runbooks/ELSATIA_PRODUCTION_V9X_ROLLBACK.md` §2 bis et preflight) :
la CLI applique toujours les versions en attente dans l'ordre ; pour appliquer 201 seule, l'opérateur pousse en
**phase 0** un répertoire de migrations = les 210 fichiers historiques + 201 (une seule version en attente, sans
`--include-all`), puis en **phase principale** le train complet avec `--include-all`. Le preflight l'impose :
`--phase 0` n'autorise que les ponts de phase 0 sur un ledger source ; `--phase principale` (défaut) **refuse** tant que
201 n'est pas au ledger (P9) et tant que la sonde lecture seule mesure des lignes de factures émises non préparées
(`bloquant_lignes_factures_emises_non_preparees`, P7). Si la phase principale était lancée sans phase 0 malgré tout :
300 échoue comme aujourd'hui (transaction annulée, ledger cohérent) — l'opérateur revient à la phase 0.

Phase 0 et ancien code : 201 n'ajoute qu'une colonne **nullable** non lue par `fcdd4e7c` ; elle reste compatible avec
l'ancien code, mais doit être jouée **dans la fenêtre** (trafic coupé), juste avant la phase principale : une ligne de
facture créée par l'ancien code entre les deux phases serait sans `entreprise_id` et retouchée par 300 (la sonde la
détecte).

### Harnais adapté (sans `--bridge`)

- `scripts/upgrade/lib/classify.py` : les ponts sont lus **dans l'arbre cible** (`*_pont_upgrade_*`) ; les fichiers
  marqués `-- elsatia:upgrade-phase0` passent en tête du plan d'une base historique ; le fresh de comparaison reste en
  ordre lexical (ce qui prouve le no-op sur fresh).
- `production-to-v9x.sh` : plan qualifié avec `ponts` (sha256, `phase0`), `preconditions_phase_principale` ;
  `lignes_factures_emises` n'est plus bloquante quand un pont de phase 0 la couvre.
- `preflight.mjs` : **P9** (phase), P5 accepte `source ∪ phase 0 ∪ préfixe`, P6 vérifie les ponts **à l'octet** dans
  la cible. Tests : **39/39** (`npm run test:production-v9x-preflight`, +7 cas phase 0).
- Nouveaux outils : `matrice-essai.sh` (B4), `audit-admin-233.sh` (B5), `ponts-scenarios.sh` (PS1–PS4).

### B4 — UPG-P0-2 (contrainte d'essai de `20260816000204`)

`scripts/upgrade/matrice-essai.sh` : 20 formes réelles possibles en Production 210 (avant 231 : `abonnement_essai_debut`
NULL ; après 231 : debut posé par le trigger, fin éventuellement réécrite par le webhook Stripe de `fcdd4e7c`), chacune
seule sur une base 210 jetable, upgradée par le plan réel. Résultat (`witnesses/…/matrice-essai.tsv`) :

| Cas | Ère | Statut | Forme | sonde `hors_fenetre` / `perpetuel` / `tronque` / `tronque_expire` | Upgrade | Dates après | État GP après |
|---|---|---|---|---|---|---|---|
| A1 | pre231 | essai | essai sans date, ancien (« essai perpétuel ») | 0 / 1 / 0 / 0 | OK | 2026-07-05 → 2026-08-04 | suspended |
| A2 | pre231 | essai | essai sans date, récent | 0 / 0 / 0 / 0 | OK | 2026-09-23 → 2026-10-23 | trial |
| A3 | pre231 | essai | essai, fin passée dans la fenêtre | 0 / 0 / 0 / 0 | OK | 2026-08-04 → 2026-09-03 | suspended |
| A4 | pre231 | essai | essai, fin future dans la fenêtre | 0 / 0 / 0 / 0 | OK | 2026-09-23 → 2026-10-23 | trial |
| A5 | pre231 | essai | essai Stripe, fin future > création + 30 (encore future après troncature) | 0 / 0 / 1 / 0 | OK | 2026-09-13 → 2026-10-13 | trial |
| A6 | pre231 | essai | essai Stripe, fin future > création + 30 (passée après troncature) | 0 / 0 / 1 / 1 | OK | 2026-08-24 → 2026-09-23 | suspended |
| A7 | pre231 | essai | fin d'essai antérieure à la création | 1 / 0 / 0 / 0 | **ÉCHEC 204** (CHECK `entreprises_essai_dates_coherentes`) | — → — | — |
| A8 | pre231 | actif | legacy actif, aucune date (offre historique) | 0 / 0 / 0 / 0 | OK | 2025-08-29 → 2025-09-28 | active |
| A9 | pre231 | actif | legacy actif, vieil essai Stripe de 14 j | 0 / 0 / 0 / 0 | OK | 2025-08-29 → 2025-09-12 | active |
| A10 | pre231 | actif | actif, essai Stripe ancien > 30 j | 0 / 0 / 1 / 0 | OK | 2026-06-25 → 2026-07-25 | active |
| A11 | pre231 | annule | annulé, aucune date | 0 / 0 / 0 / 0 | OK | 2025-12-07 → 2026-01-06 | cancelled |
| A12 | pre231 | suspendu | suspendu, fin passée | 0 / 0 / 0 / 0 | OK | 2026-03-17 → 2026-04-16 | suspended |
| B1 | post231 | essai | essai trigger 231, fin future | 0 / 0 / 0 / 0 | OK | 2026-09-23 → 2026-10-23 | trial |
| B2 | post231 | essai | essai trigger 231, fin passée | 0 / 0 / 0 / 0 | OK | 2026-08-24 → 2026-09-23 | suspended |
| B3 | post231 | essai | essai : fin réécrite par Stripe > debut + 30 (future) | 1 / 0 / 0 / 0 | **ÉCHEC 204** (CHECK `entreprises_essai_dates_coherentes`) | — → — | — |
| B4 | post231 | actif | converti après un essai Stripe > debut + 30 | 1 / 0 / 0 / 0 | **ÉCHEC 204** (CHECK `entreprises_essai_dates_coherentes`) | — → — | — |
| B5 | post231 | annule | annulé après un essai Stripe > debut + 30 | 1 / 0 / 0 / 0 | **ÉCHEC 204** (CHECK `entreprises_essai_dates_coherentes`) | — → — | — |
| B6 | post231 | essai | debut posé, fin effacée | 0 / 0 / 0 / 0 | OK | 2026-09-23 → 2026-10-23 | trial |
| B7 | post231 | actif | fin antérieure au début | 1 / 0 / 0 / 0 | **ÉCHEC 204** (CHECK `entreprises_essai_dates_coherentes`) | — → — | — |
| B8 | post231 | suspendu | suspendu, fenêtre exacte | 0 / 0 / 0 / 0 | OK | 2026-08-29 → 2026-09-28 | suspended |

Constats :

1. La sonde lecture seule **prédit exactement** les échecs : `bloquant_essai_hors_fenetre` = 1 pour les 5 cas en échec,
   0 pour les 15 autres.
2. Les cas bloquants sont **plausibles** pour toute entreprise créée **après 231** passée par un Checkout Stripe avec
   essai (B3 essai en cours, B4 converti, B5 annulé) : Stripe pose `trial_end` à partir de la date de Checkout, pas de
   la création de l'entreprise.
3. Cas nouveau, **non bloquant pour la migration mais coupant l'accès** : A6 (avant 231, essai Stripe en cours, fin > création
   + 30 j) — 204 tronque la fin à création + 30, déjà passée → `etat_commercial_gestion_pro = suspended` à l'upgrade
   (803) alors que Stripe considère l'essai en cours. Nouvelle précondition **`bloquant_essai_tronque_expire`**
   (sonde + plan).
4. **Aucune migration générique** : toute règle (tronquer la fin, reculer le début, ignorer les statuts non-essai)
   réécrit l'historique d'abonnement d'une entreprise réelle ou change son accès — rien d'indiscutable. Livré :
   sonde lecture seule (matrice détaillée statut × forme de dates + 3 préconditions bloquantes) et matrice de preuve.
   → **`DECISION_REQUIRED_UPG_P0_2`**.

### B5 — Administrateur plateforme de `20260825000233`

`233` insère `julien@elsatia.fr` (rôle `total`, `on conflict do nothing`). Jamais appliquée en Production 210 : elle
le sera pendant l'upgrade. `scripts/upgrade/audit-admin-233.sh` (4 scénarios Auth, plan réel) :

| Scénario | `julien@elsatia.fr` après upgrade | `julien.gregurec@gmail.com` après upgrade | Revendication propriétaire |
|---|---|---|---|
| S0 aucun compte Auth | `total`, actif=false, `en_attente`, propriétaire, sans UID ; admin = **f** | actif=false, `en_attente` ; admin = **f** | refusée (« Compte propriétaire non vérifié ») |
| S1 comptes Auth confirmés, sans MFA | actif=false, `rattachee_non_confirmee`, UID rattaché ; admin = **f** (AAL1 et AAL2) | actif, `active` ; admin = **t** | refusée (« Authentification forte requise ») |
| S2 compte Auth non confirmé | `rattachee_non_confirmee` ; admin = **f** | `en_attente` ; admin = **f** | refusée (« Compte propriétaire non vérifié ») |
| S3 = S1 + facteur MFA vérifié | avant : admin = **f** ; **après revendication AAL2 : admin = t** | actif ; admin = **t** | acceptée pour le propriétaire ; **refusée** pour tout autre compte (« Ce compte n'est pas le propriétaire ELSATIA ») |

Témoin : `docs/qualification/witnesses/platform-readiness-v9-1/b5-audit-233/audit.txt`.

Comportement : la ligne **n'accorde aucun droit** après upgrade — `235` rend inactive toute ligne sans compte Auth
(et rattache par email exact sinon), `236` force `julien@elsatia.fr` à `en_attente` / `rattachee_non_confirmee`
(`actif = false`), `266` la désigne **propriétaire** ; elle ne devient effective que par
`plateforme_proprietaire_revendiquer()` sous l'identité de ce compte, email confirmé, **facteur MFA vérifié** et session
AAL2 (S3 : revendication acceptée ; tout autre compte refusé). Pendant l'upgrade (entre 233 et 235) la fonction
`est_plateforme_admin()` déjà remplacée par `20260816000202` ne l'accorde pas non plus (mesuré : `f`).

Impact upgrade (constat à porter au cutover) : `julien.gregurec@gmail.com`, administrateur `total` en 210, reste actif
**seulement** s'il existe un compte Auth de même email (S1/S3) ; sinon `235` le désactive (S0/S2).

Spécificité : l'étape est nominative dans **trois** migrations déjà appliquées en Preview (233, 236, 266) — non
modifiables. La rendre non spécifique à une personne passerait par une migration post-V9.1 (ex. désignation du
propriétaire par un paramètre de cutover ou un RPC de bootstrap à usage unique) : changement de modèle d'identité
plateforme, non fait. → **`DECISION_REQUIRED_UPG_SEC_1`** (confirmer le propriétaire `julien@elsatia.fr` et le maintien de
`julien.gregurec@gmail.com`, ou décider d'une désignation générique).

## FRESH_INSTALL

| Contrôle | Résultat |
|---|---|
| `rebuild_db.sh pr_fresh` (rejeu psql, **sans** ledger Supabase) | **396/396** (avant correctif SQL dynamique : échec du pont 201 → défaut corrigé, commit `8bcb71e`) |
| Fresh du harnais (ledger Supabase, profil ACL Supabase) | 396/396 ; 201 : « 20260921000300 déjà au ledger — aucune action » ; référence du schéma et de l'inventaire sécurité |
| pgTAP complet (`pgtap-run-v3.sh pr_fresh`, 177 fichiers) | **168/177 propres, 9 037 `ok`** — identique au rapport satellites V2 ; les 9 non propres sont les mêmes que V9 / hardening / satellites (attestation pgsodium, 7 suites Studio du projet partagé, Tools cloud sync : dépendances absentes du banc) |
| `satellites_preview_readiness_v1` | **45/45** |
| PS1 (`ponts-scenarios.sh`) | 396/396 sans ledger, ponts compris |
| Fixture pilote satellites sur fresh 396 | assertions **23/23** (préparation de la recette navigateur) |

## V9_1_UPGRADE

Base **V9.1 construite et peuplée** (forme Preview : 391 migrations de `24a0c2e9` avec ledger Supabase + seed
`PILOTE-BTP-V1`, dont **9 lignes de factures émises**), puis application des 5 migrations post-V9.1 dans l'ordre (101, 102,
103, 201, 202) — PS2 :

| Mesure | Résultat |
|---|---|
| Ledger | 391 → **396** |
| Pont 201 | « 20260921000300 déjà au ledger — aucune action » (aucun ALTER, aucun verrou fort) |
| Pont 202 | vérification seule (aucune réactivation nécessaire) |
| Empreinte lignes de devis / factures + `devis/factures.updated_at` + montants + état des triggers | **identique** avant / après (`73718c0b…`) |

Même cas que la Preview hébergée déjà au-delà de 300 (cible 4) : les ponts n'y écrivent rien.

## PROD_210_UPGRADE

Harnais `scripts/upgrade/production-to-v9x.sh` **sans `--bridge`**, cible = SHA **`2cd5ca6eea19d03371f0eca38dfaf689269b174a`** (396 migrations ; arbre
`supabase/migrations` = `b7fd9766`), source = Production 210 synthétique (`5777abb`, profil ACL Supabase, jeu historique
complet + remédiation UPG-P1-1 simulée sur la copie locale).

| Contrôle (palier 500, run final, `--publish-plan`) | Résultat |
|---|---|
| Classification | 210 déjà appliquées ; **186** en attente (13 hors ordre → `--include-all`) ; **phase 0 : `20261003000201`** ; 0 inconnue au ledger |
| Dry-run | 186 migrations, 16 s, base de travail intacte |
| Application | **186 en 25 s**, ledger **396** = fichiers de la cible |
| Schéma upgradé = fresh | ✅ (seul écart toléré : ordre de colonnes de `entreprises`, préexistant — 231 en Production) |
| **ZERO_PERTE** | ✅ 153 tables / 56 188 lignes comparées clé par clé, colonne par colonne ; P0 = 0 ; **7** tables différentes, toutes déclarées |
| **ACL_DIFF = 0** | ✅ fermeture upgradé = fresh cible, 15 familles, 12 401 lignes |
| **RLS_DIFF = 0** | ✅ (inclus dans la fermeture : drapeaux RLS, policies) ; 0 table existante modifiée en RLS ; 120 tables nouvelles, toutes RLS |
| Avant → après | 0 signal bloquant |
| **OFFRES_INTACTES** (`checks/legacy_offers.test.sql`) | ✅ **24/24** : essentiel v0 **59 €**, pro v1 **129 €** (annuel 1 238,40), premium v0 **249 €** annulé, mini v1 contrat négocié **69 €** non remappé ; aucun contrat sur les versions transitoires 69/199/399 |
| Isolation (`checks/security_isolation.test.sql`) | ✅ 21/21 |
| Continuité d'accès | 19 appartenances ; 6 pertes **toutes déclarées** (essai expiré appliqué en base par 803) ; 1 réduction déclarée (PL-05) ; 0 bloquant |
| Interruptions (`interruption.sh`, sans `--bridge`) | **9/9** : S1a/b coupure + reprise ; S2a/b panne dans 300 + reprise ; S3a/b ledger en retard ; **S4 ledger en avance détecté** (désormais dès `20261003000202`, qui refuse une `entreprise_id` absente) ; S5 restauration (153 tables, 0 erreur `pg_restore`) ; S6 131 idempotentes / 55 non idempotentes |
| Ponts | PS3 : phase 0 idempotente (1 400 + 1 040 lignes, puis 0 + 0), reprise du plan : 185 migrations, 0 trigger désactivé |
| Verdict harnais | **✅ UPGRADE QUALIFIÉ** — plan publié `scripts/upgrade/manifests/target-2cd5ca6e.json` (ponts sha256, phase 0, préconditions, classification mesurée au palier 100 000 sur le même arbre) |

**UPG-P3-1 résolu** : à 100 000, la référence sans pont v2 réécrit `updated_at` de **10 300 devis et 10 180 factures**
(déclaré) ; avec les ponts du train : **0** (seul changement factures : snapshot émetteur NULL → renseigné, 272/501).

**Preflight sur le vrai SHA** (`--depot` = checkout de `2cd5ca6e`, attestations **simulées**, projet fictif) —
`witnesses/…/preflight-demo/sortie.txt` :

| Étape | Ledger | Résultat |
|---|---|---|
| `--phase 0` | 210 | **PREFLIGHT OK** (P1–P9) : « appliquer UNIQUEMENT 20261003000201 » |
| `--phase principale` sans phase 0 | 210 | **REFUSÉ** P9 (pont absent du ledger) + P7 (`bloquant_lignes_factures_emises_non_preparees = 1040`) |
| phase 0 appliquée sur une copie de la 210 (sonde rejouée : 0) puis `--phase principale` | 211 | **PREFLIGHT OK** ; **P6 ✅** « 185 migration(s) en attente, toutes qualifiées » |

Le refus V1 « P6 ❌ plan qualifié AVEC ponts absents de la cible » a disparu : les ponts sont dans le train.

## LOCK_TIMES

Mesures réelles (verrous tenus par la transaction de chaque migration, VM locale 4 vCPU, PostgreSQL 16) — palier
**100 000 lignes / table critique (602 632 lignes)**, même source pour les deux runs :

| Mesure | Référence : V9.1 `24a0c2e9` + pont **v1** externe (le seul qui laisse passer 300 sans pont v2) | Train candidat, ponts **du train**, sans `--bridge` |
|---|---|---|
| Dry-run (toutes les migrations en attente) | **2 168 s** | **18 s** |
| Application | **2 174 s** (183 migrations) | **28 s** (186 migrations) |
| `20260921000300` | **2 149 s**, ACCESS EXCLUSIVE `lignes_devis` / `lignes_factures` (+ ShareRowExclusive devis / factures), **404 500** lignes touchées (cascade de recalcul) | **0,62 s**, ACCESS EXCLUSIVE lignes seulement, **0** ligne touchée |
| `20261003000201` (phase 0) | — | **1,63 s**, ACCESS EXCLUSIVE `lignes_devis` / `lignes_factures`, 201 440 lignes (le seul backfill) |
| `20261003000202` | — | 0,07 s, aucun verrou fort |
| Harnais complet (mur) | 1 h 37 min | 25 min 43 s |
| Classement verrous | — | SAFE 87 · CAUTION 98 · **MAINTENANCE_WINDOW_REQUIRED 1** (201 : règle « DML > 10 000 lignes sous verrou exclusif », pour 1,6 s) |
| Réversibilité | — | REVERSIBLE 55 · FORWARD_ONLY 78 · RESTORE_REQUIRED 53 |
| Mémoire | — | RSS client harnais 130 Mo |

Écart avec le rapport source (1 287 s → 23 s) : même ordre de grandeur et même conclusion ; la référence est plus lente
sur cette VM (2 174 s), l'application avec ponts comparable (28 s, +3 migrations satellites). Gain mesuré ici : **÷ 78** sur
l'application, **÷ 3 500** sur 300. Au palier 500 : 25 s (201 : 26 ms ; 300 : 34 ms, 0 ligne).

Le seul verrou long restant est donc celui de la **phase 0** (1,6 s à 100 000), joué dans la fenêtre de maintenance, trafic
fermé. Les CAUTION (verrous forts brefs sur des tables 210) restent à appliquer trafic fermé, `lock_timeout` positionné
(runbook inchangé). UPG-PERF-1 (lectures sous RLS ≈ ×2, planning d'autrui ×10–×20) est mesuré à l'identique et reste
non bloquant.

## CROSS_APP

Pile : PostgreSQL 16 (train 396 + seed pilote + fixture satellites, assertions 23/23), **PostgREST 12.2.3 officiel**,
passerelle auth de recette (AAL2 simulé pour `julien@elsatia.fr`, `support@sat.invalid`), 4 applications **compilées**
(`next start`) : GP 3000 (127.0.0.1), Colors 3010, Tools 3020, Réserves 3040 (localhost). Chromium 1194.
`tests/e2e/satellites-preview-readiness.spec.ts` :

| Mode | Résultat | Couvre |
|---|---|---|
| LOCAL | **10/10** | lanceur (Karim : Colors/Tools/Réserves, jamais Drone ni Production) ; navigation GP↔Colors (session par application, cookies hôte seul, aucun `Domain`) ; GP↔Réserves (A-09) ; Tools→GP/Colors ; même entreprise sans rôle (Belaid : lanceur vide, Colors et Réserves refusent à la connexion) ; droit **expiré** et droit **suspendu** ; **Drone** ; `url_preview` propriétaire (A-11) ; **`next=`** et en-tête **Host** ; **logout** (global, conservé) |
| PREVIEW simulée | **4/4** | lanceur GP → URL Preview du catalogue ; Colors → Preview GP, portail localhost masqué ; Réserves → Preview GP/Colors ; Tools build `preview` |
| PRODUCTION simulée | **2/2** | lanceur GP → hôtes canoniques, Réserves (sans `url_production`) non cliquable ; Tools build `production` |
| WebKit | NOT_PROVEN | binaire absent, `playwright install` proscrit |

Applications : Vitest **GP 2 924** (+1 `it.fails` attendu SEC-6, 193 ignorés intégration), **Colors 436/436**,
**Tools 2 174/2 174**, **Réserves 239/239** ; `typecheck` ✅ (4 apps) ; `lint` 0 erreur (15 avertissements
préexistants) ; builds GP ✅, Colors ✅, Réserves ✅ (nom canonique seul), Tools local ✅ preview ✅ production ✅.

## ENV

| Contrôle | Résultat |
|---|---|
| `verify:env-manifest` | ✅ (après retrait d'une lecture `UPG_SOURCE_MANIFEST` non déclarée importée avec le harnais) |
| `test:env-manifest` | ✅ |
| `test:preview-pack` | ✅ |
| `verify:train-expectations` | ✅ — attendus resynchronisés : **396**, dernière `20261003000202`, DB verify 39 contrôles (`ELSATIA_PREVIEW_DB_VERIFY_V1.sql`, pack d'exécution, runbook V3) |
| `verify:migrations` / `test:migration-targets` | ✅ 396, noms et horodatages uniques |
| `verify:secrets` | ✅ |
| `test:seeds` | ✅ |
| Réserves | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` canonique ; alias `…_ANON_KEY` = AVIS de transition ; divergence = refus |
| Tools | `NEXT_PUBLIC_TOOLS_ENV` ∈ {local, preview, production} (+ natifs existants) ; inconnu / Preview non déclarée / Preview → Production : build refusé |

## DECISIONS_REQUIRED

| Code | Sujet | Choix conservateur appliqué dans ce lot | À décider |
|---|---|---|---|
| `DECISION_REQUIRED_LOGOUT_SCOPE` | GP / Colors / Réserves : `signOut()` global | inchangé (global) | local par application, ou global |
| `DECISION_REQUIRED_UPG_P0_2` | entreprises dont les dates d'essai violent `entreprises_essai_dates_coherentes` (Stripe `trial_end` > debut + 30, fin < début) : 204 échoue | aucune régularisation ; sonde + préconditions bloquantes ; preflight refuse | règle métier de régularisation, entreprise par entreprise, **avant** la fenêtre |
| `DECISION_REQUIRED_UPG_P0_2_TRONCATURE` | essai Stripe en cours tronqué par 204 → accès coupé (A6) | précondition `bloquant_essai_tronque_expire` | prolonger, convertir ou accepter la coupure |
| `DECISION_REQUIRED_UPG_P1_1` (inchangé) | « essai perpétuel » (statut essai sans dates) | précondition bloquante ; SQL de régularisation **proposé** seulement | régulariser l'entreprise ELSATIA et les autres |
| `DECISION_REQUIRED_UPG_SEC_1` | `julien@elsatia.fr` propriétaire (233/236/266) ; `julien.gregurec@gmail.com` actif seulement si compte Auth | inchangé (inactif jusqu'à revendication MFA) | confirmer, ou désignation générique par migration post-V9.1 |
| Préexistants (satellites) | domaine Preview personnalisé pour `url_preview` ; retrait de l'alias ANON_KEY ; statut GP de la fixture | inchangés | cf. rapport satellites V2 §9 |

## Reproduire

```bash
git checkout integration/elsatia-platform-readiness-v9-1
apt-get install -y postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl time && service postgresql start
npm ci && (cd apps/colors && npm ci) && (cd apps/tools && npm ci) && (cd apps/reserves && npm ci) && (cd tests/e2e/colors-pile-locale && npm ci)
# Fresh + pgTAP
scripts/local-postgres-bootstrap/rebuild_db.sh pr_fresh && scripts/qualification/pgtap-run-v3.sh pr_fresh
# Production 210 synthétique → train candidat, SANS --bridge
scripts/upgrade/build-source.sh h210_v500_rem --vol 500 --remediation scripts/upgrade/sql/remediation_essai_perpetuel_PROPOSITION.sql
scripts/upgrade/production-to-v9x.sh --target-sha <SHA> --target-migration-count 396 --source-db h210_v500_rem --out /tmp/upg/final --publish-plan
# 100 000 lignes / table critique
scripts/upgrade/build-source.sh h210_vol100000 --vol 100000 --remediation scripts/upgrade/sql/remediation_essai_perpetuel_PROPOSITION.sql
scripts/upgrade/production-to-v9x.sh --target-sha <SHA> --target-migration-count 396 --source-db h210_vol100000 --sans-sonde --out /tmp/upg/vol
# Ponts : fresh sans ledger, V9.1 peuplée, idempotence, contrôle final ; interruptions ; matrice d'essai ; audit 233
scripts/upgrade/ponts-scenarios.sh --target-sha <SHA> --base-v91 24a0c2e993ec0836b492ea72f27ed7dc347a20fa --source-210 h210_v500_rem --out /tmp/upg/ps
scripts/upgrade/interruption.sh h210_v500_rem <SHA> 396 /tmp/upg/inter
scripts/upgrade/build-source.sh h210_nodata --sans-donnees
scripts/upgrade/matrice-essai.sh --target-sha <SHA> --source h210_nodata --out /tmp/upg/matrice
scripts/upgrade/audit-admin-233.sh --target-sha <SHA> --source h210_nodata --out /tmp/upg/audit233
npm run test:production-v9x-preflight
# Navigateur : voir docs/qualification/ELSATIA_SATELLITES_PREVIEW_READINESS_V2.md §12 (mêmes variables, ports 3000/3010/3020/3040)
```
