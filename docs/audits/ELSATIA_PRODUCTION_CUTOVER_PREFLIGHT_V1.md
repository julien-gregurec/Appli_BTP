# ELSATIA — Préflight de cutover Production V1

**Lot :** `ELSATIA-PRODUCTION-CUTOVER-PREFLIGHT-V1` — 2026-09-07
**Nature :** audit et préparation **uniquement**.
**Production touchée : NON.** Aucune migration appliquée, aucun déploiement, aucune mutation
Stripe, aucun enregistrement DNS modifié, aucune sauvegarde Production exécutée, aucun secret
affiché.

Toutes les valeurs de ce document ont été **recalculées depuis le dépôt** pendant ce lot. Aucune
n'est reprise d'un rapport antérieur sans recontrôle. Les valeurs qui n'ont pas pu être vérifiées
(état réel de la base Production, plan Supabase, DNS live, Stripe Live) sont explicitement
marquées **NON VÉRIFIABLE EN SESSION** et renvoyées en action opérateur.

---

## 0. Position de ce document dans le corpus

Le corpus cutover est **fragmenté sur plusieurs branches**. Ce document ne le remplace pas : il
le **recontrôle** et fournit les trois livrables demandés sur la branche courante.

| Document | Branche | Statut |
|---|---|---|
| `ELSATIA_GP_CUTOVER_DAY_OF_RUNBOOK_V1.md` | `docs/gp-cutover-documentation-closure-v1` (+ `…-on-hotfix-v1`) | **fait foi le jour J** — non présent sur la branche courante |
| `INDEX_CUTOVER_GP_V1.md` | idem | dit quel document fait foi |
| `ELSATIA_PRODUCTION_CUTOVER_PREFLIGHT_FINAL_V1.md` (v1.3 ici, v1.5 ailleurs) | branche courante + autres | référence détaillée, non opératoire seule |
| `ELSATIA_PRODUCTION_ROLLBACK_V1.md` | branche courante | référence détaillée rollback |
| `ELSATIA_PRODUCTION_CUTOVER_OPERATOR_CHECKLIST_V1.md` | branche courante | **SUPERSEDED** |
| **ce document + les 2 runbooks du même lot** | branche courante | audit indépendant + runbook exécutable + GO/NO-GO |

⚠ **Risque documentaire confirmé par recontrôle.** La copie du préflight présente sur la branche
courante (`…PREFLIGHT_FINAL_V1.md`, v1.3) annonce comme cible applicative le SHA **`1d15289`**.
Ce n'est pas la valeur contractuelle. Voir §1.3 : `996be15` est la cible, `1d15289` en est le
parent applicatif strict. Un opérateur qui imprimerait la checklist depuis cette branche lirait
le mauvais SHA. **Ne rien imprimer depuis la branche courante sans passer par le §1.3 ci-dessous.**

---

## 1. Audit du ledger

### 1.1 Ledger dépôt (mesuré)

```
$ ls supabase/migrations/*.sql | wc -l          → 263
$ dernière version                              → 20260905000265_essai_30_jours_modules_catalogue_v1.sql
$ npm run verify:migrations                     → 263 migrations valides, noms et horodatages uniques
```

**Ledger dépôt = 263 migrations. Version maximale = `20260905000265`.**

Le nombre (263) et le numéro de série (265) diffèrent : la numérotation comporte des trous et des
doublons de suffixe sur des dates différentes (`20260826000236`, `20260827000236`,
`20260830000236`). **Le ledger se compte en lignes appliquées, jamais en suffixe.** Confusion
historique la plus fréquente sur ce projet.

### 1.2 Ledger Production

**NON VÉRIFIABLE EN SESSION.** Aucun accès Production. Contrôles effectués :

- CLI Supabase disponible en `node_modules/.bin/supabase` **v2.109.1** ;
- `supabase/.temp/project-ref` = **`pgvvpqyjziyapbbkydmc`** → la CLI locale est liée au projet
  **Preview**, jamais à Production (`exhvuzegsefmoguxoiak`, eu-west-3). État conforme.

Baseline **attendue** (à confirmer à T-60, gate P0-1) : **210 migrations**, dernière version
**`20260824000231_roadmap_cleanup_v1_reconciliation_drift_production`**.

Cette baseline est **opposable côté dépôt** : le commit `5777abb` (« fix(db) : réconcilier la
dérive de schéma Preview→Production », 2026-08-24) porte exactement **210 fichiers de migration**,
de version maximale `20260824000231`. C'est l'image Git de l'état Production attendu.

### 1.3 Cible de cutover

| Élément | Valeur vérifiée |
|---|---|
| SHA applicatif cible | **`996be15c136f09d9977375e700462b503a1720c3`** |
| Branche portant ce SHA | `feat/elsatia-commercial-canonical-r1-r2-r3-v1` (HEAD) |
| Ledger cible | **263** (263 fichiers, max `…000265`) |
| Parent applicatif | `1d15289` — `git diff 1d15289 996be15` = **2 fichiers, documentation seule** (`…OPERATOR_CHECKLIST…`, `…PREFLIGHT_FINAL…`). Arbre applicatif et `supabase/migrations/` **identiques au bit près**. |
| Production Branch Vercel | `release/commercialisation-v1` — **jamais** `main`, `feat/*`, `integration/*` |
| Hotfix pilote post-cutover | `7ba62c5315213bf21b9ed8553408fc678e943327`, descend de `996be15`, **0 migration** |

