# ELSATIA — RÉCONCILIATION DU LEDGER DE MIGRATIONS (LOT P0)

**Date** : 2026-09-07.
**Nature** : lot de réconciliation Git + validation base de données en environnement jetable.
**Production touchée : NON.** Aucune migration appliquée en Production, aucun déploiement, aucune fusion vers `release/commercialisation-v1` ni `main`, aucun accès Supabase distant, aucun worktree ni stash supprimé.
**Aucune migration historique n'a été modifiée, renommée ni renumérotée.** Preuve en §6.

---

## 1. Verdict

# VALIDÉ

Un train d'intégration unique, rejouable et testé existe désormais :

| | |
|---|---|
| **Branche** | `integration/elsatia-ledger-reconciliation-p0-v1` |
| **SHA final poussé** | `4f1f17044a38beba3b09e6937b2f8f626a8d87e0` |
| **Remote** | `git@github.com:julien-gregurec/Appli_BTP.git` (branche poussée, **aucune PR ouverte, aucune fusion**) |
| **Base** | `4266ba6ce347ed3a4f379430442b341b67df516e` (canon GP post-cutover) |
| **Fichiers de migration** | **270** |
| **Dernier numéro fonctionnel** | **272** (`20260908000272_client_document_snapshot_v1.sql`) |
| **Fresh install** | **PASS** — 270/270 appliquées, 0 erreur |
| **Upgrades** | **PASS ×3** — depuis 210 (Production), 263 et 265 |
| **pgTAP** | **PASS** — 67 fichiers, **1 846 tests** |
| **typecheck / lint / test / build** | **PASS** — GP + Tools + Réserves |

Le fait structurant de ce lot : **aucune renumérotation n'était nécessaire.** Une fois les quatre lignées assemblées, les horodatages et les numéros fonctionnels sont strictement croissants et sans collision. Le désordre n'était pas dans les numéros, il était dans le fait qu'aucune branche ne les portait tous.

Deuxième fait structurant : **les quatre lignées sont mutuellement indépendantes** au niveau SQL (§7). Aucune des sept migrations 266→272 ne dépend d'une autre. C'est ce qui rend l'assemblage sûr, et c'est ce qui explique qu'il n'y ait eu aucun conflit de schéma.

---

## 2. Définitions — les quatre chiffres qu'il ne faut plus confondre

C'est la source de toutes les confusions signalées dans le brief. Quatre grandeurs différentes, quatre valeurs différentes :

| Grandeur | Valeur sur ce train | Ce que c'est |
|---|---|---|
| **Nombre de fichiers de migration** | **270** | `ls supabase/migrations \| wc -l` sur la branche |
| **Dernier numéro fonctionnel** | **272** | les 6 derniers chiffres du nom du dernier fichier |
| **Ledger appliqué en Production** | **210** | lignes de `supabase_migrations.schema_migrations` en Production, version max `20260824000231` |
| **Train Git** | `integration/elsatia-ledger-reconciliation-p0-v1` @ `4f1f170` | l'objet Git qui porte les 270 fichiers |

Exemple concret de l'écart, vérifié : `20260905000265_essai_30_jours_modules_catalogue_v1.sql` porte le numéro **265** mais occupe le **rang 263**. Un rapport qui écrit « ledger 265 » en parlant d'un dépôt à 263 fichiers dit deux choses vraies sur deux grandeurs différentes. **Le ledger se compte en lignes appliquées, jamais en suffixe de nom de fichier.**

Écart Production : 210 lignes appliquées pour un rang maximal de 223, parce que les rangs **195→207** (ligne TARIFS-V2 / admin / avenants, 13 migrations) n'ont jamais été appliquées en Production. `194 + 16 = 210`. Vérifié rang par rang (§3.3).

---

## 3. Inventaire global

### 3.1 Branches inspectées

Toutes les branches locales du dépôt ont été balayées (147 refs). Voici celles qui portent une lignée de migrations pertinente.

