# ELSATIA — Carte de convergence Preview (V1)

**Date** : 2026-09-20
**Mission** : lecture seule. Aucun merge, cherry-pick, rebase, migration appliquée, déploiement Preview/Production n'a été effectué pour produire ce rapport. Toutes les commandes utilisées sont `git log`/`show`/`diff`/`ls-tree`/`merge-base`/`rev-list` contre des refs `origin/*` déjà récupérées (`git fetch --all --prune`), plus la lecture de fichiers versionnés. Aucune branche n'a été créée à distance, aucun fichier `supabase/migrations` n'a été modifié.
**Portée** : 211 branches distantes + 1 tag (`prelaunch-freeze-2026-08`) inventoriées ; 99 retenues comme « trains qualifiés » pour l'analyse d'ascendance fine (nommées dans la mission, ou rattachées par mots-clés GP/perf/commercial/access/security/env/DR/apps/DR) ; ~40 analysées en profondeur (commits uniques, migrations, fichiers).

**Découverte clé, avant tout le reste** : ce dépôt contient déjà, sur la branche `claude/awesome-einstein-tyfo4k` (poussée aujourd'hui à 22:21), un rapport de répétition générale quasi-identique à cette mission : `docs/qualification/ELSATIA_PREVIEW_RELEASE_REHEARSAL_V1.md`. Il a été produit par une session Claude Code autonome antérieure le même jour, a comparé 24 branches/tags, a lui-même conclu `FINAL_PREVIEW_CONVERGENCE_BASE = DECISION_REQUIRED`, et a **indépendamment constaté que `integration/gp-external-pilot-readiness-v1@f2917b54` n'existe pas**. Cette carte confirme ce constat par une vérification indépendante (fetch complet + `git cat-file`) et l'étend : périmètre Commercial/Access/Apps non couvert par cette répétition, carte complète des collisions de migrations, et évolution du dépôt dans les ~70 minutes qui ont suivi ce rapport (4 branches nouvelles ou avancées : GP pilot closure, perf capacity, env-manifest, la répétition elle-même).

Ce document est **auto-suffisant** mais cite largement ce rapport antérieur (marqué **[REHEARSAL]**) plutôt que de dupliquer un travail déjà fait et vérifié.

---

## 0. BRANCHES NOMMÉES DANS LA MISSION — CE QUI EXISTE RÉELLEMENT

| Branche demandée | Existe sur `origin` ? | Équivalent réel le plus proche |
|---|---|---|
| `integration/gp-external-pilot-readiness-v1` | **NON** | `integration/gp-external-pilot-closure-v1` (nom réel : *closure*, pas *readiness*) |
| `integration/gp-v1.1-converged-train-v1` | **NON** | Aucun équivalent direct ; candidats les plus proches : `release/gp-v1-rc`, `feat/elsatia-commercial-canonical-r1-r2-r3-v1` |
| `perf/gp-capacity-readiness-v1` | **OUI** | — (HEAD `1669e5c`) |
| `integration/elsatia-commercial-convergence-v1` | **NON** | `integration/elsatia-ecosystem-train-v3-commercial-platform-v1`, `release/commercialisation-v1` |
| `fix/app-access-convergence-v1` | **NON** | Aucun équivalent trouvé (aucune branche ne combine "app"+"access"+"convergence") |
| `fix/colors-shared-auth-access-night-v1` | **NON** | Aucun équivalent trouvé ; le plus proche par thème : `fix/colors-auth-callback-csp-p1-v2` |
| `fix/studio-signup-closed-v1` | **NON** | `feat/elsatia-studio-v1` existe, mais son signup est **ouvert**, pas fermé (voir §APPLICATIONS) — le nom demandé décrit l'inverse de l'état réel |
| `feat/env-manifest-canonical-v1` | **OUI** | — (HEAD `5326118`, le commit le plus récent de tout le dépôt) |
| `claude/preview-rehearsal-security-fixes-v1` | **OUI** | — (HEAD `bb42e1d`) |
| `release/tools-store-preflight-v1` | **OUI** | — (HEAD `bf27e78`) |
| Commit `f2917b54` (§5 GP pilot) | **N'EXISTE NULLE PART** | Non valide (`git cat-file -e` échoue), confirmé par deux vérifications indépendantes (celle-ci et **[REHEARSAL]**) |

**6 des 10 branches nommées n'existent pas.** Le reste de ce document travaille avec les branches réelles et signale chaque fois qu'un nom de la mission ne correspond à rien.

---

## 1. BRANCH INVENTORY

211 branches distantes au total. Table des branches les plus significatives (hubs d'ascendance, tips de train, branches nommées) — `Poussée ?` est toujours YES puisque toute branche listée existe sur `origin`.

| Branche | HEAD | Base (merge-base) | Commits uniques /main | Migrations | Statut |
|---|---|---|---:|---:|---|
| `main` | `4d92ddb` (2026-07-29) | — | 0 | 178 | Référence figée, **très en retard** (7 semaines) sur tout le reste |
| `release/commercialisation-v1` | `fcdd4e7` (2026-08-26) | main | 240 | 211 | Hub #1 — ancêtre de 84/98 candidats |
| `feat/elsatia-canonical-integration-preprod-v1` | — (2026-09-02) | commercialisation-v1 | — | — | Tête de la lignée « commercial-canonical » |
| `feat/elsatia-commercial-canonical-r1-r2-r3-v1` | `996be15` (2026-09-05) | commercialisation-v1 | 291 | 263 | Hub #2 — ancêtre de 55/98 candidats ; **pas** le tip le plus large de sa propre lignée (voir §2) |
| `feat/colors-commercial-readiness-v1` | `38d871c` (2026-09-09) | r1-r2-r3 | 378 | 278 | Descend de r1-r2-r3, superset commercial (Colors) |
| `integration/elsatia-ecosystem-train-v3-commercial-platform-v1` | `59e960a` (2026-09-09) | colors-commercial-readiness | 370 | 278 | Tip commercial le plus large identifié |
| `release/tools-store-preflight-v1` | `bf27e78` (2026-09-07) | r1-r2-r3 | 361 | 263 | **`WORKING_REHEARSAL_BASE`** retenue par **[REHEARSAL]** — la plus large base « stable » |
| `claude/preview-rehearsal-security-fixes-v1` | `bb42e1d` (2026-09-20 22:18) | tools-store-preflight-v1 | 362 | 264 | Correctifs sécurité isolés, non fusionnés |
| `claude/awesome-einstein-tyfo4k` | `6bf3a50` (2026-09-20 22:21) | preview-rehearsal-security-fixes-v1 | 2 | 178¹ | Doc-only : porte le rapport **[REHEARSAL]** |
| `feat/env-manifest-canonical-v1` | `5326118` (2026-09-20 23:13) | r1-r2-r3 (**pas** tools-store-preflight-v1) | 374 | 278 | Fork séparé du hub #2, **le commit le plus récent du dépôt** |
| `feat/elsatia-canonical-integration-r73-v1` | `24c944d` (2026-08-28) | commercialisation-v1 | 258 | 224 | Tête de la lignée « r73 / colors-preflight » — **lignée séparée**, pas descendante de r1-r2-r3 |
| `feat/elsatia-canonical-final-r73-v1` | `e65fc05` (2026-09-02) | canonical-integration-r73 | 277 | 242 | Tip UI/nav de la lignée r73 |
| `integration/colors-predeploy-final-v1` | `77c6f4c` (2026-09-06) | canonical-integration-r73 (via `fix/colors-security-p1-closure-v1`) | 272 | 228 | Tip Colors de la lignée r73 — **diverge** de `integration/colors-pilot-readiness-v1` |
| `release/gp-v1-rc` | `8caef21` (2026-09-14) | commercialisation-v1 | 247 | 240 | Hub #3 « gp-release » — lignée séparée |
| `integration/gp-external-pilot-closure-v1` | `f602a94` (2026-09-20 22:29) | gp-v1-rc | 253 | 250 | Fermeture pilote externe GP — **diverge** de perf-capacity-readiness (voir §4/§5) |
| `perf/gp-capacity-readiness-v1` | `1669e5c` (2026-09-20 22:25) | gp-v1-rc | 248 | 245 | Qualification perf GP — **diverge** de gp-external-pilot-closure |
| `integration/colors-pilot-readiness-v1` | `a376984` (2026-09-10) | r1-r2-r3 | 389 | 279 | Tip Colors le plus avancé, **mais** non-superset de `colors-predeploy-final-v1` |
| `feat/elsatia-studio-v1` | `214d47f` (2026-09-13) | `codex/multi-app-convergence-v1` (**avant** commercialisation-v1) | 280 | 260² | Fork le plus précoce de tous — n'a **aucun** correctif commercial/sécurité/access postérieur |
| `integration/gp-postcutover-precommercial-ops-v1` | `4266ba6` (2026-09-06) | r1-r2-r3 | 300 | 265 | « Alternative » citée par **[REHEARSAL]** si la story GP pilote doit primer |
| `codex/elsatia-preprod-db-e2e-rollback-v1` | `a354d13` (2026-09-02) | r1-r2-r3 | 262 | 253 | Seule preuve E2E DR **réellement exécutée** (locale) |
| `docs/gp-cutover-documentation-closure-v1` | `70e11b9` (2026-09-06) | r1-r2-r3 | 295 | 263 | Runbook cutover consolidé (chaîne linéaire, voir §11) |

¹ `claude/awesome-einstein-tyfo4k` ne touche aucune migration (doc-only) ; le compte de 178 reflète l'hérédité de son parent au moment du merge-base avec main, pas son propre contenu.
² Convention de nommage différente (voir §4) — non comparable directement aux autres colonnes « Migrations ».

Les 211 branches complètes et leurs métadonnées (HEAD, date, ahead/behind vs `main`) ont été extraites programmatiquement ; celles omises ci-dessus sont soit strictement absorbées par une branche listée, soit hors du périmètre thématique de la mission (ex. `feat/tools-trace-library-*`, `feat/reserves-v1/v2-*` antérieurs, `docs/preserve-*`, `audit/elsatia-*-architecture-*`).

---

## 2. ANCESTRY GRAPH

**Fait structurant, vérifié par `git merge-base --is-ancestor` sur les 99×98 paires du train qualifié (aucune déduction par nom de branche)** :

```
main (4d92ddb)
 └─ fix/security-publishable-key-migration
     └─ chore/security-remove-supabase-legacy-env
         └─ codex/tarifs-v2-app-preview
             └─ codex/tarifs-v2-cta
                 └─ codex/multi-app-convergence-v1
                     ├─→ feat/elsatia-studio-v1  [FORK A — ne rejoint jamais le reste]
                     └─ release/commercialisation-v1  (Hub #1, 84/98 descendants)
                         ├─ feat/elsatia-canonical-integration-v1
                         │   └─ feat/elsatia-canonical-integration-r73-v1  [LIGNÉE "r73"]
                         │       ├─ chore/elsatia-preflight-r73-v1
                         │       ├─ chore/restore-canonical-migration-history-v1
                         │       ├─ feat/elsatia-canonical-final-r73-v1
                         │       └─ fix/colors-security-p1-closure-v1
                         │           └─ integration/colors-predeploy-final-v1
                         ├─ release/gp-v1-rc  [LIGNÉE "gp-release"]
                         │   ├─→ integration/gp-external-pilot-closure-v1   ⟂ diverge
                         │   └─→ perf/gp-capacity-readiness-v1              ⟂ diverge
                         │       (bases identiques @8caef21 ; 6 vs 1 commits, COLLISION migrations 299-303)
                         └─ feat/elsatia-canonical-integration-preprod-v1  [LIGNÉE "commercial-canonical"]
                             └─ feat/tarification-on-canonical-preprod-v1
                                 └─ feat/preprod-e2e-runbook-integration-v1
                                     └─ feat/capacity-stripe-r2-v1
                                         └─ feat/elsatia-commercial-canonical-r1-r2-r3-v1  (Hub #2, 55/98 descendants)
                                             ├─→ feat/env-manifest-canonical-v1        ⟂ diverge (le + récent, 23:13)
                                             ├─ feat/colors-commercial-readiness-v1
                                             │   └─ integration/elsatia-ecosystem-train-v3-commercial-platform-v1
                                             ├─ integration/colors-pilot-readiness-v1  ⟂ diverge de colors-predeploy-final-v1
                                             ├─ integration/colors-code-on-ecosystem-ledger-v1  ⟂ 3ᵉ lignée Colors
                                             ├─ feat/reserves-v3/v4/v6-*, fix/reserves-offline-resilience-train-v2 (v6 ⟂ fix-train)
                                             ├─ (10 branches integration/tools-*) → release/tools-store-preflight-v1 (puits, 9/10 absorbées)
                                             │   └─→ claude/preview-rehearsal-security-fixes-v1  ⟂ diverge de env-manifest-canonical-v1
                                             │       └─ claude/awesome-einstein-tyfo4k (rapport **[REHEARSAL]**, doc-only)
                                             └─ (~15 branches feat/gp-*-closure-v1, chacune 1 commit de plus que le hub, mutuellement indépendantes)
```

**Ancêtres / supersets confirmés** :
- `release/commercialisation-v1` est ancêtre strict de 84 des 98 autres candidats — c'est le **véritable socle commun le plus large** avant toute fourche thématique.
- `feat/elsatia-commercial-canonical-r1-r2-r3-v1` (le hub explicitement cité dans plusieurs noms de branches "r1-r2-r3") **n'est pas** le tip le plus avancé de sa propre lignée : `feat/colors-commercial-readiness-v1` → `integration/elsatia-ecosystem-train-v3-commercial-platform-v1` le dépasse de 70-80 commits (contrats clients, Stripe V4, webhook Next 16).
- `release/tools-store-preflight-v1` absorbe 9 des 10 branches `integration/tools-*` (seule `integration/tools-chantier-exports-v1` diverge).

**Divergences réelles (aucune n'est un sur-ensemble de l'autre)** :
1. `feat/elsatia-studio-v1` vs tout le reste — fork le plus ancien (avant commercialisation-v1).
2. Lignée "r73" (colors-preflight) vs lignée "commercial-canonical" (r1-r2-r3) — deux branches sœurs de `release/commercialisation-v1`, jamais réconciliées.
3. `release/gp-v1-rc` engendre deux tips frères qui divergent l'un de l'autre : `integration/gp-external-pilot-closure-v1` (6 commits propres) vs `perf/gp-capacity-readiness-v1` (1 commit propre) — **collision de migrations directe**, voir §4.
4. `feat/env-manifest-canonical-v1` fork directement depuis le hub #2, **pas** via `release/tools-store-preflight-v1` — 70 commits d'écart dans un sens, 83 dans l'autre.
5. `claude/preview-rehearsal-security-fixes-v1` diverge lui aussi de `feat/env-manifest-canonical-v1` (même situation que #4, chemins parallèles).
6. Colors : 3 lignées mutuellement divergentes (`colors-pilot-readiness-v1`, `colors-predeploy-final-v1`, `colors-code-on-ecosystem-ledger-v1`) — détail §12.
7. Reserves : `feat/reserves-v6-security-offline-pilot-gate-v1` vs `fix/reserves-offline-resilience-train-v2` — chacune a des commits absents de l'autre — détail §12.

**Sont obsolètes / strictement absorbées** (aucune analyse séparée nécessaire) : `fix/elsatia-tools-standalone-build-v1` (ni descendante du hub, ni ancêtre de `release/tools-store-preflight-v1` — semble remplacée) ; `fix/colors-precommercial-noindex-robots-v1` et `fix/colors-supabase-public-key-predeploy-guard-v1` (orphelines, ancêtres d'aucune des 4 branches Colors candidates).

**Uniquement documentaires** : toute la chaîne `docs/gp-cutover-*` (4 branches, révisions successives du même runbook — voir §11) et `docs/elsatia-production-*` (2 branches).

---

## 3. UNIQUE COMMITS (par lot, contre le candidat de convergence le plus large)

Le "candidat de convergence le plus large" disponible aujourd'hui n'est **pas unique** (voir §2) : selon la lignée choisie, c'est soit `release/tools-store-preflight-v1` (**[REHEARSAL]** : 361 commits/263 migrations sur `main`, absorbe commercialisation/alertes-délégation/terrain-mobile/multi-app-convergence/colors-canonical(codex)/canonical-integration-preprod), soit `integration/elsatia-ecosystem-train-v3-commercial-platform-v1` (370 commits/278 migrations, absorbe le hub #2 + Colors commercial + contrats clients + Stripe V4). Les deux tableaux ci-dessous listent ce qui manque à **chacun**, par lot, classé selon la taxonomie demandée.

**Ce qui manque à `release/tools-store-preflight-v1`** (repris de **[REHEARSAL]**, vérifié) :

| Train manquant | Commits | Classe | Contenu |
|---|---:|---|---|
| `release/gp-v1-rc` ≡ `gp-external-pilot-closure-v1` (base commune) | 7 | SECURITY | Durcissement EXECUTE/anon sur 22 fonctions SECURITY DEFINER |
| `integration/gp-postcutover-precommercial-ops-v1` | 9 | CODE, COMMERCIAL | Opérations post-cutover GP pilote externe |
| `feat/elsatia-canonical-final-r73-v1` | 33 | CODE | Travaux UI/nav canonique (lignée r73) |
| `docs/gp-cutover-documentation-closure-on-hotfix-v1` | 8 | DOC | Clôture documentaire cutover GP |
| `codex/elsatia-root-qa-closure-v1` | 1-3 | TEST | Clôture QA |
| `codex/elsatia-preprod-db-e2e-rollback-v1` | 1-3 | DR, TEST | Preuves E2E rollback preprod (réellement exécutées) |
| `docs/elsatia-production-migration-cutover-preflight-v1` | 1-3 | DR, DOC | Preflight cutover Production |
| `docs/elsatia-production-rollback-runbook-v1` | 1-3 | DR, DOC | Runbook rollback Production |

**Ce qui manque en plus, spécifiquement**, à `release/tools-store-preflight-v1` par rapport au hub commercial le plus large (`integration/elsatia-ecosystem-train-v3-commercial-platform-v1`) :

| Train manquant | Classe | Contenu |
|---|---|---|
| Génération tarifaire canonique V4 (27 Price IDs Test) | COMMERCIAL, SQL | `feat/colors-commercial-readiness-v1` |
| Contrats clients canoniques + snapshot destinataire | COMMERCIAL, SQL | `feat/client-contracts-canonical-v1`, `integration/gp-client-contracts-snapshot-v1` |
| Fix Stripe webhook Next 16 (`8169759`) | CODE, SECURITY | déjà fusionné dans ECO, absent de tools-store-preflight-v1 |
| `feat/env-manifest-canonical-v1` (manifeste + CI + prebuild) | CONFIG, TEST | fork séparé, ni l'un ni l'autre ne le contient |
| `claude/preview-rehearsal-security-fixes-v1` (CVE Next.js, fuite RPC) | SECURITY | fork séparé du hub #2 également |

**Note de méthode** : classer les ~2 900 commits uniques des 99 branches candidates un par un dépasserait le périmètre exploitable de ce rapport sans valeur ajoutée réelle — l'écrasante majorité partage la même histoire jusqu'au point de fourche pertinent (voir §2). Les tableaux ci-dessus couvrent les trains explicitement nommés dans la mission ; le détail commit-par-commit pour GP pilot et Performance (les deux trains les plus sensibles, avec collision réelle) est en §5/§6.

---

## 4. MIGRATIONS

**Ledger de référence** : `main` s'arrête à 178 migrations (`20260729000183`). Les trains actifs vont de 211 (`release/commercialisation-v1`) à 278-279 (`integration/elsatia-ecosystem-train-v3-commercial-platform-v1`, `feat/colors-commercial-readiness-v1`, `feat/env-manifest-canonical-v1`, `integration/colors-pilot-readiness-v1`). **`main` ne peut pas servir de base de convergence** : il lui manque 60 à 100 migrations selon le train comparé.

**Convention de numérotation** : chaque fichier est `YYYYMMDD` + un compteur séquentiel sur 6 chiffres réutilisé comme "numéro de migration" humain (ex. `20260921000299` = migration **299**). Ce compteur est partagé et incrémenté indépendamment par chaque lignée depuis son point de fourche — d'où les collisions ci-dessous. **Exception** : `feat/elsatia-studio-v1` n'utilise pas cette convention ; ses 8 fichiers portent un vrai horodatage `HHMMSS` (`20260912120000_studio_workspace_foundation.sql` … `20260913040000_studio_media_analysis.sql`). Aucune collision numérique aujourd'hui (le hub n'a aucune migration Studio), mais une convergence doit réconcilier deux schémas de tri différents avant d'outiller la fusion.

**19 numéros de séquence en collision réelle** (même numéro, contenu différent, détecté par comparaison exhaustive des 25 198 chemins de migrations sur les 99 branches candidates) :

| # | Variante A | Variante B | Variante C | Dépendance | À converger ? |
|---:|---|---|---|---|---|
| 200 | `documents_commerciaux_p9` (lignée codex/admin-global, chore/*, la plupart) | `reconciliation_pre_tarifs_v2` (lignée codex/elsatia-acl-reconciliation-v1 et descendants) | — | Aucune | OUI — renumérotation, contenu totalement différent |
| 236 | `platform_support_uid_security_v1` | `plateforme_lire_entreprise_membres_v1` | `elsatia_tools_r8_comptes_entitlements_sync` | Aucune | OUI — 3 contenus différents au même slot |
| 237 | `platform_aal2_role_integrity_v1` | `elsatia_tools_r9_monetisation` | — | Aucune | OUI |
| 238 | `platform_support_isolation_audit_v1` | `platform_write_surface_hardening_v1` | `elsatia_tools_r10_publication_multientreprise` | Aucune | OUI |
| 239 | `platform_stripe_audit_integrity_v1` (**`codex/multi-app-stripe-audit-integrity-fix` seul**) | `platform_support_isolation_audit_v1` | `elsatia_tools_r10_suppression_compte` | Aucune | OUI |
| 240 | `platform_stripe_audit_integrity_v1` | `platform_stripe_discount_consistency_v1` | `security_reconciliation_tools_entitlements_aal2_v1` | Aucune | OUI |
| 241 | `platform_stripe_proof_webhook_coordination_v1` | `platform_stripe_operation_attempts_v1` | — | Aucune | OUI |
| 242 | `revoke_legacy_discount_rpcs_v1` | `remises_operation_idempotence_v2` | — | **Oui** — ordre RPC/idempotence à trancher | OUI |
| 246 | `colors_functional_core_v1` | `residual_acl_hardening_r74` | — | Aucune | OUI |
| 247 | `colors_integrity_v11` | `support_message_author_guard_r75` | — | Aucune | OUI |
| 252 | `residual_acl_hardening_r74` (renumérotée) | `gp_v1_rc_aal2_session_check` | Doublon avec #246 | OUI | OUI |
| 257 | `capacity_stripe_r2_v1` | `modules_a_la_carte_r3_v1` | — | **capacity_stripe_r2 doit précéder le durcissement r72/r73** | OUI |
| 266 | `fix_module_gestion_pro_actif_entreprise_tenant_guard` (**`claude/preview-rehearsal-security-fixes-v1` seule**) | `support_reply_notification_recipient_v1` (**`feat/gp-support-reply-email-p1-closure-v1` seule**) | `platform_global_owner_all_apps_v1` (~35 branches) | Aucune, mais le correctif sécurité (A) doit **survivre absolument** | OUI — **A est un blocker sécurité, non négociable** |
| 271 | `reserves_v5_offline_idempotence_v1` | `colors_activity_history_v14` | — | Aucune | OUI |
| **299** | `factures_relance_auto_exclue_verrou_v1` (**pilot-closure**) | `correctif_debordement_numerotation_documents` (**perf**) | — | Aucune | **OUI — collision directe GP pilot / GP perf, voir §5/§6/§18** |
| **300** | `document_partage_public_par_jeton` (pilot-closure) | `correctif_perf_rls_lignes_devis_factures` (perf) | — | Aucune | **OUI** |
| **301** | `gp_pilot_paiement_avoir_idempotence` (pilot-closure) | `index_journal_activite_created_at` (perf) | — | Aucune | **OUI** |
| **302** | `gp_pilot_echeance_gel_post_emission` (pilot-closure) | `correctif_deadlock_paiements_concurrents` (perf) | — | Aucune | **OUI** |
| **303** | `gp_pilot_devis_entreprise_snapshot` (pilot-closure) | `index_trigram_recherche_listes` (perf) | — | Aucune | **OUI** |

Pilot-closure continue ensuite seule jusqu'à 308 (`support_session_no_permanent_role`, `rgpd_manifeste_fichiers`, `notification_devis_accepte`, `employes_annuaire_vue_restreinte`, `document_partage_medias`) — **aucun équivalent côté perf**, donc **9 migrations au total (299-308 côté pilot-closure, 299-303 côté perf) à renuméroter séquentiellement lors de la fusion**, sans perte de contenu d'un côté ni de l'autre.

**Plages libres** : aucune plage franchement vide n'a été trouvée sous 280 (toute la zone 184-280 est disputée par au moins 2 lignées). Au-delà de 304, seule pilot-closure occupe la plage jusqu'à 308 ; perf s'arrête à 303. La convergence devra choisir un ordre (ex. perf 299-303 conservés, pilot-closure renumérotée 304-312) plutôt qu'inventer une plage "libre" qui n'existe pas.

**`supabase/proposed/`** : vérifié vide/absent sur les 13 branches inspectées en détail (dont le hub #2 et `claude/preview-rehearsal-security-fixes-v1`). **Aucun fichier de proposition SQL non numéroté n'existe actuellement** — conformément à la consigne, même si le dossier avait contenu des fichiers, ils n'auraient pas compté comme migrations effectives.

---

## 5. GP PILOT

`integration/gp-external-pilot-closure-v1` (HEAD `f602a94`) — base commune avec perf : `release/gp-v1-rc` @ `8caef21`. **6 commits propres**, détaillés commit par commit (lecture directe des messages et diffs, pas de déduction) :

| Catégorie demandée | Statut | Détail |
|---|---|---|
| **Documents** | ✅ Présent | `document_partage_public_par_jeton` (300), `gp_pilot_devis_entreprise_snapshot` (303), `gp_pilot_document_partage_medias` (308) ; sert désormais les photos/signatures de devis sur les pages de partage public (`4f313e4`, §9 de la mission GP) |
| **Brouillons** | ✅ Présent (intégré, pas un lot séparé) | `9d55fd7` ajoute un « draft-guard » DB (refuse un document `brouillon` au niveau `document_commercial_public_par_token()`) **et** applicatif (`envoyerDocumentCommercialParEmail` refuse d'emailer/PDF/partager un devis/facture encore brouillon). Un correctif *distinct* et non lié ("grille — brouillon intact jamais écrasé", commit `937563c`) existe sur `feat/gp-v1-metier-devis-planning-references-v1`, **hors** de ce train |
| **Snapshots** | ✅ Présent | `gp_pilot_devis_entreprise_snapshot` (303) : gèle `devis.entreprise_snapshot` à l'envoi (devis n'avait pas l'équivalent de `facture.entreprise_snapshot` — un devis envoyé changeait silencieusement de logo/adresse/CGV si le profil entreprise changeait après) |
| **Export** | ⚠️ Partiel | Aucun lot d'export dédié dans ce train ; seules les pages `imprimer/partage/[token]` sont retouchées pour servir les médias. Le correctif "export tronqué" (`a9f3d03`, `docs(colors)`) est **hors de ce train**, côté Colors (voir §12) |
| **Suspension** | ✅ Présent | `abonnement-suspendu/page.tsx`, `actions/abonnement.ts`, nouveau `src/lib/acces-support-abonnement.ts` (`e109954`) : réutilise la liste blanche d'expiration d'essai pour qu'un tenant suspendu garde l'accès à support/export RGPD/abonnement, affiche la vraie raison au lieu d'un message générique, cache le bouton "régulariser" aux rôles non autorisés |
| **Idempotence** | ✅ Présent | `gp_pilot_paiement_avoir_idempotence` (301, corrigée une seconde fois en `e109954` après revue indépendante) : ferme une race TOCTOU sur les paiements (RPC verrouillée `FOR UPDATE`) et un double-clic créant deux avoirs (index partiel unique + résolution vers l'existant) |
| **Sécurité** | ✅ Présent | `e109954` "apply independent-review findings" ; `fb819f7` — `anonymiser_employe` supprime réellement les fichiers Storage (RGPD, §12 de la mission GP), pas seulement la ligne DB |
| **Mails** | ✅ Présent (partiel) | `gp_pilot_notification_devis_accepte` (306, `9ffeb28`) — notification (email) à l'acceptation d'un devis. Le lot distinct "reply email support" (`feat/gp-support-reply-email-p1-closure-v1`) n'est **pas** dans ce train |
| **Salariés** | ✅ Présent | `gp_pilot_employes_annuaire_vue_restreinte` (307) — vue annuaire employés à colonnes réduites ; `anonymiser_employe` (RGPD, ci-dessus) |
| **API 401/403** | ❌ **NON TROUVÉ** | Aucun commit de ce train n'implémente de réponse HTTP 401/403 structurée. L'équivalent le plus proche est un contrôle de rôle UI/action ("cacher le bouton régulariser aux rôles non autorisés", vérification de permission manquante sur `relance_finaliser`) — pas un code d'état API dédié. À clarifier si la mission visait autre chose (peut-être le train Access, voir §8) |
| **Autres correctifs** | ✅ Présent | `factures_relance_auto_exclue_verrou_v1` (299, corrige une liste blanche qui ne marchait jamais) ; gel de `date_echeance` après émission ; restauration du SELECT sur `relances_documents` révoqué en trop par `20260911000297` ; ajout des dépendances `@dnd-kit`/`@tanstack/react-virtual` manquantes (cassaient `next build`) |

**Le commit `9d55fd7` documente lui-même, dans son propre message** : *"Base: release/gp-v1-rc (BASE_FALLBACK_NON_CANONICAL — la 'converged train' branch/commits référencée pour cette mission n'existe pas dans ce dépôt ; vérifié via fetch complet + API GitHub)."* — confirmation indépendante, par une session antérieure, exactement du constat du §0 ci-dessus.

**`f2917b54` : confirmé introuvable** — ni objet git valide, ni branche sur `origin` (double vérification : cette session + **[REHEARSAL]**).

---

## 6. PERFORMANCE GP

`perf/gp-capacity-readiness-v1` (HEAD `1669e5c`, un seul commit propre au-dessus de `release/gp-v1-rc` @ `8caef21`). Mission : qualification perf/capacité avant pilote externe, fixture synthétique 2 tenants (40+5 salariés, 5000+300 devis, 3000+200 factures, ~52k pointages, ~250k lignes), mesurée sous RLS réelle (`EXPLAIN ANALYZE`, rôle `authenticated`).

| Correctif attendu | Trouvé | Détail (migration) |
|---|---|---|
| Numérotation >999 | ✅ | **299** `correctif_debordement_numerotation_documents.sql` — `lpad()` **tronque** au lieu d'étendre, casse la numérotation devis/facture au-delà de 999 documents cumulés (P0 bloquant). **Note** : ce n'est pas la numérotation des migrations qui déborde, mais celle des références devis/facture affichées au client |
| Deadlock paiements | ✅ | **302** `correctif_deadlock_paiements_concurrents.sql` — deadlock reproductible 3/3 sur deux encaissements concurrents sur la même facture (`FOR UPDATE` en conflit avec le `KEY SHARE` implicite de la FK) → `FOR NO KEY UPDATE` ; 0 deadlock sur 5 essais après correctif |
| RLS lignes devis/factures | ✅ | **300** `correctif_perf_rls_lignes_devis_factures.sql` — sous-requête `EXISTS` corrélée remplacée par `entreprise_id` dénormalisé (motif déjà établi pour `devis_ouvrages`) ; ~2.8× sur l'ouverture d'un devis à 1000 lignes |
| Index journal activité | ✅ | **301** `index_journal_activite_created_at.sql` — index `(entreprise_id, created_at desc)` manquant ; 9.9s → 18ms sur le motif de requête testé |
| Batch Storage photos | ✅ | Correctif applicatif (pas SQL) : N+1 Storage sur les documents de chantier — `createSignedUrl` → `createSignedUrls`, un seul appel réseau batch (`src/app/(app)/chantiers/[id]/documents/page.tsx`) |
| Fix frontend associé | ✅ | Le même fichier ci-dessus — c'est le "fix frontend" demandé |
| Migrations 299-303 | ✅ **confirmées** | Numérotation exacte trouvée : 299 (débordement), 300 (RLS), 301 (index journal), 302 (deadlock), 303 (`index_trigram_recherche_listes.sql`, bonus perf recherche ILIKE listes paginées) |

Non-régression revendiquée par le commit : Fresh (245 migrations), pgTAP 44/44, attaques cross-tenant rejetées à 2 niveaux (RLS + FK composite), vitest 1138/1141 (1 échec préexistant sans lien, dépendances `@dnd-kit` manquantes de `package.json` — **note : ce même gap de dépendance est corrigé indépendamment côté pilot-closure**, `9d55fd7`), typecheck/lint propres. Verdict du commit : **PILOT CAPACITY READY**.

**Collision directe avec GP pilot (§5)** : les migrations 299-303 de ce train sont **totalement différentes** de celles du train pilot-closure au même numéro (voir §4). Les deux trains partagent exactement la même base (`8caef21`) et ont chacun incrémenté le même compteur indépendamment le même jour. Aucun des deux ensembles de correctifs n'est présent dans l'autre — **les deux doivent survivre**, renumérotés.

---

## 7. COMMERCIAL

*(Synthèse de l'agent dédié — branches inspectées : `feat/elsatia-commercial-canonical-r1-r2-r3-v1`, `release/commercialisation-v1`, `feat/tarification-*`, `feat/capacity-stripe-r2-v1`, `codex/stripe-remise-idempotence-v2`, `codex/tarifs-v2-*`, `feat/gp-subscriptions-modules-discounts-canonical-v1`, `feat/stripe-test-canonical-prices-p0-v1`, `feat/colors-commercial-readiness-v1`, `integration/elsatia-ecosystem-train-v3-commercial-platform-v1`, `integration/elsatia-ledger-reconciliation-p0-v1`, `codex/admin-global-v1-*`, `fix/gp-public-pricing-canonical-alignment-v1`, `fix/gp-trial-socle-access-capacity-v1`, `fix/gp-stripe-webhook-next16-build-p0-v1`.)*

**Constat structurel** : `feat/colors-commercial-readiness-v1` → `integration/elsatia-ecosystem-train-v3-commercial-platform-v1` (CCR/ECO) sont de vrais sur-ensembles du hub #2 (~70-80 commits supplémentaires), et sont le **candidat de base réel** pour tout ce qui est commercial — pas le hub nommé dans les branches "r1-r2-r3".

| Sujet | Statut | Détail |
|---|---|---|
| **Tarifs / Price IDs** | DEJA_CORRIGE (hub) puis PROPOSE (CCR/ECO) | Hub : grille canonique Mini 79 / Pro 249 / Business 449 / Entreprise 599 €HT/mois, annuel = ×10 (`ac7bf05`). CCR/ECO : génération V4 complète (27 Price IDs "CANONICAL-V4-2026-09", `7fdd534`), `verifierPrixVendable()` en refus dur + `STRIPE_PRICES_VERIFY_STRICT=1` en CI (`527f18f`). **Toujours en mode Stripe Test** — aucun Price Live touché, `ABONNEMENTS_PUBLICS_OUVERTS=false` |
| **DECISION_REQUIRED — pricing public** | `fix/gp-public-pricing-canonical-alignment-v1` (`6d3fcfd`) a forké **indépendamment** de CCR/ECO et touche la même surface d'affichage de prix public — second correctif non réconcilié |
| **Contrats clients** | DEJA_CORRIGE (dans CCR/ECO, absent du hub nommé) | `feat/client-contracts-canonical-v1` (`d8f9aa7`), `integration/gp-client-contracts-snapshot-v1` (`4980334`), figement du prix contractuel en base (`8af11b8`) |
| **Stripe — webhooks/idempotence** | DEJA_CORRIGE (CCR/ECO) | Double livraison webhook prouvée non-régressive (`b9110a2`/`883d1b5`) ; fix build Next 16 en sortant la logique métier du webhook de `route.ts` (`8169759`, = `fix/gp-stripe-webhook-next16-build-p0-v1`, **déjà fusionné dans ECO**) |
| **DECISION_REQUIRED — remises Stripe, 2 lignées non réconciliées** | `codex/stripe-remise-idempotence-v2` (clés d'idempotence ancrées sur un enregistrement de tentative durable) **vs** `codex/admin-global-v1-revoke-legacy-discount-rpcs` (révocation des RPC de remise historiques). Approches différentes, ni l'une ni l'autre fusionnée dans le hub ou CCR/ECO |
| **Stripe Connect** | **NON TROUVÉ** | Aucune occurrence dans aucun commit/chemin sur les branches inspectées |
| **Entitlements / self-service** | DEJA_CORRIGE (hub) | R8 account entitlements + sync cross-plateforme (`727344c`), accès module borné pendant l'essai (`a81f317`), garde MFA/AAL2 (`9ad2729`) |
| **PROPOSE** | `fix/gp-trial-socle-access-capacity-v1` (`f34601a`, 1 commit devant le hub, non intégré) |

---

## 8. ACCESS

*(Synthèse de l'agent dédié.)*

| Sujet | Statut | Détail |
|---|---|---|
| **`decision_acces_application`** | **NON_APPLIQUE tel que nommé** — introuvable (0 résultat sur tout l'historique, toutes orthographes). Le contrat réel existant s'appelle `a_acces_application(entreprise_id, application)` + tables `acces_applications_entreprises`/`historique_acces_applications`/`habilitations_applications_utilisateurs`, introduit par `codex/multi-app-convergence-v1` (`afb433d`) — **DEJA_CORRIGE sous un autre nom**. Signaler explicitement l'écart de nommage entre la mission et le code réel |
| **Observation/backfill GP** | **NON_APPLIQUE** — introuvable en tant que tel sur les branches ciblées. Le plus proche : capacité "active-person" (`9163978`, `ad58d85`) — pas un mode observation/backfill d'accès |
| **Enforcement non activé** | PROPOSE | Le manifeste env (`feat/env-manifest-canonical-v1`) a `preflight_enforcement: "report"`, jamais `"enforce"` (voir §10). C'est un flag de préflight env/secrets, pas un flag ACL dédié — aucun flag ACL "enforcement" séparé trouvé. Ne pas confondre avec l'AAL2/rôle plateforme, qui lui **est** actif |
| **Tools** | DEJA_CORRIGE (garde env/clé uniquement) | `fix/tools-predeploy-env-guard-v1`, `fix/tools-supabase-public-key-convention-v1` — pas de modèle d'entitlements dédié pour Tools |
| **Suspension par application** | **NON_APPLIQUE au sens demandé** | Ce qui existe (`a81f317`, statuts `suspendu`/`annule`) est une suspension **d'abonnement entreprise**, pas une suspension par application individuelle |
| **`supabase/proposed/`** | Vide partout où vérifié (13 branches) — conforme à la consigne de ne jamais les compter comme appliquées |
| **Studio signup** | **OUVERT** (self-service, aucune garde) | `apps/studio/src/app/signup/page.tsx` : email+mot de passe, pas de code d'invitation/liste blanche. Contredit le nom `fix/studio-signup-closed-v1` demandé (qui n'existe pas) |
| **DECISION_REQUIRED — admin-global-v1** | 2 lignées parallèles jamais réunies : A) Stripe discounts (`revoke-legacy-discount-rpcs` → `discount-column-guard-r71` → `stripe-attestation-r72` → `stripe-observation-r73`) ; B) ACL plateforme (`residual-acl-hardening-r74` → `support-author-guard-r75`). Portées disjointes (pas de conflit fichier), mais jamais fusionnées dans une branche commune |
| **DECISION_REQUIRED — service-role ACL** | `fix/service-role-flux-acl-255-v1` et `fix/document-partage-service-role-acl-v1` corrigent chacun des fuites laissées par la migration 255, restent 2 branches séparées sans branche d'intégration commune |

---

## 9. SECURITY PREVIEW

*(Synthèse de l'agent dédié, croisée avec **[REHEARSAL]** — parfaite concordance.)*

| Correctif | next / sharp | Statut |
|---|---|---|
| `main`, hub #2, `release/gp-v1-rc`, lignée r73, `release/tools-store-preflight-v1` | `next@^16.2.12`, `sharp@^0.35.3` | **VULNÉRABLE** (`GHSA-p293-qw3h-jr36`, `GHSA-2xp9-vwfh-vxw4` — RCE non authentifiée) |
| `claude/preview-rehearsal-security-fixes-v1` (`bb42e1d`) seule | `next@^16.3.5`, `sharp@^0.35.4` | **SECURITY_BLOCKER_FIXED**, isolée, non fusionnée |

- **Fuite RPC `module_gestion_pro_actif_entreprise`** : SECURITY DEFINER, `EXECUTE` accordé à `authenticated` sans vérification d'appartenance (contrairement à ses sœurs `a_acces_application`/`applications_autorisees`). Preuve empirique : entreprise A obtenait `true` sur le module `stock` de l'entreprise B. **Corrigé** migration `20260905000266` (garde conditionnelle à la présence d'un JWT, préserve les 2 usages légitimes découverts dans la suite pgTAP existante) → **SECURITY_BLOCKER_FIXED**, `claude/preview-rehearsal-security-fixes-v1` seule.
- **"7 RPC voisines"** : **CONFIRMÉ EXISTANT, ouvert**. Audit de 20 fonctions candidates (SECURITY DEFINER + argument `entreprise_id` + `EXECUTE authenticated` + aucune garde) → 13 faux positifs, **7 réellement vulnérables** :

| Fonction | Effet | Sévérité |
|---|---|---|
| `capacite_personnes_base` | Lecture : palier d'abonnement d'une entreprise tierce | Moyenne |
| `capacite_personnes_totale` | Lecture : capacité de sièges achetée d'une entreprise tierce | Moyenne |
| `compter_personnes_actives_entreprise` | Lecture : effectif actif d'une entreprise tierce | Moyenne |
| `etat_capacite_personnes` | Lecture : dépassement de limite de sièges d'une entreprise tierce | Moyenne |
| `appliquer_baisse_capacite_planifiee_service` | Écriture : force une baisse de capacité déjà planifiée sur un tenant tiers | Moyenne |
| `capacite_stripe_avancer_marqueur_evenement` | Écriture : sabote silencieusement la sync webhook Stripe d'un tenant tiers | **Élevée** |
| `obtenir_ou_creer_fournisseur_boutique` | Écriture : insère un fournisseur non sollicité chez un tenant tiers | Faible-moyenne |

  Non corrigées (hors périmètre explicite "pas de refactor massif" de la mission qui les a trouvées) → **SECURITY_BLOCKER_OPEN**, à traiter en lot dédié. Aucune autre branche (y compris le lot "22 fonctions" de `release/gp-v1-rc`, catégorie différente) ne les couvre.
- **Autres branches SECURITY** (aucune ne porte le bump Next.js/sharp ni le fix RPC ci-dessus) : `fix/security-publishable-key-migration` (migration vers `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, Production) → FIXED (Prod) ; `chore/security-remove-supabase-legacy-env` (retrait du fallback anon-key legacy) → FIXED ; `codex/elsatia-mfa-aal2-v1` / `codex/multi-app-aal2-role-fix` (MFA TOTP + garde AAL2/rôle) → FIXED.

**Divergence hub #2 vs preview-rehearsal** : `r1-r2-r3..preview-rehearsal` = 71 commits (surtout Tools atelier/tracing + les 2 correctifs ci-dessus) ; `preview-rehearsal..r1-r2-r3` = 0 — la sécurité n'est pas en retard, elle est **en avance et non fusionnée**.

---

## 10. ENV / CI

`feat/env-manifest-canonical-v1` — parent réel confirmé = hub #2 (**pas** `release/tools-store-preflight-v1`, dont il diverge). 4 commits propres :

1. `9de09de` — **manifeste** `config/env-manifest.json` (187 variables, 10 unités : GP, socle, Colors, Tools, Reserves, Studio, Studio worker, scripts, E2E, CI — noms seulement, aucune valeur) + `config/env-manifest.schema.json` + `scripts/check-env-manifest.mjs`.
2. `4445de0` — **templates** : `.env.example`, `.env.local.example`, `.env.preview.example`, `apps/{colors,reserves,tools}/.env.example` alignés (corrections de noms uniquement — clé anon Reserves, `STRIPE_WEBHOOK_EXPECTED_MODE` manquante, défauts `FEATURE_*` fail-closed).
3. `816989a` — **CI** : étapes `verify:env-manifest`/`verify:secrets` dans `.github/workflows/ci.yml` (avant `npm ci`) ; **prebuild** `prebuild`/`prebuild:reserves`/`prebuild:colors` (gated Vercel Preview/Production, non bloquant) ; ajoute le **patch inerte** `docs/runbooks/patches/ELSATIA_PREFLIGHT_CHECK_ENV_MANIFEST_V1.patch` (+19/-9), destiné à rebrancher `scripts/cutover/preflight-check.mjs` sur le manifeste.
4. `5326118` — **tests** (58 cas `node:test`, valeurs fictives uniquement) + runbook + rapport de qualification.

**Patch preflight — confirmé NON appliqué** : le fichier `.patch` n'est qu'un diff stocké. Mieux : `scripts/cutover/preflight-check.mjs` **n'existe même pas** sur cette branche — le patch est donc inerte par construction, pas seulement "pas encore appliqué". **Ne pas l'appliquer**, conformément à la mission.

**Mode confirmé = `report`, jamais `enforce`** : `config/env-manifest.json` fixe `"preflight_enforcement": "report"` ; le script ne bloque que si ce flag passe à `"enforce"`, jamais fait dans ce lot.

---

## 11. DR / RELEASE GATE

**Aucun outil de backup/restore/release-gate scripté n'existe dans le dépôt** (confirmé par **[REHEARSAL]** par recherche exhaustive : rien dans `scripts/`, aucun workflow GitHub Actions de backup/rollback — seul `.github/workflows/ci.yml`, un unique job `verification`). Toute la doctrine DR vit dans des runbooks Markdown non fusionnés sur `main`.

| Branche | Contenu | Preuve locale / distante |
|---|---|---|
| `docs/elsatia-production-rollback-runbook-v1` (`a3aad60`) | `ELSATIA_PRODUCTION_ROLLBACK_V1.md` — séquence backup (`pg_dump --compress=9` → SHA-256 → volume DR chiffré → rétention 7/4/12), 3 stratégies rollback DB, arbre de décision T0-T4 | **Doc seule**, exécution attribuée à "CODEX" dans un doc de scope, pas rejouée ici |
| `codex/elsatia-preprod-db-e2e-rollback-v1` (`a354d13`) | **Run E2E/DB réellement exécuté et enregistré** : Fresh 253 migrations, pgTAP 870/870, checks restore-à-210, 8 checkouts Stripe Test, Playwright MFA/storage | **LOCAL uniquement** — chemins vers un sparse-bundle macOS chiffré local, bind-mount Docker, checksum SHA-256 donné. **Aucune restauration Supabase hébergée/managée exercée** |
| `feat/preprod-e2e-runbook-integration-v1` (`6df3ebd`) | Fusionne la preuve CODEX + le runbook rollback Claude ; garde explicitement la version CODEX comme "preuve officielle" | — |
| `docs/elsatia-production-migration-cutover-preflight-v1` (`25e377b`) | Plan cutover 20 étapes, lecture seule, 42 migrations manquantes identifiées, point-de-non-retour `20260826000237` | Doc seule, aucune migration exécutée |
| `docs/gp-cutover-runbook-qa-rebase-v1` → `docs/gp-cutover-env-doc-delta-closure-v1` → `docs/gp-cutover-documentation-closure-v1` | **Chaîne linéaire de révisions du même runbook** (confirmé par diff, sur-ensemble propre à chaque étape, 0 divergence) ; la dernière étape (`70e11b9`) documente que **le backup managé Supabase Pro ne retient que 7 jours** et que le **PITR est un add-on payant non activé par défaut** — écart théorique non fermé, pas exercé | — |
| `docs/gp-cutover-documentation-closure-on-hotfix-v1` | Même contenu de clôture re-porté sur la lignée `pilot-hotfix` (doc/script seulement, confirmé par diff) — **doublon de landing**, pas de nouveau contenu | — |
| `chore/restore-canonical-migration-history-v1` (`d5bbe96`) | Sans rapport avec le cutover — restaure 12 fichiers de migration déjà appliqués (`20260816...0201`-`0215`) dans le répertoire. "Restore" = historique de migrations, **pas** une procédure DB/backup | — |

**Backup** : seul le run E2E local CODEX ci-dessus (LOCAL, SHA-256 + logs). **[REHEARSAL]** a en plus rejoué un backup/restore local (`pg_dump`/`pg_restore`, `backup_id=rehearsal_20260920T213007Z`, SHA-256 `a79774af...`, 181 tables / 522 policies / 445 fonctions / 114 triggers identiques avant/après). **`LOCAL_POSTGRES_BACKUP_RESTORE = PASS`**. **`HOSTED_SUPABASE_RESTORE = NOT_PROVEN_REMOTE`** partout — aucune restauration Supabase hébergée n'a jamais été exercée dans ce dépôt.

**Release gate** : aucun trouvé. `docs/runbooks/ELSATIA_RELEASE_GOVERNANCE_V1.md` (branche env-manifest) est un **audit**, pas une gate : `main`/`release/commercialisation-v1`/le hub sont tous `protected=false`, aucun check requis, aucun ruleset appliqué.

**Observabilité** : aucune addition de logging/monitoring/alerting sur les 9 branches DR. **[REHEARSAL]** a trouvé 3 lacunes : route `/monitoring` référencée dans le middleware mais inexistante ; pas de config Sentry client malgré `docs/SENTRY.md` ; échecs cron par-tenant avalés en HTTP 200 (invisibles pour la surveillance Vercel).

---

## 12. COLORS / RESERVES / TOOLS / STUDIO

*(Synthèse de l'agent dédié.)*

### COLORS
- **Plus récente** : `integration/colors-pilot-readiness-v1` (`a376984`, 2026-09-10) — mais son propre message dit **"BLOQUÉ ENVIRONNEMENT, RECETTE NON CONCLUSIVE"** (17 contrôles vert sur arbre figé, mais les 35 parcours Playwright n'ont pas pu être rejoués).
- **Plus qualifiée / superset** : `integration/colors-pilot-readiness-v1` (98 devant le hub, 0 derrière), superset de `feat/colors-commercial-readiness-v1`. **Mais** `integration/colors-predeploy-final-v1` est une **lignée séparée** (via r73, pas descendante du hub) qui contient 4 correctifs absents de pilot-readiness : `fix/colors-auth-callback-csp-p1-v2`, `fix/colors-security-p1-closure-v1`, `fix/colors-safe-next-redirect-v1`, `fix/elsatia-colors-standalone-build-v1`. Et `integration/colors-code-on-ecosystem-ledger-v1` est une **3ᵉ lignée**, mutuellement divergente des deux autres.
- **Correctifs indispensables non fusionnés nulle part** : `fix/colors-precommercial-noindex-robots-v1`, `fix/colors-supabase-public-key-predeploy-guard-v1` — orphelins.
- **Écart avec le hub** : pilot-readiness = 98 commits devant, 0 derrière. predeploy-final = 19-29 devant / **47 derrière** (diverge avant le hub).
- **Migrations** : pilot-readiness ajoute 16 migrations (266-281). predeploy-final s'arrête à 249 — **manque tout ce qui suit** `platform_promotion_aal2_hardening_v1`.

### RESERVES
- **Plus récente** : `fix/reserves-offline-resilience-train-v2` (`86ed10a`, 2026-09-08).
- **Pas de superset unique** : `feat/reserves-v6-security-offline-pilot-gate-v1` et `fix/reserves-offline-resilience-train-v2` **divergent** — v6 a un durcissement sécurité/fiabilité hors-ligne dédié absent de fix-train ; fix-train a contrats clients/champs légaux/GP absents de v6.
- **Correctifs indispensables** : v6 = durcissement offline dédié (`72aefe0`, `7c0fc3d`) ; fix-train = canonicalisation contrats clients, champs légaux, snapshot document GP.
- **Écart avec le hub** : toutes descendantes, 0 derrière ; ahead 12 (v3) à 37 (fix-train).
- **Migrations** : v6 ajoute 266-271 ; fix-train ajoute 266-274 (superset des migrations de v6, bien que v6 ait des commits absents de fix-train — le durcissement de v6 semble avoir livré sans migration propre).

### TOOLS
- **Plus récente et plus qualifiée** : `release/tools-store-preflight-v1` (`bf27e78`) — confirmé puits du graphe, descendant de 9/10 branches `integration/tools-*`. Seule `integration/tools-chantier-exports-v1` diverge (pagination PDF, garde d'échelle d'impression/mosaïque, template vectoriel 1:1 — absents de store-preflight-v1).
- **Correctifs indispensables** : `fix/tools-predeploy-env-guard-v1`, `fix/tools-supabase-public-key-convention-v1` — tous deux déjà fusionnés. `fix/elsatia-tools-standalone-build-v1` semble **obsolète** (ni ancêtre ni descendant du hub/store-preflight).
- **Écart avec le hub** : store-preflight-v1 = 70 devant, 0 derrière — le plus proche de tous les hubs d'app.
- **Migrations** : arbre `supabase/migrations` **identique octet-pour-octet** au hub — Tools n'ajoute aucune migration propre.

### STUDIO
- **Seule branche** : `feat/elsatia-studio-v1` (`214d47f`, 2026-09-13 — le commit le plus récent parmi les 4 apps).
- **Confirmé hors-lignée** : ni ancêtre ni descendant du hub #2 ni de `release/commercialisation-v1` — fork juste après `codex/multi-app-convergence-v1`, avant toute la convergence commerciale/sécurité/accès. 25 devant / 36 derrière le hub.
- **Écart de convention de migrations** : voir §4 — horodatage réel `HHMMSS` (8 fichiers) au lieu du compteur séquentiel partagé. Pas de collision numérique aujourd'hui, mais deux schémas de tri à réconcilier.
- **Signup** : **ouvert sans garde** (email + mot de passe, 12-256 caractères, aucun code d'invitation/liste blanche/flag).

---

## 13. COLLISIONS DE CODE

*(Synthèse de l'agent dédié — comparaison entre les tips des lignées divergentes.)*

| Fichier | Branches | Nature | Collision | Ordre conseillé |
|---|---|---|---|---|
| `apps/colors/src/proxy.ts` | hub #2 ↔ colors-predeploy-final-v1 | Hub = passe-plat simple ; predeploy-final réécrit la même fonction avec CSP nonce + allowlist assets publics | **Élevée** | Prendre la version CSP de predeploy-final, réappliquer les autres préoccupations du hub par-dessus |
| `.../stripe/abonnement/webhook/route.ts` + `stripe-discount-server.ts` | hub #2 ↔ colors-predeploy-final-v1 | Hub ajoute retry+reconcile (`acquerirVerrouRemiseAvecReprise`) ; predeploy-final n'a pas ce durcissement | **Élevée** | Le hub doit gagner ce fichier — ne jamais laisser predeploy-final "gagner" ici |
| `apps/colors/src/app/auth/callback/route.ts` | hub #2 ↔ colors-predeploy-final-v1 | Même contrôle anti-open-redirect, implémenté différemment (inline vs helper `redirection-sure`) | Moyenne | Préférer le helper extrait comme canonique |
| `.env.example` (`NEXT_PUBLIC_APP_URL`) | hub #2 ↔ colors-predeploy-final-v1 | Hub = sous-domaine par app ; Colors = domaine unique — divergence architecturale, pas un typo | Moyenne-Élevée | Trancher le modèle de domaine explicitement avant toute fusion d'env |
| `package.json` (scripts) | hub #2 ↔ gp-external-pilot-closure-v1 | Hub enveloppe le sous-build Tools + `verify:stripe-prices` ; gp-pilot-closure a les scripts pré-Tools | Moyenne | Fusionner l'enveloppe du hub, gp-pilot-closure n'a rien d'unique à préserver ici |
| `src/lib/documents-envoi.ts` | hub #2 ↔ gp-external-pilot-closure-v1 | gp-pilot-closure étend fortement (pièces CGV, resend override, rendu HTML) sur une base hub minimale | Moyenne (additif mais surface exportée partagée) | Fusionner la version étendue sur la base du hub, vérifier les exports |
| Slots migration 299-303 | gp-external-pilot-closure-v1 ↔ perf-capacity-readiness-v1 | Pas de collision de nom de fichier (dates différentes), mais même compteur séquentiel réutilisé | Faible-Moyenne (collision logique, pas git) | Renuméroter un des deux côtés séquentiellement après l'autre |

`integration/gp-external-pilot-closure-v1` et `perf/gp-capacity-readiness-v1` ne partagent **aucun** chemin de fichier modifié depuis leur base commune — hormis la question de numérotation ci-dessus, cette paire est propre.

---

## 14. COLLISIONS PACKAGE / LOCKFILE

| Branche | next | sharp | stripe (npm) | @supabase/supabase-js | @supabase/ssr | react/react-dom |
|---|---|---|---|---|---|---|
| Toutes sauf `preview-rehearsal-security-fixes-v1` | `^16.2.12` | `^0.35.3` | *(aucune — Stripe est intégré à la main via REST/webhooks, pas le SDK)* | `^2.110.2` | `^0.12.0` | `19.2.4` |
| `claude/preview-rehearsal-security-fixes-v1` | **`^16.3.5`** | **`^0.35.4`** | — | `^2.110.2` | `^0.12.0` | `19.2.4` |

**Version qui doit survivre** : `next@^16.3.5` / `sharp@^0.35.4` — c'est un correctif de sécurité, pas juste une avance de version ; si cette branche fusionne dans une sœur qui n'a pas encore le bump et que l'ancien `package.json` "gagne" (résolution manuelle ou `-X ours`), la vulnérabilité corrigée est réintroduite silencieusement. Aucune autre dépendance ne diverge.

**Lockfile (`package-lock.json`)** — 4 clusters MD5 distincts détectés : (1) commercialisation/gp-v1-rc/perf-capacity/r73/colors-predeploy-final (état figé au point de release) ; (2) hub #2/tools-store-preflight/env-manifest-canonical (état commun, confirme la relation de hub) ; (3-4) `main`, `preview-rehearsal-security-fixes` (bump next/sharp), `gp-external-pilot-closure` (ajoute `@dnd-kit/*`/`@tanstack/react-virtual`), `feat/elsatia-studio-v1` — tous divergents individuellement. **Toute paire entre clusters différents provoquera un conflit dur sur `package-lock.json`** (diff volumineux, pas de fusion 3-voies propre) : régénérer le lockfile après fusion plutôt que le résoudre à la main. `apps/colors`, `apps/tools`, `apps/studio`, `apps/reserves` ont chacun leur propre lockfile à vérifier séparément.

---

## 15. ORDRE DE CONVERGENCE PROPOSÉ

Déduit des dépendances réelles observées (§2-§14), pas d'un ordre théorique.

**`CONVERGENCE_STEP_01`** — Geler la base
- Branche source : `release/tools-store-preflight-v1` (`bf27e78`) — la plus large base "stable" sans blocker sécurité connu à cette étape.
- Commits : 361 sur `main`.
- Risques : ne contient ni Env manifest, ni Security preview, ni GP pilot/perf, ni le sur-ensemble commercial CCR/ECO.
- Tests à rejouer : `npm run verify` (3 apps), `pg_prove` (54 fichiers pgTAP), Fresh 263 migrations.

**`CONVERGENCE_STEP_02`** — Porter la sécurité (bloquant, non négociable)
- Branche source : `claude/preview-rehearsal-security-fixes-v1` (`bb42e1d`) — 2 commits (`bb42e1d`, `6bf3a50` pour la doc/audit).
- Commits : CVE Next.js/sharp (bump 3 apps), fix RPC `module_gestion_pro_actif_entreprise` (migration 266).
- Risques : conflit `package.json`/lockfile avec toute branche encore sur 16.2.12/0.35.3 (§14) — imposer la version haute, jamais l'inverse.
- Tests : `npm audit` (3 apps), pgTAP complet (54/55 fichiers), witnesses négatif/positif/admin/interne du RPC.

**`CONVERGENCE_STEP_03`** — Porter le train GP pilote + performance (fusion, pas choix binaire)
- Branches sources : `integration/gp-external-pilot-closure-v1` (`f602a94`) **et** `perf/gp-capacity-readiness-v1` (`1669e5c`) — les deux, aucune ne remplace l'autre.
- Commits : 6 (pilot-closure) + 1 (perf).
- Risques : **collision migrations 299-303** (§4/§6) — renuméroter manuellement l'un des deux jeux avant d'appliquer (ex. garder perf 299-303 tel quel, renuméroter pilot-closure 304-312).
- Tests : Fresh complet post-renumérotation, pgTAP paiements/avoir/idempotence, test de concurrence deadlock (5 essais), test de débordement numérotation devis/facture >999.

**`CONVERGENCE_STEP_04`** — Porter le socle commercial le plus large
- Branche source : `integration/elsatia-ecosystem-train-v3-commercial-platform-v1` (`59e960a`) — sur-ensemble de `feat/colors-commercial-readiness-v1` et du hub #2.
- Risques : `fix/gp-public-pricing-canonical-alignment-v1` et les 2 lignées de remises Stripe (`stripe-remise-idempotence-v2` vs `admin-global-v1-revoke-legacy-discount-rpcs`) doivent être tranchées **avant** ce merge, pas après (§7 DECISION_REQUIRED).
- Tests : `scripts/verify-stripe-prices.mjs` (mode non strict sans credentials), tests idempotence webhook, tests contrats clients.

**`CONVERGENCE_STEP_05`** — Porter Access
- Branches sources : `codex/admin-global-v1-support-author-guard-r75` (lignée ACL) et `codex/admin-global-v1-stripe-observation-r73` (lignée discount) — **fusionner les deux d'abord** dans une branche d'intégration commune (jamais fait à ce jour), puis `fix/service-role-flux-acl-255-v1` + `fix/document-partage-service-role-acl-v1`.
- Risques : aucun conflit fichier détecté entre A/B, mais aucune n'a jamais été testée ensemble.
- Tests : suite pgTAP ACL/permissions complète, tests de non-régression sur les migrations 255.

**`CONVERGENCE_STEP_06`** — Porter Env manifest (mode report uniquement)
- Branche source : `feat/env-manifest-canonical-v1` (`5326118`).
- Risques : ne pas activer `enforce`, ne pas appliquer le patch preflight inerte.
- Tests : les 58 cas `node:test` du manifeste, CI complète avec `verify:env-manifest`.

**`CONVERGENCE_STEP_07`** — Porter DR/runbooks (documentaire, sans risque de code)
- Branches sources : chaîne `docs/gp-cutover-*` (prendre uniquement `docs/gp-cutover-documentation-closure-v1`, sur-ensemble des 3 précédentes) + `docs/elsatia-production-rollback-runbook-v1` + `codex/elsatia-preprod-db-e2e-rollback-v1`.
- Risques : aucun (doc-only), mais **ne pas se fier au T-30 restore point** — PITR non activé par défaut sur Supabase Pro (§11), à corriger opérationnellement avant toute Preview réelle.
- Tests : `scripts/verify-cutover-docs.mjs` (51/51 checks).

**`CONVERGENCE_STEP_08`** — Porter les apps (Colors 3-voies, Reserves 2-voies, Studio hors-lignée)
- Colors : fusionner `integration/colors-pilot-readiness-v1` (base) + les 4 correctifs orphelins de `colors-predeploy-final-v1` (§12) — résoudre `apps/colors/src/proxy.ts` et le webhook Stripe (§13) manuellement.
- Reserves : fusionner `fix/reserves-offline-resilience-train-v2` (base) + le durcissement offline dédié de `feat/reserves-v6-security-offline-pilot-gate-v1`.
- Studio : **dernier**, volontairement — fork trop ancien, migrations à convertir du format `HHMMSS` vers le compteur séquentiel avant intégration, signup à fermer si c'est bien l'intention (actuellement ouvert).
- Tests : suite Playwright 35 parcours Colors (jamais rejouée avec succès — `integration/colors-pilot-readiness-v1` le documente elle-même comme non conclusif), suites vitest par app.

---

## 16. CANDIDAT FINAL

```
FINAL_PREVIEW_CONVERGENCE_BASE = DECISION_REQUIRED
```

Confirmé indépendamment par cette carte et par **[REHEARSAL]** (24 branches comparées ce jour-là ; ce rapport en a comparé 99, sans trouver de sur-ensemble strict supplémentaire). **Aucune branche unique n'est un sur-ensemble strict de tout ce qui est nécessaire** — au minimum 5 lignées mutuellement non réconciliées existent (sécurité, GP pilote+perf, commercial CCR/ECO, r73/colors-preflight, env-manifest), sans compter les 3 lignées Colors et les 2 lignées Reserves internes.

**2 options réellement crédibles** :

**Option A — Base de travail conservatrice (celle retenue par [REHEARSAL])**
`release/tools-store-preflight-v1` (`bf27e78`), puis appliquer dans l'ordre §15 : sécurité → GP pilot+perf (fusionnés) → commercial CCR/ECO → access → env-manifest → DR docs → apps.
- Avantage : base déjà qualifiée par une répétition générale réelle (264/264 migrations, 1130/1130 pgTAP, gate 3 apps vert hors CVE/RPC).
- Coût : nécessite de porter manuellement CCR/ECO (70-80 commits) qui ne sont pas dans sa lignée directe.

**Option B — Base commerciale la plus large**
`integration/elsatia-ecosystem-train-v3-commercial-platform-v1` (`59e960a`), puis porter dans l'ordre : sécurité → GP pilot+perf → access → env-manifest → DR docs → apps → (`release/tools-store-preflight-v1`'s propres 70 commits Tools, absents de cette lignée).
- Avantage : contient déjà tout le commercial (contrats, Stripe V4, remises partiellement).
- Coût : n'a jamais été qualifiée par une répétition complète (pas de preuve Fresh/pgTAP/gate connue sur cette branche précisément).

**Aucune Option C n'est crédible** : la lignée r73/colors-preflight est trop en retard sur le commercial pour servir de base (elle s'arrête à la migration 249, avant tout le travail des 30 derniers jours) ; elle ne devrait être qu'une source de correctifs ponctuels (§13) à porter sur A ou B.

---

## 17. TEST PLAN APRÈS CONVERGENCE

Repris et étendu de **[REHEARSAL]** (déjà exécuté une fois sur `WORKING_REHEARSAL_BASE`, à rejouer intégralement après chaque étape de §15) :

| Contrôle | Déjà prouvé (où) | À refaire après convergence |
|---|---|---|
| **Fresh** | 263/263 (`release/tools-store-preflight-v1`), 245 (`perf`), 264 (`preview-rehearsal-security-fixes`) | Rejouer sur la séquence **renumérotée** post-STEP_03, viser 0 erreur SQL |
| **Upgrade** | `main` (178) utilisé comme `SIMULATED_UPGRADE_BASELINE` — préfixe strict sans trou vs base de travail | `ACTUAL_PREVIEW_UPGRADE` reste `NOT_PROVEN_REMOTE` tant qu'un accès Supabase Preview réel n'est pas fourni |
| **pgTAP** | 53/54-55 fichiers verts, 1125-1130/1130 assertions (1 fichier bloqué par `pgsodium`, propriétaire Supabase, hors sandbox) | Ajouter les tests des migrations 299-308 renumérotées + tests ACL step_05 |
| **Sécurité** | CVE Next.js/sharp fixé et vérifié ; RPC `module_gestion_pro_actif_entreprise` fixé et vérifié (témoins 4/4) | **Corriger les 7 RPC sœurs avant tout candidat au déploiement** (§9) — actuellement `SECURITY_BLOCKER_OPEN` |
| **Concurrence** | 5→40 utilisateurs simulés, 0 deadlock après correctif 302 (`perf`) ; 2 tenants A/B isolation RLS testée réellement | Rejouer après renumérotation migrations, avec les deux jeux de correctifs GP pilote+perf actifs simultanément |
| **Vitest** | GP 828/828, Tools 1991/1991, Colors 27/27 (post-fix sécurité) | Rejouer sur chaque app après STEP_08 |
| **Typecheck/Lint** | PASS sur les 3 apps, avant et après bump Next.js (1 nouveau warning ESLint non bloquant) | Rejouer après chaque step |
| **Builds** | GP/Colors PASS ; Tools bloqué par `verify:public-env` (garde-fou volontaire, sans rapport avec la sécurité) | Confirmer que ce garde-fou reste volontaire, ne pas le contourner |
| **E2E** | Colors : 17/17 contrôles sur arbre figé, **35 parcours Playwright jamais conclus** (`integration/colors-pilot-readiness-v1` le documente elle-même) | **Terminer la recette Playwright Colors avant toute Preview** |
| **Release gate** | Exécuté réellement (`[REHEARSAL]`), vert sauf les 2 blockers désormais fixés + les 7 nouveaux ouverts | Rejouer sur la branche convergée ; brancher enfin `apps/colors` dans `npm run verify`/CI (écart connu, jamais corrigé) |
| **Preview réelle** | Aucun accès credential dans aucune session à ce jour | Fournir un accès Supabase/Vercel/Stripe Test en lecture minimum pour la prochaine itération — bloquant pour sortir de `NOT_PROVEN_REMOTE` |

---

## 18. RISQUE DE PERTE DE CORRECTIFS

```
MUST_NOT_LOSE
```

1. **GP pilot closure** (6 commits, `integration/gp-external-pilot-closure-v1`) — idempotence paiement/avoir, draft-guard, snapshot devis/entreprise, anonymisation RGPD réelle (suppression Storage), notification acceptation devis, vue annuaire employés restreinte, partage média public par jeton.
2. **GP performance** (1 commit, `perf/gp-capacity-readiness-v1`) — débordement numérotation >999, RLS lignes devis/factures, index journal activité, fix deadlock paiements concurrents, index trigram recherche, batch Storage photos. **Collision migratoire directe avec #1 — les deux doivent survivre, aucun des deux écrasé par l'autre.**
3. **CVE Next.js/sharp** (`claude/preview-rehearsal-security-fixes-v1`) — RCE non authentifiée, la version basse ne doit **jamais** gagner un merge de `package.json`/lockfile.
4. **Fix RPC `module_gestion_pro_actif_entreprise`** (même branche, migration 266) — fuite cross-tenant de métadonnée commerciale, déjà corrigée mais nulle part ailleurs.
5. **Les 7 RPC sœurs identifiées mais non corrigées** — ne pas les perdre de vue en pensant le sujet "RPC" clos ; c'est un blocker ouvert distinct, pas encore un correctif.
6. **signOut local / portée globale** — `logoutAction` déconnecte actuellement TOUTES les sessions (`scope` global par défaut, non documenté) ; à confirmer volontaire avant tout test multi-appareils, ne pas "corriger" par erreur en convergence sans décision explicite.
7. **Suspension par abonnement** (`e109954`, GP pilot) — accès support/RGPD/abonnement préservé pour un tenant suspendu ; ne pas régresser en fusionnant une version plus ancienne de `abonnement-suspendu/page.tsx`.
8. **ENV manifest en mode `report`** — ne jamais fusionner accidentellement en mode `enforce`, ni appliquer le patch preflight inerte sans décision explicite (le script cible n'existe même pas encore).
9. **Contrats clients canoniques + figement prix contractuel** (CCR/ECO) — absents du hub nommé "r1-r2-r3", à ne pas perdre si Option A (§16) est retenue sans porter CCR/ECO explicitement.
10. **Durcissement offline dédié Reserves v6** — n'a pas de migration propre, facile à perdre silencieusement si seule `fix-train` est retenue comme "la" branche Reserves.
11. **4 correctifs Colors orphelins de `colors-predeploy-final-v1`** (CSP auth callback, security-p1-closure, safe-next-redirect, standalone-build) — absents de la branche Colors la plus récente (`colors-pilot-readiness-v1`), à porter explicitement.
12. **Preuve DR locale réelle** (`codex/elsatia-preprod-db-e2e-rollback-v1`, SHA-256 documenté) — seule preuve d'exécution réelle du dépôt entier ; ne pas la remplacer par un doc non exécuté en pensant avoir "la même chose en mieux".

---

## DECISION_REQUIRED (récapitulatif de toutes les sections)

- `FINAL_PREVIEW_CONVERGENCE_BASE` — Option A (`release/tools-store-preflight-v1`) vs Option B (`integration/elsatia-ecosystem-train-v3-commercial-platform-v1`) — §16.
- Collision migrations 299-303 GP pilote vs GP perf — ordre de renumérotation à choisir — §4/§6/§18.
- 2 lignées de remises Stripe non réconciliées (`stripe-remise-idempotence-v2` vs `admin-global-v1-revoke-legacy-discount-rpcs`) — §7.
- `fix/gp-public-pricing-canonical-alignment-v1` — second correctif de pricing public non réconcilié avec CCR/ECO — §7.
- 2 lignées `admin-global-v1` jamais fusionnées ensemble (Stripe discounts vs ACL plateforme) — §8.
- 2 branches `fix/service-role-flux-acl-255-v1` / `fix/document-partage-service-role-acl-v1` sans branche d'intégration commune — §8.
- 7 RPC sœurs vulnérables (`SECURITY_BLOCKER_OPEN`) — lot dédié à scoper séparément — §9.
- Colors : 3 lignées mutuellement divergentes, aucune n'est le choix évident sans porter les 4 correctifs orphelins — §12.
- Reserves : v6 (offline hardening) vs fix-train (contrats/légal), aucune ne contient l'autre — §12.
- Studio : signup ouvert — est-ce l'état voulu, ou `fix/studio-signup-closed-v1` (inexistant) référençait une fermeture jamais faite ? — §0/§8/§12.
- `logoutAction` portée globale — comportement voulu ou bug latent ? — §18.
- Accès réel Supabase Preview / Vercel Preview / Stripe Test — nécessaire pour sortir tout `NOT_PROVEN_REMOTE` — §17.
- PITR Supabase non activé par défaut — décision opérationnelle (activer l'add-on ou accepter le risque) avant toute Preview réelle — §11.

---

## Verdict final

# `CONVERGENCE PLAN READY`

Ce qui est acquis : inventaire complet (211 branches), graphe d'ascendance vérifié par `merge-base` sur 99 candidats (aucune déduction par nom), carte complète des collisions de migrations (19 numéros, dont une collision directe et documentée entre GP pilote et GP performance), détail commit-par-commit des trains GP pilote/performance/sécurité, cartographie Commercial/Access/Env/DR/Apps avec statut DEJA_CORRIGE/PROPOSE/NON_APPLIQUE/DECISION_REQUIRED explicite pour chaque item demandé, table de collisions de code et de dépendances, ordre de convergence en 8 étapes avec risques et tests par étape, liste MUST_NOT_LOSE de 12 éléments concrets, et confirmation indépendante (2 sessions distinctes, aujourd'hui) que 6 des 10 branches nommées dans la mission et le commit `f2917b54` n'existent pas dans ce dépôt.

Ce qui manque pour passer à `READY TO DEPLOY` (non demandé ici, signalé pour mémoire) : la décision explicite sur `FINAL_PREVIEW_CONVERGENCE_BASE` (§16), la correction des 7 RPC sœurs (§9), la fusion réelle (pas seulement planifiée) des étapes §15, et un accès Preview/Vercel/Supabase/Stripe réel pour lever les `NOT_PROVEN_REMOTE` de **[REHEARSAL]**.