**Valeurs périmées à ne jamais utiliser comme consigne :** SHA `c1930ab`, `a81f317`, `b371641`,
`1d15289` ; ledger 253 / 261 ; gap 50 / 51 ; baseline 211.
`a81f317` conserve un statut légitime : c'est le SHA d'exécution du drill DB, opposable pour
`996be15` car l'arbre `supabase/migrations/` y est identique. Ce n'est **pas** une cible de
déploiement.

### 1.4 Promotion — faisabilité vérifiée

```
$ git merge-base --is-ancestor origin/release/commercialisation-v1 996be15   → VRAI
```
→ la promotion en **fast-forward strict** de `996be15` dans `release/commercialisation-v1` est
possible. Aucun merge, aucun rebase, aucun force-push.

⚠ **Deux écarts de branches détectés pendant ce lot :**

1. `release/commercialisation-v1` **locale** est **3 commits en retard** sur `origin`
   (`git rev-list --left-right --count` → `0 3`). `git fetch origin` est **obligatoire** avant
   toute promotion, sinon le fast-forward part d'une base fausse.
2. La branche de travail courante (`feature/tools-tracing-workshop-ui-v1`, `2aa3a68`) descend de
   `996be15` mais **pas** de `7ba62c5`. Les deux lignes ont divergé. Le cutover ne doit être
   opéré ni depuis cette branche, ni depuis son HEAD.

### 1.5 Branches porteuses de migrations concurrentes

Aucune migration concurrente au-delà de 263 n'a été trouvée : `996be15`, `7ba62c5` et la branche
de travail courante portent tous **263 fichiers**, version max identique. Le **gel du ledger à
263** tient. Toute migration ajoutée avant le cutover invalide les drills Fresh/Restore/rollback
et les runbooks : **265 attend le cutover.**

---

## 2. Inventaire des migrations manquantes

### 2.1 Volume et nature — recalculés

```
$ git diff --name-status 5777abb 996be15 -- supabase/migrations/
  → 53 A, 0 M, 0 D
```

**Gap = 53 migrations, strictement append-only.** Aucun fichier modifié, aucun supprimé : le
risque de réécriture d'historique est nul.

### 2.2 `--include-all` est obligatoire, et pourquoi

**13 des 53 migrations portent un horodatage antérieur** à la version maximale de Production
(`20260824000231`) : `…000200` à `…000215`. Elles ont été introduites par la canonicalisation
d'historique. Sans le flag, `supabase migration up --linked` ne les prendrait pas.

**Commande canonique — le flag n'est pas optionnel :**

```bash
supabase migration up --linked --include-all
```

### 2.3 Ordre exact d'exécution (lexical par version)