| Rôle | Branche | SHA | Fichiers | Dernière migration |
|---|---|---|---|---|
| **Canon GP post-cutover** | `integration/gp-postcutover-precommercial-ops-v1` | `4266ba6` | 265 | `20260906000267_support_reply_notification_recipient_v1` |
| Train GP antérieur (identique) | `integration/gp-postcutover-migration-train-v1` | `049a401` | 265 | idem |
| Hotfix pilote GP | `integration/gp-postcutover-pilot-hotfix-v1` | `7ba62c5` | 263 | `20260905000265` |
| Global Owner | `feat/gp-global-owner-all-apps-access-v1` | `90b636f` | 264 | `20260906000266_platform_global_owner_all_apps_v1` |
| Support Reply | `feat/gp-support-reply-email-p1-closure-v1` | `4010179` | 264 | `20260905000266_support_reply…` ⚠ **collision** |
| **Réserves v1** | `feat/reserves-v1-foundation-workflow` | `17ca07c` | 266 | `20260906000268` |
| **Réserves v2** | `feat/reserves-v2-terrain-capture` | `9652189` | 267 | `20260907000269` |
| **Réserves v3** | `feat/reserves-v3-collaboration-livrables` | `41c1a5f` | 268 | `20260907000270` |
| **Réserves v4** (retenue) | `feat/reserves-v4-e2e-offline-pdf-print` | `cb9df18` | 268 | `20260907000270` (aucune migration nouvelle) |
| **Colors V1.4** | `feat/colors-product-activity-history-v1` | `74002c2` | **229** ⚠ | `20260908000271_colors_activity_history_v14` |
| **GP Snapshot** | `feat/gp-client-document-snapshot-p0-v1` | `dfb6f35` | 266 | `20260908000272_client_document_snapshot_v1` |
| **GP Snapshot + Client Contracts** (retenue) | `integration/gp-client-contracts-snapshot-v1` | `06fb69c` | 266 | idem |
| Client Contracts | `feat/client-contracts-canonical-v1` | `e7f837b` | 263 | `20260905000265` — **aucune migration propre** ✔ |
| Drone (noyau) | `feat/drone-core-contracts-v1` | `8dcf5b8` | 263 | `20260905000265` — **aucune migration propre** ✔ |
| Drone (photogrammétrie) | `feat/drone-photogrammetry-pipeline-v1` | `698eb54` | 263 | idem ✔ |
| Tools (≈40 branches) | `integration/tools-*`, `feat/tools-*`, `release/tools-store-preflight-v1` | divers | 263 | `20260905000265` — **aucune migration propre** ✔ |
| Worktree d'audit courant | `audit/cutover-operator-readiness-v1` | `a083c37` | 263 | `20260905000265` |

Confirmé par balayage : **Tools, Drone et Client Contracts n'introduisent aucune migration.** Les seules lignées porteuses sont GP, Réserves et Colors.

### 3.2 Découverte en cours de lot

`integration/gp-client-contracts-snapshot-v1` (`06fb69c`, 2026-09-07 22:28) **n'existait pas au début de cet audit** et est apparue pendant son déroulement. Elle descend du canon GP, contient déjà le lot Snapshot (272) et y ajoute `packages/client-contracts` (33 fichiers, aucune migration). Elle a été intégrée au train (§5, commit `4f1f170`) plutôt qu'ignorée : la laisser de côté aurait recréé exactement la fragmentation que ce lot ferme.

### 3.3 Fenêtres d'application réelle

Source : `docs/audits/ELSATIA_CUTOVER_OPERATOR_READINESS_V1.md` §3, recoupé rang par rang sur le train.

| Rangs | Nombre | État Production | Susceptible d'avoir été appliquée ? |
|---|---|---|---|
| 1 → 194 | 194 | **appliquées** | oui — intouchables |
| 195 → 207 | 13 | **non appliquées** | oui en local/Preview — intouchables |
| 208 → 223 | 16 | **appliquées** | oui — intouchables |
| 224 → 263 | 40 | non appliquées | oui en local/Preview — intouchables |
| **264 → 270** | **7** | non appliquées | oui en local (bases de recette) — **traitées sans renumérotation** |

Dernière migration appliquée en Production : `20260824000231_roadmap_cleanup_v1_reconciliation_drift_production.sql`, rang 223.

---

## 4. Anomalies trouvées

### A1 — Collision réelle sur le numéro 266 (déjà résolue avant ce lot)

Deux migrations distinctes ont porté le numéro **266** sur deux branches parallèles :

| Branche | Fichier | Contenu |
|---|---|---|
| `feat/gp-global-owner-all-apps-access-v1` | `20260906000266_platform_global_owner_all_apps_v1.sql` | propriétaire global |
| `feat/gp-support-reply-email-p1-closure-v1` | `20260905000266_support_reply_notification_recipient_v1.sql` | notification de réponse support |

Le train `integration/gp-postcutover-migration-train-v1` (`049a401`) avait déjà tranché : Support Reply a été renuméroté en `20260906000267`, **à contenu strictement identique** (empreinte `6fbd8a389b18` des deux côtés, vérifiée). Rien à refaire ; le numéro `20260905000266` est définitivement **brûlé** et ne doit jamais être réutilisé.

### A2 — La branche Colors est bâtie sur une base amputée de 35 migrations

`feat/colors-product-activity-history-v1` porte **229** fichiers là où le canon en porte 263. Elle s'arrête à `20260828000249` et ajoute `20260908000271`. Les 35 migrations absentes vont de `20260815000200_reconciliation_pre_tarifs_v2` à `20260905000265_essai_30_jours_modules_catalogue_v1` — c'est-à-dire toute la ligne TARIFS-V2/avenants, toute la ligne Tools R8→R10, la réconciliation ACL `…255` et toute la ligne capacité/Stripe R2.

Conséquence : cette branche **ne peut pas être fusionnée telle quelle** ; le faire réintroduirait un dépôt sans ces 35 migrations. Traitement retenu : reprise de la seule portion base de données, à l'octet près (§5).

Circonstance atténuante vérifiée : la migration `…271` a été écrite pour être portable — son en-tête l'annonce explicitement, et elle retrouve la contrainte à modifier **par sa définition** plutôt que par un nom supposé, « afin que la migration s'applique aussi bien sur le ledger Colors que sur le socle canonique ». L'analyse de dépendances (§7) le confirme : elle ne touche que `colors_*`, `utilisateurs` et `utilisateurs_entreprises`.

### A3 — Le canon portait les migrations Colors sans aucune de leurs suites pgTAP

Anomalie **non signalée jusqu'ici**. Le canon GP contient les migrations `20260828000246` à `20260828000249` (socle fonctionnel Colors, intégrité V1.1, correctifs V1.2, nettoyage sécurité V1.3) mais **aucune** de leurs suites pgTAP : `colors_functional_core_v1`, `colors_integrity_v11`, `colors_correctifs_v12`, `colors_nettoyages_v13` n'existaient que sur la lignée Colors. Les objets `colors_*` du canon étaient donc **non couverts** par la suite pgTAP canonique.

Corrigé dans ce lot : les 4 suites manquantes ont été rapatriées, plus la nouvelle suite V1.4. Elles apportent **208 tests** (46 + 41 + 28 + 46 + 47) et **passent toutes** sur le train, ce qui prouve au passage que le schéma Colors du canon et celui de la lignée Colors sont bien équivalents.

### A4 — `verify:migrations` ne détecte pas les collisions de numéro fonctionnel

`scripts/verify-migrations.mjs` ne contrôle que l'unicité de l'**horodatage à 14 chiffres**. La collision A1 (`20260905000266` vs `20260906000266`) a deux horodatages différents : elle **passait** `verify:migrations` sans alerte. Le garde-fou n'a jamais vu le problème qu'il était censé attraper.

### A5 — Le numéro fonctionnel a été dupliqué six fois dans l'histoire canonique

Constat **antérieur à ce lot**, présent à l'identique dans le canon GP et dans le ledger 263 — le train n'en ajoute aucun :

| Numéro | Fichiers portant ce numéro | Rangs |
|---|---|---|
| `000200` | `20260812000200_documents_commerciaux_p9` · `20260815000200_reconciliation_pre_tarifs_v2` | 194 · 195 |
| `000236` | `20260826000236_platform_support_uid_security_v1` · `20260827000236_plateforme_lire_entreprise_membres_v1` · `20260830000236_elsatia_tools_r8_comptes_entitlements_sync` | 228 · 235 · 243 |
| `000237` | `20260826000237_platform_aal2_role_integrity_v1` · `20260830000237_elsatia_tools_r9_monetisation` | 229 · 244 |
| `000238` | `20260826000238_platform_write_surface_hardening_v1` · `20260831000238_elsatia_tools_r10_publication_multientreprise` | 230 · 245 |
| `000239` | `20260826000239_platform_support_isolation_audit_v1` · `20260831000239_elsatia_tools_r10_suppression_compte` | 231 · 246 |
| `000240` | `20260826000240_platform_stripe_discount_consistency_v1` · `20260901000240_security_reconciliation_tools_entitlements_aal2_v1` | 232 · 248 |