| # | Migration | Fonction | Risque |
|---:|---|---|:--:|
| 1 | `…000200_reconciliation_pre_tarifs_v2` | prépare TARIFS-V2 en append-only | LOW |
| 2 | `…000201_tarifs_v2_catalogue` | nouvelle grille commerciale, sans effet rétroactif | MEDIUM |
| 3 | `…000202_admin_v1_roles_plateforme` | source de vérité + moindre privilège admin ELSATIA | **HIGH** |
| 4 | `…000203_promo_v1_administration_commerciale` | administration traçable des conditions commerciales | MEDIUM |
| 5 | `…000204_c6b_corrections_premier_client` | 3 blocants du premier parcours client | MEDIUM |
| 6 | `…000205_securiser_cout_horaire_employe` | isole `cout_horaire` dans une table dédiée RLS ; **`drop column`** | **CRITICAL** |
| 7 | `…000206_historiser_cout_horaire_pointage` | fige le coût horaire à la validation du pointage | MEDIUM |
| 8 | `…000210_verrou_devis_accepte` | immuabilité base d'un devis accepté | LOW |
| 9 | `…000211_paiements_et_anti_surfacturation` | paiements + anti-surfacturation | MEDIUM |
| 10 | `…000212_facture_lock_v1` | verrouillage d'une facture émise | LOW |
| 11 | `…000213_avenants_v1_modele` | modèle de données avenants (2 tables) | MEDIUM |
| 12 | `…000214_avenants_v1_rpc` | RPC avenants + montant contractuel canonique | MEDIUM |
| 13 | `…000215_avenants_v1_integration_facturation` | intégration du montant contractuel | MEDIUM |
| 14 | `…000232_platform_function_signature_preflight_v2` | `drop function plateforme_entreprises()` **conditionnel** si la signature Production porte encore `option_ia` | **HIGH** |
| 15 | `…000233_admin_plateforme_julien_elsatia_fr` | insert admin plateforme (`on conflict do nothing`) | LOW |
| 16 | `…000234_elsatia_multi_app_convergence_v1` | **socle multi-app** GP + Colors + Tools (5 tables) | **CRITICAL** |
| 17 | `…000235_platform_admin_uid_canonical_v1` | modèle admin par UID | HIGH |
| 18 | `…000236_platform_support_uid_security_v1` | admin/support sécurisés par UID | HIGH |
| 19 | `…000237_platform_aal2_role_integrity_v1` | **impose AAL2** aux mutations plateforme sensibles | **CRITICAL** |
| 20 | `…000238_platform_write_surface_hardening_v1` | ferme les surfaces d'écriture plateforme résiduelles | HIGH |
| 21 | `…000239_platform_support_isolation_audit_v1` | isolation stricte du contenu support | HIGH |
| 22 | `…000240_platform_stripe_discount_consistency_v1` | remises Stripe récupérables après interruption | HIGH |
| 23 | `…000241_platform_stripe_proof_webhook_coordination_v1` | sépare demande utilisateur et preuve Stripe | HIGH |
| 24 | `…000242_revoke_legacy_discount_rpcs_v1` | révoque 2 RPC de remise historiques | MEDIUM |
| 25 | `…000236_plateforme_lire_entreprise_membres_v1` (27/08) | lecture privilégiée bornée des membres | LOW |
| 26 | `…000243_discount_column_guard_r71` | colonnes de remise verrouillées | HIGH |
| 27 | `…000244_stripe_state_attestation_r72` | **registry d'attestation Ed25519** | **HIGH** |
| 28 | `…000245_stripe_discount_observation_r73` | observation Stripe portée par l'attestation | HIGH |
| 29 | `…000246_colors_functional_core_v1` | **cœur métier Colors** (5 tables) | **CRITICAL** |
| 30 | `…000247_colors_integrity_v11` | intégrité et traçabilité Colors | HIGH |
| 31 | `…000248_colors_correctifs_v12` | levée des réserves revue V1.1 | MEDIUM |
| 32 | `…000249_colors_security_cleanup_v13` | fermeture des droits d'écriture directs Colors | HIGH |
| 33 | `…000236_elsatia_tools_r8_comptes_entitlements_sync` (30/08) | **compte commun + entitlements Tools** | **CRITICAL** |
| 34 | `…000237_elsatia_tools_r9_monetisation` | convergence Stripe / StoreKit / Google Play → entitlements | **CRITICAL** |
| 35 | `…000238_elsatia_tools_r10_publication_multientreprise` | contexte entreprise + isolation projets Tools | HIGH |
| 36 | `…000239_elsatia_tools_r10_suppression_compte` | suppression de compte in-app (obligation RGPD Store) | MEDIUM |
| 37 | `…000250_platform_promotion_aal2_hardening_v1` | AAL2 sur les RPC de promotion | HIGH |
| 38 | `…000240_security_reconciliation_tools_entitlements_aal2_v1` (01/09) | réconciliation sécurité Tools/AAL2 | HIGH |
| 39 | `…000251_platform_lister_admins_statut_identite_v1` | statut d'identité des admins | LOW |
| 40 | `…000252_residual_acl_hardening_r74` | ACL résiduelles | MEDIUM |
| 41 | `…000253_support_message_author_guard_r75` | l'entreprise n'écrit plus directement dans le fil support | MEDIUM |
| 42 | `…000254_migration_canonicalization_v2` | **fermeture append-only de la canonicalisation** ; restaure les définitions canoniques | **HIGH** |
| 43 | `…000255_acl_reconciliation_v1` | **~1 240 REVOKE** de réconciliation ACL | **CRITICAL — POINT DE NON-RETOUR** |
| 44 | `…000256_active_person_capacity_r1_v1` | compteur personnes actives + garde de capacité | HIGH |
| 45 | `…000257_modules_a_la_carte_r3_v1` | modules à la carte | HIGH |
| 46 | `…000258_capacity_stripe_r2_v1` | socle capacité Stripe (données + verrou + saga) | HIGH |
| 47 | `…000259_capacity_stripe_r2_b_v1` | chemin de service webhook/cron | HIGH |
| 48 | `…000260_capacity_stripe_r2_d_cancel_scheduled_v1` | annulation d'une baisse planifiée | MEDIUM |
| 49 | `…000261_capacity_stripe_r2_d_close_converged_op_v1` | fermeture d'opération convergente | MEDIUM |
| 50 | `…000262_stripe_subscription_webhook_acl_v1` | ACL canonique du webhook abonnement | HIGH |
| 51 | `…000263_stripe_subscription_lifecycle_closure_v1` | clôture du cycle de vie abonnement | HIGH |
| 52 | `…000264_entreprise_besoins_acl_fix_v1` | correctif ACL onboarding `entreprise_besoins` | MEDIUM |
| 53 | `…000265_essai_30_jours_modules_catalogue_v1` | essai 30 j borné aux modules catalogue `actif` | MEDIUM |

**Répartition :** CRITICAL 7 · HIGH 22 · MEDIUM 20 · LOW 4.

### 2.4 Rollback par migration

**Aucune migration `down` n'existe dans le dépôt** (`find supabase -iname "*down*" -o -iname "*rollback*"` → vide).
Conséquence structurelle, valable pour **les 53** :

> Le rollback n'est **jamais** un « défaire la migration ». C'est **forward-fix** (A) ou
> **restauration de sauvegarde** (B), avec perte de toutes les écritures postérieures au point de
> restauration.

### 2.5 Analyse de risque — contrôles exécutés dans ce lot

Quatre contrôles ont été menés sur le contenu réel des 53 fichiers. Ils vont au-delà de ce que
couvraient les drills, qui comparaient les ACL mais **pas les corps de fonctions**.

**A. Destruction de données — recherche exhaustive.**
- Aucun `TRUNCATE TABLE`. Les 3 occurrences du mot sont un nom de privilège dans un `revoke` et
  un commentaire.
- Aucun `DELETE FROM` au niveau migration. Les 4 occurrences sont **dans des corps de fonctions**
  (logique RPC), pas exécutées à l'application.
- **Un seul `DROP COLUMN` réel** : `…000205` → `alter table public.employes drop column cout_horaire;`.
  La donnée est **recopiée avant** dans `public.employes_cout_horaire`, donc pas de perte — mais
  l'opération est **structurellement irréversible sans restauration**.

> ⚠ **Conséquence opérationnelle majeure, non consignée jusqu'ici.** Le point de non-retour
> documenté est la migration **#43** (`…000255_acl_reconciliation_v1`). Le **premier geste
> irréversible réel est la migration #6** (`…000205`). Entre #6 et #43, un rollback n'est déjà
> plus un forward-fix simple : il exige la restauration. Le runbook de ce lot déplace donc le
> gate de décision **avant #6**, pas avant #43.

**B. Inversion d'horodatage — hasard de réécriture.**
Les 13 migrations `…200`–`…215` s'appliquent **après** des migrations déjà présentes en Production
qui portent un horodatage **postérieur**. Si un objet est défini dans les deux, la version tardive
en horloge (celle du gap) **écrase** la version déjà en place. Recherche systématique : **8 cas**.

| Fonction | Définie dans (gap) | Déjà appliquée en Prod (ts postérieur) | Verdict |
|---|---|---|---|
| `plateforme_entreprises` | `…000202` | `…000223` | re-canonicalisée par `…000237` — **OK** |
| `plateforme_appliquer_remise` | `…000202` | `…000223` | re-canonicalisée par `…000237`/`…000239` — **OK** |
| `plateforme_retirer_remise` | `…000202` | `…000223` | re-canonicalisée par `…000237`/`…000239` — **OK** |
| `valider_preuve_pointage` | `…000206` | `…000218`, `…000219` | re-canonicalisée par `…000254` — **OK** |
| `initialiser_essai_entreprise` | `…000204` | `…000231` | non re-canonicalisée → **définitions comparées : identiques** — OK |
| `verrouiller_devis_accepte` | `…000210` | `…000231` | non re-canonicalisée → **identiques (normalisé)** — OK |
| `verrouiller_lignes_devis_accepte` | `…000210` | `…000231` | non re-canonicalisée → **identiques (normalisé)** — OK |
| `verrouiller_facture_emise` | `…000212` | `…000222` | non re-canonicalisée → **corps identique**, seul diffère `set search_path = public` vs `to 'public'` et le tag de dollar-quoting — sémantiquement équivalent — OK |

**Verdict : aucune régression fonctionnelle par inversion d'horodatage. Classe de risque fermée.**
Cas notable, sans blocage : la définition finale de `valider_preuve_pointage` (issue de `…000254`)
**ne renseigne plus** `pointages.cout_horaire_applique`. La colonne et son backfill existent, mais
plus aucun snapshot n'est écrit ensuite. Comportement canonique assumé en amont ; à connaître si
la rentabilité affiche des coûts figés incomplets après cutover. **Non bloquant.**

**C. Créations d'objets non gardées — risque d'échec dur.**
Quatre créations sans `if not exists` dans les 13 migrations précoces :

| Objet | Migration | Présent dans la baseline Git 210 ? |
|---|---|---|
| table `public.employes_cout_horaire` | `…000205` | **non** |
| colonne `public.pointages.cout_horaire_applique` | `…000206` | **non** |
| table `public.avenants` | `…000213` | **non** |
| table `public.lignes_avenants` | `…000213` | **non** |

Côté dépôt, aucune collision. **Mais Production a un antécédent de dérive hors migration** — la
migration `…000231` n'existe que pour cette raison. Si l'un de ces objets a été créé hors ledger
en Production, la migration **échoue en dur** au pas #6 ou #11.
→ **Sentinelle ajoutée au gate P0-1** (runbook §T-60, requête 4). Coût : une requête en lecture
seule. Gain : évite un échec au milieu d'une fenêtre de maintenance.

**D. Migration conditionnelle `…000232`.** Elle exécute un `drop function plateforme_entreprises()`
**uniquement si** la signature Production porte encore `option_ia_statut`. No-op ailleurs. C'est
la seule migration dont le comportement dépend de l'état réel de Production : son résultat est un
**point d'observation obligatoire** dans les contrôles post-application.

---

## 3. Dépendances produits

### 3.1 Matrice migration × produit

Établie par analyse du contenu réel des 53 fichiers (marqueurs `apps.*`/habilitations,
`elsatia_tools`/`entitlement`, `colors_`, `stripe`, `plateforme_`).