Le cas `000200` est le plus délicat : **l'un des deux est appliqué en Production (rang 194) et l'autre non (rang 195)**. Ces doublons sont inoffensifs pour l'exécution (Supabase ordonne par les 14 chiffres, tous uniques) mais rendent toute conversation par « numéro » ambiguë. **Ne pas les renommer** : trois d'entre eux sont appliqués en Production.

### A6 — Six migrations orphelines survivent sur des branches abandonnées

Migrations présentes sur une branche mais absentes du train — numéros brûlés, à ne jamais réutiliser :

| Migration orphline | Branche(s) | Sort |
|---|---|---|
| `20260825000232_elsatia_common_account_v1.sql` | `feat/elsatia-common-account-gestion-pro-v1` (`541f1ba`) | socle abandonné, jamais fusionné (documenté dans `ELSATIA_MULTI_APP_CONVERGENCE_V1.md`) |
| `20260826000238_platform_support_isolation_audit_v1.sql` | `codex/multi-app-support-isolation-audit-fix`, `codex/multi-app-stripe-audit-integrity-fix` | renuméroté en `…000239` — **contenu identique** (`dc3803026fc4`) |
| `20260826000239_platform_stripe_audit_integrity_v1.sql` | `codex/multi-app-stripe-audit-integrity-fix` | jamais canonisé sous ce numéro |
| `20260826000240_platform_stripe_audit_integrity_v1.sql` | `claude/multi-app-secure-release-adaptation-v1`, `claude/multi-app-stripe-idempotency-fix-v2` | **même migration logique, deux numéros différents sur deux branches** |
| `20260827000241_platform_stripe_operation_attempts_v1.sql` | `claude/multi-app-stripe-idempotency-fix-v2` | jamais canonisé |
| `20260828000246_residual_acl_hardening_r74.sql` | `codex/admin-global-v1-residual-acl-hardening-r74` | renuméroté en `…000252` — **contenu identique** (`0fe61ef2294a`) |
| `20260903000257_capacity_stripe_r2_v1.sql` | `codex/elsatia-capacity-stripe-r2-v1` (`fc3b313`, commit « wip ») | renuméroté en `…000258` **et réécrit** — contenus **différents** (`66922dad8bc6` vs `93b86a4a0487`) |

Le dernier cas est le plus dangereux : la branche `codex/elsatia-capacity-stripe-r2-v1` porte une version **périmée** de la migration capacité/Stripe R2 sous un numéro que le canon utilise pour autre chose.

### A7 — Insertion rétrograde du lot Snapshot

`feat/gp-client-document-snapshot-p0-v1` numérote **272** sur une base qui s'arrête à **267** : elle ne contient ni Réserves (268-270) ni Colors (271). Le numéro était donc « libre » au sens strict, mais l'ordre affiché ne correspondait à aucun ordre d'application réel. Résolu par assemblage (§5), sans renumérotation — l'analyse de dépendances (§7) montre que `272` ne dépend d'aucune des migrations 268-271.

---

## 5. Ordre final et construction du train

### 5.1 Ordre d'application définitif (extrait 263 → 272)