| Migration | GP | Tools | Colors | Réserves | Monétisation | Global owner / support | Criticité |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `…200`–`…201` (tarifs) | ✅ | — | — | — | ✅ | — | MEDIUM |
| `…202` admin rôles plateforme | ✅ | — | — | — | ✅ | ✅ | HIGH |
| `…203` promo commerciale | ✅ | — | — | — | ✅ | ✅ | MEDIUM |
| `…204`–`…206`, `…210`–`…215` (métier GP) | ✅ | — | — | — | — | — | LOW→CRITICAL |
| `…232`–`…233` | ✅ | — | — | — | — | ✅ | LOW/HIGH |
| **`…234` convergence multi-app** | ✅ | ✅ | ✅ | (socle) | ✅ | ✅ | **CRITICAL** |
| `…235`–`…239`, `…243`, `…250`–`…253` (durcissement plateforme) | ✅ | ✅ | ✅ | — | ✅ | ✅ | HIGH |
| `…240`–`…241`, `…244`–`…245` (Stripe plateforme + Ed25519) | ✅ | — | — | — | ✅ | ✅ | HIGH |
| `…242` révocation RPC remise | ✅ | — | — | — | ✅ | ✅ | MEDIUM |
| **`…246`–`…249` Colors** | — | — | ✅ | — | — | — | **CRITICAL** |
| **`…236`(30/08) Tools R8** | — | ✅ | — | — | ✅ | ✅ | **CRITICAL** |
| **`…237`(30/08) Tools R9 monétisation** | — | ✅ | — | — | ✅ | — | **CRITICAL** |
| `…238`–`…239`(31/08) Tools R10 | — | ✅ | — | — | — | — | HIGH |
| `…240`(01/09) réconciliation Tools/AAL2 | — | ✅ | — | — | — | ✅ | HIGH |
| **`…255` réconciliation ACL** | ✅ | ✅ | ✅ | — | ✅ | ✅ | **CRITICAL** |
| `…256`–`…257` capacité + modules | ✅ | ✅ | — | — | ✅ | ✅ | HIGH |
| `…258`–`…263` capacité Stripe + lifecycle | ✅ | — | — | — | ✅ | — | HIGH |
| `…264`–`…265` correctifs onboarding + essai | ✅ | ✅ | — | — | ✅ | — | MEDIUM |

### 3.2 Ce que le cutover débloque, produit par produit

| Produit | État Production **avant** cutover | Débloqué par | État **après** cutover |
|---|---|---|---|
| **Gestion Pro** | fonctionnel au socle 210 ; ni multi-app, ni capacité, ni modules à la carte | tout le gap | complet : capacité X/Y, modules, saga Stripe capacité, webhook ACL canonique |
| **Colors** | **mur de connexion** — le socle (`…234`) et le cœur métier (`…246`–`…249`) n'existent pas | `…234`, `…246`–`…249` | login + dashboard + rôle organisation. ⚠ le **canon applicatif Colors reste à déployer séparément** |
| **Tools** | free/offline uniquement. Les **8 routes de facturation** (`src/app/api/tools/monetization/**`) sont hébergées dans GP et reposent sur `…236`–`…240` → **404/500 en Production** | `…234`, `…236`–`…240`(30-31/08), `…240`(01/09) | compte, entitlement Pro, cloud, vérification d'achat serveur → **prérequis dur à toute soumission Store** |
| **Réserves** | **hors périmètre** | — | **aucune migration du gap ne concerne Réserves.** Ni application, ni package, ni entrée au catalogue d'accès. Contrat d'intégration non écrit (E-21). **À ne pas tester au post-cutover** : il n'y a rien à tester. |
| **Monétisation** | routes GP présentes, chaînes Tools absentes | `…237`(30/08), `…240`–`…245`, `…256`–`…263` | fonctionnelle **en Stripe TEST**. Live = lot P15 distinct |
| **Global owner / support** | modèle admin partiel, pas d'AAL2 imposé | `…202`, `…235`–`…239`, `…250`–`…253` | matrice de rôles + AAL2 + isolation support |

### 3.3 Enchaînement imposé

```
Supabase Pro + backups          →  cutover DB (53 migrations)
                                →  déploiement app 996be15
                                →  Tools backend facturation opérationnel
                                →  soumission Stores
                                →  (séparément) Stripe Live = lot P15
```
Toute soumission Store **avant** le cutover expose un backend de vérification d'achat inexistant.

---

## 4. Sauvegardes obligatoires

Spécification. **Aucune sauvegarde Production n'a été exécutée dans ce lot.**

| # | Sauvegarde | Commande / moyen | Emplacement | Vérification |
|---|---|---|---|---|
| B1 | Snapshot managé Supabase | Dashboard projet `exhvuzegsefmoguxoiak` | Supabase | id + horodatage UTC notés ; rétention ≥ T0+24 h ; **exige le plan Pro** |
| B2 | Dump DB chiffré | `supabase db dump --db-url "$PROD_URL" -f "$DR/database/elsatia_prod_<backup_id>.dump"` (format custom, compressé) | `/Volumes/ELSATIA-PRODUCTION-DR/ELSATIA-PRODUCTION-BACKUPS/database/` **uniquement** | SHA-256 calculé **puis relu** ; manifeste (taille, SHA-256, nb objets TOC, `backup_id`) |
| B3 | Backup Storage (13 buckets) | `backup-storage` puis `verify-storage-backup` | `…/storage/` | `verify-storage-backup` **PASS** ; SHA-256 par objet |
| B4 | Métadonnées Auth | export utilisateurs + facteurs MFA (comptage, **jamais** les secrets) | `…/manifest/` | nb utilisateurs, nb facteurs TOTP |
| B5 | État avant migration | ledger complet, inventaire ACL (`aclexplode` + policies), inventaire `plateforme_admins`, **sentinelles §C ci-dessus** | `…/manifest/` | archivés, horodatés |
| B6 | Corrélation | même `backup_id` (horodatage UTC, ex. `20260907T143000Z`) sur B2, B3, B4, B5 | `…/manifest/` | cohérence croisée |
| B7 | **Test de restauration** | dump → base probe jetable → relire les sentinelles | base jetable, **jamais** Preview ni Production | sentinelles identiques avant/après |

**Règles absolues :** tout reste **dans le volume DR chiffré monté** ; aucun fichier en clair
hors volume ; aucun secret dans un manifeste, un dump, un ticket ou un log ; le rôle de dump
dédié `elsatia_backup` (NOLOGIN hors fenêtre) est réactivé le temps du dump puis refermé.

**État du support DR vérifié en session :** `/Volumes/ELSATIA-PRODUCTION-DR` **monté**,
**1,4 Tio libres**. Suffisant. `/` dispose de 29 Gio (l'alerte historique « SSD à 1,6 Gio » n'est
plus d'actualité). Plusieurs agents peuvent écrire ce volume : vérifier la stabilité (mtime,
conteneurs Docker arrêtés) avant toute écriture.

⚠ **Sans plan Pro, B1 n'existe pas.** B2 seul laisse une fenêtre de perte égale au délai entre le
dump et l'incident. C'est la raison technique — pas seulement budgétaire — du blocage sur
Supabase Pro.

---

## 5. Fenêtre de cutover

| Champ | Valeur |
|---|---|
| Date | **ACTION JULIEN** |
| Heure de début (T0 réel) | **ACTION JULIEN** |
| Durée estimée | **2 h 00** (T-60 → T+60), surveillance rapprochée jusqu'à T+120 |
| Rôle A — opérateur DB (migrations, backups) | **ACTION JULIEN** |
| Rôle B — opérateur applicatif (promotion, déploiement Vercel) | **ACTION JULIEN** |
| Rôle C — **décideur rollback** | **ACTION JULIEN — nommé avant T0, sinon NO-GO** |
| Rôle D — vérificateur smoke tests | **ACTION JULIEN** |
| Rôle E — **second admin plateforme `total` MFA** | **ACTION JULIEN** |
| Contact rollback joignable pendant toute la fenêtre | **ACTION JULIEN** |
| Communication utilisateurs | **ACTION JULIEN** — pertinence à trancher : aucun client payant à date |
| Maintenance ON/OFF | **ACTION JULIEN** — recommandation : ON de T0 à T+30 |

Aucun nom, aucune date n'est inventé ici.

---

## 6. Second admin — bus factor 1

**Blocker P0. Non résolu.** Vérifié : la branche `feat/gp-platform-second-admin-operability-p1-v1`
**n'est pas fusionnée** dans `996be15`.

Ce qui doit exister avant le cutover :

1. **Un second humain** désigné — pas un compte technique. `plateforme@invalid.local` **n'est pas
   un chemin de récupération valable**.
2. Un **compte Auth Supabase Production** à son nom, e-mail réellement relevable.
3. Un **facteur TOTP vérifié** sur ce compte, enrôlé par la personne elle-même (aucun QR, seed ou
   code ne transite par un canal partagé, ni par cette conversation).
4. Le rôle **`total`** dans `plateforme_admins`, **actif**.
5. La **procédure testée de bout en bout** : login → AAL1 → challenge TOTP → AAL2 → accès
   `/plateforme` → une mutation sensible réussie.

**Contrainte structurelle de la base, non contournable :** l'activation exige
`plateforme_rattacher_admin` puis `plateforme_activer_admin`, exécutées par **un autre** admin
`total` en session AAL2, la cible ayant un facteur MFA vérifié. Auto-rattachement et
auto-activation sont **refusés par la base**. C'est aussi ce qui bloque l'activation de
`julien@elsatia.fr`, volontairement maintenu `en_attente`.

⚠ **Ordre imposé, contre-intuitif :** les migrations `…000237`/`…000250` **imposent AAL2** aux
mutations plateforme. Le second admin ne peut donc être activé qu'**après** le cutover, avec un
premier admin déjà en AAL2. Le prérequis avant fenêtre n'est pas « second admin activé » mais
**« second admin identifié, compte créé, TOTP enrôlé et vérifié, prêt à être activé à T+45 »**.
Ne pas contourner cette garde par un `insert` direct.

---

## 7. Supabase — plan Production

| Élément | État | Source |
|---|---|---|
| Projet Production | `exhvuzegsefmoguxoiak` (eu-west-3) | coordonnées DR |
| **Plan** | **GRATUIT** | `ELSATIA_ECOSYSTEM_COMMERCIAL_LAUNCH_READINESS_V1` (E-03) ; **NON VÉRIFIABLE EN SESSION** |
| Backup managé quotidien | **absent** (inclus au plan Pro, rétention 7 j, 25 $/mois) | `docs/BUDGET_MISE_EN_SERVICE.md` |
| PITR | **absent** — option **séparée** à +100 $/mois, **non incluse dans Pro** | idem |

### 🔴 BLOCKER — Supabase Production en plan gratuit

Ni backup managé, ni PITR : un cutover de 53 migrations dont 7 CRITICAL, sans filet managé, sur
la seule base de production de l'écosystème.

À activer avant toute fenêtre :
1. **Plan Pro** (25 $/mois) — dépend du compte bancaire ELSATIA ;
2. **Backup managé quotidien confirmé actif** — vérifier une sauvegarde réellement listée, pas
   seulement l'option cochée ;
3. **PITR** — décision séparée. Recommandation : pas nécessaire pour ce cutover si B2+B7 sont
   faits, car la fenêtre est courte et le trafic quasi nul. À réévaluer dès le premier client
   payant ;
4. Quotas (taille DB, connexions, egress) relus contre l'usage réel ;
5. Alertes projet activées.

---

## 8. DNS / e-mail

**Aucun enregistrement DNS n'a été lu ni modifié dans ce lot.** Synthèse depuis le dépôt, à
**revérifier en direct** — l'état documenté est contradictoire d'une source à l'autre.