| Rang | Numéro | Fichier | Application | Origine (SHA d'introduction) |
|---:|---:|---|---|---|
| 261 | 000263 | `20260904000263_stripe_subscription_lifecycle_closure_v1.sql` | GP | `ca0710b` |
| 262 | 000264 | `20260904000264_entreprise_besoins_acl_fix_v1.sql` | GP | `386fbd3` |
| 263 | 000265 | `20260905000265_essai_30_jours_modules_catalogue_v1.sql` | GP | `a81f317` |
| 264 | 000266 | `20260906000266_platform_global_owner_all_apps_v1.sql` | GP / plateforme | `90b636f` (`feat/gp-global-owner-all-apps-access-v1`) |
| 265 | 000267 | `20260906000267_support_reply_notification_recipient_v1.sql` | GP / support | `049a401` (renumérotation depuis `20260905000266`) |
| 266 | 000268 | `20260906000268_reserves_v1_foundation_workflow_v1.sql` | **Réserves** | `17ca07c` |
| 267 | 000269 | `20260907000269_reserves_v2_terrain_capture_v1.sql` | **Réserves** | `9652189` |
| 268 | 000270 | `20260907000270_reserves_v3_collaboration_livrables_v1.sql` | **Réserves** | `41c1a5f` |
| 269 | 000271 | `20260908000271_colors_activity_history_v14.sql` | **Colors** | `74002c2` (repris par `f427492`) |
| 270 | 000272 | `20260908000272_client_document_snapshot_v1.sql` | GP / documents | `8743af2` |

Horodatages strictement croissants, numéros fonctionnels strictement croissants, **aucune collision** sur la plage 263→272.

### 5.2 Les quatre commits d'intégration

| Commit | Nature | Apport |
|---|---|---|
| `5a7b78c` | merge `--no-ff` de `feat/reserves-v4-e2e-offline-pdf-print` | migrations 268, 269, 270 + `apps/reserves` + 5 suites pgTAP Réserves. **Fast-forwardable** : le canon GP est ancêtre direct de Réserves. Zéro conflit. |
| `e18cb71` | merge `--no-ff` de `feat/gp-client-document-snapshot-p0-v1` | migration 272 + `src/lib/client-snapshot.ts` + suite pgTAP. Fusion à trois branches propre. Zéro conflit. |
| `f427492` | **cherry-pick de fichiers** depuis `feat/colors-product-activity-history-v1` | migration 271 + 5 suites pgTAP Colors, **à l'octet près**. La branche entière n'est pas fusionnée (§4-A2). |
| `4f1f170` | merge `--no-ff` de `integration/gp-client-contracts-snapshot-v1` | `packages/client-contracts` (aucune migration). Deux conflits résolus : `tsconfig.json` et `vitest.config.ts`, tous deux des **listes d'alias de paquets** — résolution par union des trois alias (`application-access`, `email`, `client-contracts`), aucune ligne perdue. |

### 5.3 Ce que le train ne contient volontairement pas

**Le code applicatif `apps/colors` de la lignée Colors V1.4** (200 fichiers, 34 commits, lignée divergente). Seule la portion base de données a été reprise. Justification :

- la migration `…271` est purement additive sur `colors_*` et ne casse pas le code Colors déjà présent au canon ;
- fusionner la lignée entière ferait entrer un `apps/colors` construit sans les 35 migrations manquantes ;
- l'intégration de l'écran « Activité récente » et des tris d'inventaire relève d'un **lot d'intégration Colors dédié**, à rebaser sur ce train (§10).

C'est le seul écart connu entre le train et l'état complet de l'écosystème, et il est délibéré.

---

## 6. Preuve de non-réécriture

| Contrôle | Résultat |
|---|---|
| Migrations du canon GP (265) modifiées ou disparues dans le train | **0** (comparaison des blobs Git, arbre à arbre) |
| `20260906000268_reserves_v1_…` vs source `feat/reserves-v4` | **identique** (`70b4802f1dff`) |
| `20260907000269_reserves_v2_…` vs source | **identique** (`7ee9996ca734`) |
| `20260907000270_reserves_v3_…` vs source | **identique** (`da901d1cff0c`) |
| `20260908000271_colors_activity_history_v14` vs source Colors | **identique** (`6c08595fed9c`) |
| `20260908000272_client_document_snapshot_v1` vs source Snapshot | **identique** (`9fcbf94ee375`) |
| `20260906000266_platform_global_owner_…` vs canon | **identique** (`a86ac6f044a8`) |
| `20260906000267_support_reply_…` vs canon | **identique** (`f3fec0fc5105`) |
| 5 suites pgTAP Colors vs source Colors | **identiques** (5/5) |
| Migrations renommées par ce lot | **aucune** |
| Numéros réutilisés par ce lot | **aucun** |

---

## 7. Analyse de dépendances SQL des sept migrations assemblées

Objets référencés, extraits fichier par fichier :

| Migration | Dépend de | Dépend d'une autre des sept ? |
|---|---|---|
| `…266` global owner | fonctions plateforme (≤265), `entitlements_utilisateurs_elsatia` (234), `tools_resoudre_entitlements` (236-240) | **non** |
| `…267` support reply | `support_messages`, `est_acces_support_actif`, `plateforme_exiger_role` (≤265) | **non** |
| `…268` réserves v1 | socle multi-app (234), `chantiers`, `a_permission`, `est_membre_actif`, `est_plateforme_admin` | **non** |
| `…269` réserves v2 | objets `reserves_*` de `…268`, `storage.buckets`/`storage.objects` | oui — `…268` (même lignée) |
| `…270` réserves v3 | objets `reserves_*` de `…268`/`…269` | oui — même lignée |
| `…271` colors V1.4 | `colors_*` (246→249), `utilisateurs`, `utilisateurs_entreprises` | **non** |
| `…272` client snapshot | `clients`, `contacts_clients`, `devis`, `factures`, `verrouiller_facture_emise` (222) | **non** |

**Conclusion** : hors de la chaîne interne Réserves, les quatre lignées sont **mutuellement indépendantes**. Leur ordre relatif n'a aucune conséquence fonctionnelle — ce qui est précisément pourquoi la réconciliation était possible sans renumérotation, et pourquoi elle n'a produit aucun conflit de schéma.

---

## 8. Validations exécutées

Toutes en **base jetable isolée** : projet Supabase `elsatia-ledger-p0-dbtest`, ports 583xx, conteneurs `supabase_*_elsatia-ledger-p0-dbtest`. **La base locale principale `btp-platform` (port 54322, jeu de test multi-app) n'a jamais été touchée** — aucun `db reset` n'a été lancé dessus.

### 8.1 Intégrité du ledger

| Test | Résultat |
|---|---|
| `npm run verify:migrations` | **PASS** — « 270 migrations valides, noms et horodatages uniques » |
| Collisions de numéro fonctionnel introduites par le train | **0** (les 6 doublons de A5 sont antérieurs, inchangés) |
| Horodatages strictement croissants sur 264→270 | **oui** |

### 8.2 Fresh install

| Test | Résultat |
|---|---|
| `supabase db reset` sur base vierge | **PASS**, code de sortie 0 |
| `schema_migrations` après reset | **270** lignes, `max(version) = 20260908000272` |
| Erreurs SQL | **0** (uniquement des `NOTICE` de `drop … if exists` idempotents) |

### 8.3 Upgrades

| Test | Baseline | Après | Delta | Durée | Résultat |
|---|---|---|---|---|---|
| **U1 — depuis la baseline Production** | 210 appliquées, max `20260824000231` | 270, max `20260908000272` | **+60** | 11 s | **PASS** |
| **U2 — depuis le ledger 263** | 263 appliquées, max `20260905000265` | 270 | **+7** | 3 s | **PASS** |
| **U3 — depuis le canon GP post-cutover** | 265 appliquées, max `20260906000267` | 270 | **+5** | 2 s | **PASS** |

U1 reproduit l'état réel de Production : 210 migrations, les rangs 195→207 volontairement absents, puis `supabase migration up --include-all` qui applique les 13 migrations à horodatage antérieur **plus** les 47 postérieures. C'est le chemin exact du futur cutover, prolongé jusqu'à 272.

### 8.4 pgTAP

| | |
|---|---|
| Fichiers | **67** (62 du canon + 5 suites Colors rapatriées) |
| Tests | **1 846** |
| Résultat | **All tests successful — Result: PASS** |
| Durée | 83 s |

Couverture des nouveautés : `platform_global_owner_all_apps_v1`, `support_reply_notification_recipient_v1`, `reserves_v1_foundation_workflow`, `reserves_v2_terrain_capture`, `reserves_v3_collaboration_livrables`, `reserves_v3_parcours_bout_en_bout`, `reserves_v4_resilience_reseau`, `client_document_snapshot_v1`, `colors_activity_history_v14` — toutes vertes. Fonctions, triggers et RLS sont couverts par ces suites (elles testent le comportement observable, pas la présence des objets).

### 8.5 Chaîne applicative

| Test | Périmètre | Résultat |
|---|---|---|
| `npm run typecheck` | GP + Tools + **Réserves** | **PASS** |
| `npm run lint` | GP + Tools + Réserves | **PASS** — 0 erreur, 3 avertissements préexistants (`<img>`) |
| `npm test` | GP **1 208** · Tools **108** (20 fichiers) · Réserves **92** (8 fichiers) = **1 408 tests** | **PASS** |
| `next build` (GP) | 38 pages statiques | **PASS** |
| `next build` (Tools) | 36 pages | **PASS** |
| `next build` (Réserves) | 19 pages | **PASS** |

Build réalisé avec un `.env.local` **local et jetable** ne contenant que les clés publiques de démonstration de la stack Supabase locale — aucun secret réel n'a été copié, et le fichier a été supprimé avant le push.

### 8.6 Incidents d'environnement rencontrés (sans impact sur le verdict)

1. **`apps/reserves` n'avait pas de `node_modules`** dans le worktree neuf : le typecheck a d'abord échoué sur `pdfjs-dist` et `@elsatia/application-access` — un défaut d'environnement, pas du train. Après installation des dépendances : **PASS**.
2. **`supabase db reset` a échoué trois fois de suite** sur `supabase_storage_… container is not ready: unhealthy` — un blocage du conteneur Storage sous la charge de sept stacks Supabase locales simultanées, **après** l'application des migrations. Contourné en désactivant les services non nécessaires (studio, realtime, analytics, edge runtime, inbucket) dans la config **du harnais de test uniquement**. Tentative de désactiver aussi `storage` : rejetée immédiatement, car les migrations écrivent dans `storage.buckets` — le service doit rester actif. La configuration de test a été **entièrement restaurée** avant le push (`git checkout -- supabase/config.toml`), le train ne la porte pas.

---

## 9. Ledger final

```
Branche          : integration/elsatia-ledger-reconciliation-p0-v1
SHA              : 4f1f17044a38beba3b09e6937b2f8f626a8d87e0
Base             : 4266ba6ce347ed3a4f379430442b341b67df516e

Fichiers         : 270 migrations   (supabase/migrations/*.sql)
Numéro maximal   : 000272           (20260908000272_client_document_snapshot_v1.sql)
Suites pgTAP     : 67 fichiers, 1 846 tests
Applications     : GP · Colors · Tools · Réserves   (Drone : contrats TS, aucune migration)
Production       : 210 appliquées, max 20260824000231 — INCHANGÉE
Delta au cutover : 60 migrations
```

---

## 10. Nouveau canon de numérotation proposé

Règles à appliquer à partir de `20260908000272`.

1. **Le format ne change pas** : `AAAAMMJJ` + numéro fonctionnel sur 6 chiffres + `_description.sql`. Les 14 chiffres restent la seule clé d'ordre réellement lue par Supabase.
2. **Le numéro fonctionnel est alloué depuis le train, pas depuis sa propre branche.** Avant d'écrire une migration : `git fetch origin && git ls-tree --name-only origin/integration/…-p0-v1 -- supabase/migrations | tail -1`. Le nouveau numéro est celui-là + 1. C'est la règle dont l'absence a produit la collision A1.
3. **Un numéro alloué n'est jamais réattribué**, même si la branche est abandonnée. La liste des numéros brûlés est en §4-A6.
4. **Toute branche applicative se rebase sur le train avant d'écrire sa migration.** Une branche à 229 fichiers ne peut pas numéroter à 271 (A2).
5. **Le train est la seule base autorisée** pour un lot qui touche la base de données. Les branches applicatives ne sont plus des bases.
6. **`verify:migrations` doit être étendu** pour refuser un numéro fonctionnel déjà utilisé (A4) — sauf pour les six doublons historiques de A5, à inscrire en liste d'exception explicite puisqu'ils sont appliqués ou figés. **Non fait dans ce lot** : c'est une modification de garde-fou, hors périmètre P0, à traiter en P1 (§13).
7. **Une migration transverse est écrite pour être portable** : retrouver une contrainte par sa définition plutôt que par un nom généré, `if exists` / `if not exists` systématiques. La migration Colors `…271` est le bon exemple à copier.

---

## 11. Branches à ne plus utiliser comme base

| Branche | Raison |
|---|---|
| `feat/colors-product-activity-history-v1` | 229 fichiers — **35 migrations canoniques absentes** (A2) |
| `feat/gp-support-reply-email-p1-closure-v1` | porte `20260905000266`, **numéro brûlé** remplacé par `…000267` (A1) |
| `codex/elsatia-capacity-stripe-r2-v1` | porte une version **périmée et divergente** de `capacity_stripe_r2_v1` sous le numéro `…257` (A6) |
| `claude/multi-app-stripe-idempotency-fix-v2`, `claude/multi-app-secure-release-adaptation-v1` | portent `…000240_platform_stripe_audit_integrity_v1` et `…000241`, jamais canonisées (A6) |
| `codex/multi-app-stripe-audit-integrity-fix`, `codex/multi-app-support-isolation-audit-fix` | portent `…000238`/`…000239` sous des noms renumérotés depuis (A6) |
| `codex/admin-global-v1-residual-acl-hardening-r74` | porte `…000246_residual_acl_hardening_r74`, renuméroté en `…000252` (A6) |
| `feat/elsatia-common-account-gestion-pro-v1` (`541f1ba`) | socle multi-app **abandonné**, jamais fusionné |
| `main` (`4d92ddb`, 2026-07-29) | **six semaines de retard**, ledger sans rapport avec le canon — ne jamais reconstruire depuis `main` |
| `feat/reserves-v1/v2/v3` | superseded par `feat/reserves-v4-e2e-offline-pdf-print` |
| `feat/gp-client-document-snapshot-p0-v1` | superseded par `integration/gp-client-contracts-snapshot-v1` |
| `integration/gp-postcutover-migration-train-v1`, `integration/gp-postcutover-precommercial-ops-v1` | corrects mais **superseded** par le train de ce lot |

Aucune de ces branches n'a été supprimée. Aucun worktree, aucun stash n'a été touché (trois stashes préexistants vérifiés intacts).

---

## 12. Risques

| # | Risque | Gravité | État |
|---|---|---|---|
| R1 | Une nouvelle branche numérote depuis sa propre base et recrée une collision | **élevé** | ouvert — atténué par le canon §10, non outillé (voir R2) |
| R2 | `verify:migrations` reste aveugle aux collisions de numéro fonctionnel | **élevé** | **ouvert** — correctif proposé §13, non implémenté (hors périmètre P0) |
| R3 | Le code `apps/colors` V1.4 n'est pas dans le train ; la migration `…271` l'est | moyen | **connu et documenté** — la migration est additive, le canon reste fonctionnel ; lot Colors dédié à prévoir |
| R4 | Les six doublons historiques de numéro (A5) rendent toute discussion « par numéro » ambiguë | moyen | permanent — **ne pas corriger** (trois sont appliqués en Production) |
| R5 | Une base locale de recette a déjà appliqué `20260905000266` (numéro brûlé) | faible | à vérifier avant réutilisation d'une base locale ancienne ; les bases jetables du jour sont saines |
| R6 | Le delta au cutover passe de 53 à **60 migrations** | moyen | le préflight de cutover (`ELSATIA_PRODUCTION_CUTOVER_PREFLIGHT_V1.md`) chiffre encore 53 : **à réactualiser** avant la fenêtre |
| R7 | Instabilité locale du conteneur Storage sous forte charge Docker | faible | contournement documenté §8.6 ; n'affecte pas les migrations |
| R8 | Une nouvelle branche d'intégration peut apparaître entre l'assemblage et la fusion | moyen | avéré pendant ce lot (§3.2) — vérifier `git for-each-ref` juste avant toute fusion |

---

## 13. Suites recommandées (non exécutées ici)

1. **Étendre `scripts/verify-migrations.mjs`** : refuser un numéro fonctionnel déjà pris, avec liste d'exception explicite pour les six doublons de A5. Petit lot, ferme R1 et R2.
2. **Réactualiser le préflight de cutover** : le delta n'est plus 53 mais 60, et la version cible n'est plus `20260905000265` mais `20260908000272` (R6).
3. **Lot d'intégration Colors V1.4** : rebaser `apps/colors` sur le train, la migration `…271` y étant déjà (R3).
4. **Rebaser les branches Tools actives** sur le train — elles ne portent aucune migration, le rebasage est sans risque de ledger.
5. **Puis seulement** ouvrir les lots DOE / bibliothèque technique, qui disposent enfin d'une base unique et rejouable.

---

## 14. Ce que ce lot n'a pas fait

- Aucune migration créée, modifiée, renommée ou renumérotée.
- Aucune fonction métier ajoutée. Aucun développement DOE ni bibliothèque.
- Aucune fusion vers `main`, `release/commercialisation-v1` ou une branche de production.
- Aucun déploiement, aucun accès Supabase distant, aucune écriture Production.
- Aucun `db reset` sur la base locale principale `btp-platform`.
- Aucun worktree supprimé, aucun stash supprimé, aucune branche supprimée.
- Aucun secret réel copié : le `.env.local` de validation ne contenait que les clés publiques de démonstration de la stack locale, et il a été supprimé avant le push.

---

## Verdict final

# VALIDÉ

`integration/elsatia-ledger-reconciliation-p0-v1` @ **`4f1f17044a38beba3b09e6937b2f8f626a8d87e0`**, poussée sur `origin`.

**270 fichiers · numéro maximal 272 · fresh install PASS · 3 upgrades PASS (dont 210 → 270 depuis la baseline Production) · pgTAP 67/67 fichiers, 1 846 tests · typecheck, lint, 1 408 tests Vitest et 3 builds PASS.**

Le train est la base unique à utiliser pour tout lot ultérieur touchant la base de données — DOE et bibliothèque technique inclus. Une seule réserve connue, documentée et volontaire : le code applicatif `apps/colors` V1.4 reste à intégrer par un lot Colors dédié, la migration correspondante étant déjà dans le train.