| Domaine | Usage |
|---|---|
| `elsatia.fr` | site vitrine, expéditeur (`no-reply@`, `support@`) |
| `app.elsatia.fr` | Gestion Pro, Auth, callbacks |
| `tools.elsatia.fr` | Tools |
| `colors.elsatia.fr` | Colors |

| Contrôle | État documenté | Remarque |
|---|---|---|
| **DKIM** | ✅ domaine `elsatia.fr` **authentifié chez Brevo** (2 CNAME + 1 TXT posés chez Squarespace) | `REGISTRE_CENTRAL.md`, phase P5 |
| **DMARC** | ✅ présent et **strict** : `p=reject; adkim=s; aspf=s` | conservé volontairement, plus strict que la suggestion Brevo `p=none` |
| **SPF** | ⚠ `v=spf1 -all` — politique **« aucun émetteur autorisé »**, origine inconnue | **jamais modifié** |
| Verdict global | ❌ **non vérifié par un envoi réel récent** | E-08, P0 |

### ⚠ Point de fragilité à trancher — SPF `-all` + DMARC `aspf=s`

Avec `v=spf1 -all`, **aucun** envoi ne peut passer SPF : tout message est en `spf=fail`, et
l'alignement SPF strict (`aspf=s`) est **structurellement impossible**. DMARC n'exige l'alignement
que de DKIM **ou** SPF : la configuration **passe donc uniquement par DKIM**. C'est cohérent
aujourd'hui — le DKIM custom Brevo signe bien `d=elsatia.fr` — mais **sans aucune marge** :

- toute rupture du DKIM Brevo (rotation de clé, CNAME supprimé, changement de fournisseur) fait
  passer 100 % des e-mails en échec DMARC avec `p=reject` → **rejet dur**, pas indésirables ;
- tout futur émetteur (Supabase Auth en SMTP direct, service de facturation, outil marketing) sera
  **rejeté** tant qu'il n'a pas son propre DKIM aligné.

Sont concernés : vérification d'adresse à l'inscription, récupération de mot de passe, réponse
support, échec de paiement, envoi de devis et de factures au client final. Un rejet dur sur ces
flux est un incident client immédiat.

**Actions (hors périmètre de ce lot, aucune modification DNS ici) :**
1. Lire les enregistrements réels : `dig TXT elsatia.fr`, `dig TXT _dmarc.elsatia.fr`, CNAME DKIM Brevo.
2. Décider consciemment : **soit** conserver `-all` en assumant la dépendance DKIM totale, **soit**
   poser un SPF réaliste incluant Brevo. Documenter la décision.
3. **Test d'envoi réel** vers Gmail + Outlook + un domaine tiers, en lisant les en-têtes
   `Authentication-Results` (`dkim=pass`, `dmarc=pass`).
4. Adresse de rapport DMARC (`rua=`) : vérifier qu'elle existe et est relevée.

---

## 9. Stripe

| Élément | État | Source |
|---|---|---|
| Compte Live | ❌ inexistant | E-07 |
| Compte Test | ✅ `acct_…`, **`charges_enabled=false`** | idem |
| KYC | ❌ non fait — dépend du SIREN/SIRET (E-05) et du compte bancaire | idem |
| Produits / Prices Live | ❌ 0 — **24 Price IDs** à recréer, aucune valeur Test réutilisable | `STRIPE_LIVE_CHECKLIST.md` |
| Webhooks Live | ❌ aucun | idem |
| Secrets Live | ❌ aucun | idem |
| Clés Ed25519 Live | ❌ non provisionnées | `ELSATIA_ED25519_ATTESTATION_PROVISIONING_V1.md` |
| `ABONNEMENTS_PUBLICS_OUVERTS` | 🔒 `false` partout | volontaire |

### Posture pendant le cutover — non négociable

**Production reste sur Stripe TEST pendant toute la fenêtre.** Aucune clé `sk_live_`, aucun Price
Live, aucun webhook Live créé, lu ou modifié. `STRIPE_WEBHOOK_EXPECTED_MODE = test` :
`resoudreModeStripeWebhook` rejette fermé tout événement `livemode=true`.

Le passage Live est un **lot P15 distinct**, postérieur, dans l'ordre imposé :
SIREN/SIRET → compte bancaire → KYC → produits Live → 24 Prices Live → Stripe Tax → webhook Live
→ secret webhook Live → Ed25519 Live → **un paiement réel de faible montant, surveillé, puis
remboursé**.

**Écart P1 connu :** les 4 `STRIPE_PRICE_*_ANNUEL` peuvent encore pointer des Prices ×12 au lieu
des Prices « 10 × mensuel » canoniques. `verify:stripe-prices --strict` doit être **8/8** dans un
environnement portant réellement les variables. Les `STRIPE_PRICE_COMPTE_SUP_*` sont inexistantes.

**Aucun produit, prix, webhook ou secret Live n'a été créé, lu ou modifié dans ce lot.**

---

## 10. Suite de tests pré-cutover obligatoire

À exécuter **hors fenêtre (J-1)**, sur le SHA cible `996be15`, jamais contre Production.

| # | Test | Commande | Attendu | Bloquant |
|---|---|---|---|:--:|
| T1 | Intégrité du ledger | `npm run verify:migrations` | `263 migrations valides` | ✅ |
| T2 | Base fraîche 263 | `npm run db:start && npm run db:reset` | 263 appliquées, 0 erreur | ✅ |
| T3 | **pgTAP complet** | `npm run test:db` | **100 % PASS** (55 suites) | ✅ |
| T4 | Typecheck | `npm run typecheck` | 0 erreur (racine + `apps/tools`) | ✅ |
| T5 | Lint | `npm run lint` | 0 erreur | ✅ |
| T6 | Tests unitaires | `npm run test` | 100 % PASS | ✅ |
| T7 | Secrets | `npm run verify:secrets` | PASS | ✅ |
| T8 | Prix Stripe | `npm run verify:stripe-prices` | 8/8 en environnement portant les variables | ⚠ P1 |
| T9 | Build | `npm run build` | succès (racine + `apps/tools`) | ✅ |
| T10 | Multi-tenant | suites `isolation_multitenant_*` de T3 | PASS | ✅ |
| T11 | Auth / AAL2 | `platform_aal2_role_integrity_v1`, `mfa`/AAL2 de T3 | PASS | ✅ |
| T12 | Entitlements Tools | `elsatia_tools_r8/r9/r10` de T3 | PASS | ✅ |
| T13 | Billing / capacité | `capacity_stripe_r2_*`, `modules_a_la_carte_r3`, `active_person_capacity_r1` de T3 | PASS | ✅ |
| T14 | Global owner / support | `platform_support_*`, `support_message_author_guard` de T3 | PASS | ✅ |
| T15 | Colors | `colors_canonical_integration_v1` de T3 | PASS | ✅ |
| T16 | E2E | `npm run test:e2e` | PASS | ⚠ selon disponibilité |
| T17 | **Restore → 263** | restaurer un dump baseline 210 dans une base jetable, puis `supabase migration up --include-all` | 263 atteint, 0 erreur | ✅ |
| T18 | **Drift Fresh ↔ Restore** | comparer schéma + ACL entre T2 et T17 | **drift applicatif = 0** | ✅ |

`npm run verify` enchaîne T1, T4→T9.

**T1 exécuté dans ce lot : PASS — `263 migrations valides, noms et horodatages uniques`.**

**Faisabilité vérifiée en session :**
- ✅ **démon Docker UP** → T2/T3/T17/T18 sont **exécutables maintenant**. Le blocage historique
  (« Docker injoignable », réserve E-11 sur le hotfix `7ba62c`) **est levé**.
- ✅ CLI Supabase `2.109.1` disponible via `node_modules/.bin/supabase`.
- ✅ 29 Gio libres sur `/`.
- ❌ **`psql`, `pg_dump` et `vercel` sont absents du PATH de ce poste.** Voir §12, blocker O-1.

---

## 11. Ordre d'exécution et rollback

Détail minuté : `docs/runbooks/ELSATIA_PRODUCTION_CUTOVER_RUNBOOK_V1.md` (même lot).
Critères binaires : `docs/runbooks/ELSATIA_PRODUCTION_CUTOVER_GO_NO_GO_V1.md`.

Trois gates non négociables :
- **T-45 — GATE P0-1** : ledger Production relu en direct = 210, dernière version `…000231`,
  4 sentinelles absentes. Sinon **STOP**, la fenêtre est annulée.
- **T0 — GATE GO/NO-GO migration** : dernière décision avant écriture. La migration **#6**
  (`drop column`) est le premier geste irréversible.
- **T+20 — GATE décision** : après le point de non-retour ACL (#43).

---

## 12. Blockers de poste opérateur — découverts dans ce lot

| ID | Blocker | Impact | Correctif |
|---|---|---|:--|
| **O-1** | **`psql` et `pg_dump` absents** du PATH | Le gate P0-1 tel qu'écrit dans le préflight existant passe par `psql`. B2 (dump) passe par `pg_dump`. **Ni l'un ni l'autre n'est exécutable sur ce poste en l'état.** | **Soit** installer `libpq` (`brew install libpq` + PATH), **soit** utiliser les équivalents CLI Supabase : `supabase migration list --db-url …` pour le ledger, `supabase db dump --db-url …` pour le dump. Le runbook du même lot retient la voie CLI, sans dépendance système. **À trancher et à tester à J-1, jamais pendant la fenêtre.** |
| **O-2** | **`vercel` absent** du PATH | Promotion et lecture des variables d'environnement | `npx vercel` — authentification à valider **à J-1** |
| **O-3** | CLI Supabase liée à **Preview** | Un `migration up --linked` viserait **Preview**, pas Production | **Ne jamais relier la CLI à Production.** Utiliser exclusivement `--db-url` avec la chaîne Production. Sinon, si `--linked` est retenu, relier explicitement puis **revérifier `supabase/.temp/project-ref` avant chaque commande d'écriture**, et relier à Preview après la fenêtre. |
| **O-4** | `release/commercialisation-v1` locale **3 commits en retard** | Fast-forward calculé depuis une base fausse | `git fetch origin` **obligatoire** avant toute promotion |
| **O-5** | Corpus documentaire éclaté sur 4 branches | Impression du mauvais SHA cible | N'imprimer que depuis `docs/gp-cutover-documentation-closure-v1` (ou ce lot) |

---

## 13. Rappels d'interdiction — périmètre de ce lot

Aucune migration Production appliquée · aucune modification Production · aucun déploiement ·
aucune sauvegarde Production exécutée · aucun produit/prix/webhook Stripe créé ou modifié ·
aucun enregistrement DNS modifié · aucun secret affiché, copié ou consigné · aucune modification
de code applicatif ou de migration · aucun contournement des gardes AAL2 ni de la règle du second
admin.
