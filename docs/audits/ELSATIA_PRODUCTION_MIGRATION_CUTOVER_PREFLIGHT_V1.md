# ELSATIA — Preflight cutover migrations Production (Gestion Pro + Colors + Tools)

**Lecture seule. Aucune migration Production exécutée. Aucun déploiement. Aucune clé exposée.**
Objectif : plan de cutover coordonné permettant de faire fonctionner simultanément Gestion Pro,
Colors et Tools en Production, sans rendre l'ancienne release incompatible avec la base migrée.

Diagnostic amont : `docs/audits/ELSATIA_COLORS_PROD_ACCESS_DIAG_V1` (le contrat multi-app est
absent de la base Production).

---

## 1. État Production réel (vérifié en boîte noire, sans accès service-role)

| Élément | Valeur |
|---|---|
| Projet Supabase Production | `elsatia-production` — ref `exhvuzegsefmoguxoiak` (région `eu-west-3`, PostgreSQL 17) |
| Frontend déployé (`elsatia-production` Vercel / `app.elsatia.fr`) | branche `release/commercialisation-v1`, SHA **`fcdd4e7`** (« fix(stripe): cloisonner webhooks par environnement ») |
| Fichiers de migration dans `fcdd4e7` | **211** ; head **`20260825000233_admin_plateforme_julien_elsatia_fr`** |
| Version DB attendue par ce code | head `20260825000233` (211 migrations) |
| État réel de la base Production | **cohérent avec `fcdd4e7`** : présents `plans_abonnement`, `plateforme_admins`, `entreprise_feature_flags`, `historique_tarification`, `pieces_jointes_devis`, `support_messages`, `appareils_comptes` ; **absents** `applications_elsatia`, `roles_applications_elsatia`, `acces_applications_entreprises`, `habilitations_applications_utilisateurs`, `contexte_application_courant()`, `a_acces_application()`, toutes les tables `colors_*`, `stripe_attestation.*`, `support_fils` |
| Historique migratoire | **non canonique** : `fcdd4e7` ne contient pas le bloc historique `20260815000200`→`20260818000215` ni `20260825000232`, mais contient `20260819`→`20260824` et `20260825000233`. Dérive réelle documentée (`20260824000231_roadmap_cleanup_v1_reconciliation_drift_production`, `20260901000254_migration_canonicalization_v2`). |

> La CLI Supabase locale est liée à **Preview** (`pgvvpqyjziyapbbkydmc`) uniquement. Aucun
> `SUPABASE_ACCESS_TOKEN`, aucune clé service-role Production disponible → le ledger
> `supabase_migrations.schema_migrations` de Production n'a pas été lu directement ; l'état
> ci-dessus est reconstruit par sondes anon/PostgREST (présence/absence de tables) + le SHA
> réellement déployé sur Vercel. **À confirmer par lecture directe du ledger avant cutover.**

---

## 2. Cible canonique

| Candidat | SHA | Fichiers migration | Head migration | Descend de `fcdd4e7` ? |
|---|---|---|---|---|
| **`feat/preprod-e2e-runbook-integration-v1`** | **`6df3ebd`** | **253** | **`20260902000255_acl_reconciliation_v1`** | **OUI (forward propre)** |
| `feat/tarification-on-canonical-preprod-v1` | `ac7bf05` | 253 | `20260902000255` | oui (ancêtre de `6df3ebd`) |
| `feat/elsatia-canonical-integration-preprod-v1` | `9ad2729` | — (ne porte pas `supabase/migrations` à jour) | — | à écarter |
| `feat/active-person-capacity-r1-v1` | `9163978` | 254 | `20260903000256` | R1, **hors cutover immédiat** |
| `feat/modules-a-la-carte-r3-v1` | `553966c` | 255 | `20260903000257` | R3, **hors cutover immédiat** |
| `release/commercialisation-v1` (local) | `8fe737e` | 211 | `20260825000233` | diverge de `fcdd4e7` — ne pas utiliser |

**Branche recommandée : `feat/preprod-e2e-runbook-integration-v1` @ `6df3ebd`.**
- migration head : `20260902000255_acl_reconciliation_v1`
- `fcdd4e7` (déployé) est un **ancêtre direct** de `6df3ebd` → aucun merge divergent, cutover en avant uniquement.
- l'ensemble des 211 migrations de `fcdd4e7` est **⊆** des 253 de `6df3ebd` (vérifié `comm -13` = vide).
- tests associés : **45 fichiers pgTAP** + suites Vitest racine / `apps/tools` / `apps/colors`
  (dernière exécution locale connue verte sur socle équivalent : pgTAP 45 fichiers, Vitest racine
  ~88 fichiers, Tools 20/107, Colors 13/61).

---

## 3. Exclusion de 256 / 257 — confirmée

- `20260903000256_active_person_capacity_r1_v1` : **uniquement** sur `feat/active-person-capacity-r1-v1` (branche R1, PR non intégrée).
- `20260903000257_modules_a_la_carte_r3_v1` : **uniquement** sur `feat/modules-a-la-carte-r3-v1` (branche R3, PR non intégrée).
- `6df3ebd` (cible cutover) **s'arrête à `20260902000255`**. Les migrations 256/257 **ne font pas
  partie** du cutover immédiat Colors/Tools.
- Elles feront l'objet d'un **cutover ultérieur distinct** après intégration + revue dans la
  branche canonique de déploiement. Aucun code applicatif de `6df3ebd` ne dépend de 256/257.

---

## 4. Diff migrations Production → cible : **42 migrations exactes**

Ordre d'application = ordre lexical des noms de fichiers. Les 12 premières (bloc historique
`20260815`→`20260818`) comblent la dérive ; les 30 suivantes apportent multi-app + Colors + Tools
+ durcissement ACL.

| # | Migration | Fonction | Risque anc. release | Dépendance | Type |
|--:|---|---|:--:|---|---|
| 1 | `20260815000200_reconciliation_pre_tarifs_v2` | table marqueur `migration_tarifs_v2_reconciliation_v2` (bookkeeping dérive) | faible | — | DB only |
| 2 | `20260816000201_tarifs_v2_catalogue` | `plans_abonnement` : prix nullable, `devis_obligatoire`, nouvelles versions ; `catalogue_options_abonnement` | **moyen** (NULL prix / `sur_mesure` côté ancien front) | 1 | **code coordonné** |
| 3 | `20260816000202_admin_v1_roles_plateforme` (775 l.) | modèle rôles plateforme v1, 26 REVOKE | **élevé** (surface admin) | — | **code coordonné** |
| 4 | `20260816000203_promo_v1_administration_commerciale` | administration commerciale, 8 REVOKE | moyen | 2,3 | code coordonné |
| 5 | `20260816000204_c6b_corrections_premier_client` | corrections premier client, 5 REVOKE ; insert `employes` dans une fonction | faible | — | DB only |
| 6 | `20260818000205_securiser_cout_horaire_employe` | RLS coût horaire employé | faible | — | DB only |
| 7 | `20260818000206_historiser_cout_horaire_pointage` | historisation coût horaire ; **réintroduit une branche anon** neutralisée plus tard par `254` | moyen | — | DB only |
| 8 | `20260818000210_verrou_devis_accepte` | trigger verrou devis accepté (déjà partiellement présent via `231`) | faible | — | DB only |
| 9 | `20260818000211_paiements_et_anti_surfacturation` | anti-surfacturation, 3 REVOKE | faible | — | DB only |
| 10 | `20260818000212_facture_lock_v1` | verrou facture | faible | — | DB only |
| 11 | `20260818000213_avenants_v1_modele` | tables avenants | faible (additif) | — | code coordonné (UI avenants) |
| 12 | `20260818000214_avenants_v1_rpc` | RPC avenants, 3 REVOKE | faible | 11 | code coordonné |
| 13 | `20260818000215_avenants_v1_integration_facturation` | intégration avenants ↔ facturation | faible | 11,12 | code coordonné |
| 14 | `20260825000232_platform_function_signature_preflight_v2` | garde de signatures de fonctions plateforme | faible | — | DB only |
| 15 | **`20260826000234_elsatia_multi_app_convergence_v1`** | **`applications_elsatia`, `roles_applications_elsatia`, `acces_applications_entreprises`, `habilitations_applications_utilisateurs`, `historique_acces_applications` + `a_acces_application()`, `applications_autorisees()`, `contexte_application_courant()` + RPC `plateforme_*_application*`** | faible pour l'ancien front (additif, ignoré) — **bloquant pour Colors/Tools** | — | **code coordonné (Colors/Tools)** |
| 16 | `20260826000235_platform_admin_uid_canonical_v1` | identité admin plateforme par UID | **élevé** (auth admin) | 3 | **code coordonné** |
| 17 | `20260826000236_platform_support_uid_security_v1` | sécurité support par UID, 7 REVOKE | moyen | 16 | code coordonné |
| 18 | **`20260826000237_platform_aal2_role_integrity_v1`** | **`plateforme_exiger_session_aal2()` + AAL2 exigé sur les RPC plateforme**, 25 REVOKE | **CRITIQUE** (ancien front sans MFA ⇒ admin plateforme cassé) | 16 | **code coordonné + MFA** |
| 19 | `20260826000238_platform_write_surface_hardening_v1` | REVOKE surface d'écriture (policy `feature_flags_manage`, boutique) | **élevé** | 18 | code coordonné |
| 20 | `20260826000239_platform_support_isolation_audit_v1` | isolation support + audit, 16 REVOKE | moyen | 17,18 | code coordonné |
| 21 | `20260826000240_platform_stripe_discount_consistency_v1` | cohérence remises Stripe, 11 REVOKE, AAL2 | **élevé** (webhook remises) | — | **code coordonné (webhook)** |
| 22 | `20260826000241_platform_stripe_proof_webhook_coordination_v1` | coordination preuve/webhook, 20 REVOKE, AAL2 | **élevé** | 21 | code coordonné |
| 23 | `20260826000242_revoke_legacy_discount_rpcs_v1` | **DROP/REVOKE RPC remises historiques** | **élevé** (ancien front qui les appelle) | 21,22 | code coordonné |
| 24 | `20260827000236_plateforme_lire_entreprise_membres_v1` | RPC lecture membres entreprise, 1 REVOKE | faible | — | code coordonné |
| 25 | `20260827000243_discount_column_guard_r71` | **garde colonnes remise** (rôle `elsatia_discount_f4_writer`), 6 REVOKE | **élevé** | 21-23 | code coordonné |
| 26 | **`20260828000244_stripe_state_attestation_r72`** | **schéma `stripe_attestation` (Ed25519) : `public_keys`, `configuration`, `consumed_attestations` ; colonnes `preuve_attestation_*` sur `plateforme_operations_remise` ; `pgsodium`** | **CRITIQUE** (ancien front n'émet pas d'attestation ⇒ observation remise fail-closed) | 25 | **code coordonné + clé Ed25519** |
| 27 | `20260828000245_stripe_discount_observation_r73` | **exige des observations Stripe non lossy** (fail-closed), 6 REVOKE | **CRITIQUE** | 26 | code coordonné |
| 28 | `20260828000246_colors_functional_core_v1` | **schéma Colors v1.3 : `colors_seaux`, `colors_emplacements`, `colors_mouvements`, … + RPC `colors_*`**, 13 REVOKE | faible ancien front (additif) — **bloquant Colors** | 15 | **code coordonné (Colors)** |
| 29 | `20260828000247_colors_integrity_v11` | intégrité Colors, 12 REVOKE | faible | 28 | code coordonné |
| 30 | `20260828000248_colors_correctifs_v12` | correctifs Colors, 4 REVOKE | faible | 28,29 | code coordonné |
| 31 | `20260828000249_colors_security_cleanup_v13` | fermeture DML direct `colors_*` pour `anon`/`service_role`, 2 REVOKE | faible | 28-30 | code coordonné |
| 32 | `20260830000236_elsatia_tools_r8_comptes_entitlements_sync` | **entitlements Tools + sync comptes**, 4 REVOKE | faible ancien front — **bloquant Tools** | 15 | **code coordonné (Tools)** |
| 33 | `20260830000237_elsatia_tools_r9_monetisation` | monétisation Tools (Apple/Google/Web), 3 REVOKE | faible | 32 | code coordonné |
| 34 | `20260831000238_elsatia_tools_r10_publication_multientreprise` | publication multi-entreprise Tools, 4 REVOKE | faible | 32 | code coordonné |
| 35 | `20260831000239_elsatia_tools_r10_suppression_compte` | suppression de compte Tools, 1 REVOKE | faible | 32 | code coordonné |
| 36 | `20260831000250_platform_promotion_aal2_hardening_v1` | **durcissement AAL2 promotion plateforme**, 4 REVOKE | **élevé** | 18 | code coordonné + MFA |
| 37 | `20260901000240_security_reconciliation_tools_entitlements_aal2_v1` | réconciliation entitlements Tools + AAL2, 4 REVOKE | moyen | 32,36 | code coordonné |
| 38 | `20260901000251_platform_lister_admins_statut_identite_v1` | RPC liste admins + statut identité, 2 REVOKE | faible | 16 | code coordonné |
| 39 | `20260901000252_residual_acl_hardening_r74` | **12 REVOKE résiduels** (`plateforme_admins`, tables multi-app, `support_messages`), AAL2 | **élevé** | 18,20 | code coordonné |
| 40 | `20260901000253_support_message_author_guard_r75` | garde auteur messages support, 2 REVOKE | faible | 20 | code coordonné |
| 41 | **`20260901000254_migration_canonicalization_v2`** | **répare la dérive** : neutralise la surcharge legacy `plateforme_appliquer_remise` réintroduite par `202`, restaure `valider_preuve_pointage` sans branche anon (réintroduite par `206`), restaure messages `plateforme_exiger_role` ; consomme la table marqueur `migration_tarifs_v2_reconciliation_v2` ; AAL2 | **indispensable après le bloc historique** | 1,2,7 | DB only (idempotent) |
| 42 | **`20260902000255_acl_reconciliation_v1`** | **1220 REVOKE + 14 ALTER DEFAULT PRIVILEGES** — réconciliation ACL canonique complète (service_role sans write table-level, RPC bornées `authenticated`) | **CRITIQUE** (peut retirer des grants dont l'ancien front dépend) | tout ce qui précède | **code coordonné (dernier)** |

**Sous-ensembles clés** : multi-app convergence = #15. Admin UID = #16. Member RPC = #24, #38.
Colors = #28–31. Tools = #32–35, #37. R7.1 (discount column guard r71) = #25. R7.2 (attestation
r72) = #26. R7.3 (observation r73) = #27. R7.4 (residual ACL r74) = #39. R7.5 (author guard r75)
= #40. ACL reconciliation 255 = #42. Canonicalization = #41.

---

## 5. Migrations susceptibles de casser l'ancienne release (`fcdd4e7` + base migrée)

| Migration | Nature | `fcdd4e7` + base migrée |
|---|---|:--:|
| #18 `…237` AAL2 role integrity | AAL2 exigé sur RPC plateforme | **NON** — `fcdd4e7` n'a pas d'UI MFA ⇒ aucun admin ne peut atteindre AAL2 ⇒ console plateforme cassée |
| #36 `…250` / #39 `…252` (AAL2 supplémentaire) | AAL2 étendu | **NON** (même cause) |
| #23 `…242` DROP RPC remises historiques | RPC supprimées | **NON** si l'ancien front les appelle encore (remises commerciales) |
| #25 `…243` garde colonnes remise | REVOKE + rôle writer dédié | **NON** — écriture directe des colonnes remise par `fcdd4e7` refusée |
| #26 `…244` attestation Ed25519 / #27 `…245` observation non lossy | fail-closed sans attestation signée | **NON** — webhook remises `fcdd4e7` n'émet pas d'attestation ⇒ observation remise bloquée |
| #21 `…240` / #22 `…241` Stripe discount consistency / proof-webhook | AAL2 + REVOKE | **NON / INCONNU** |
| #19 `…238` write surface hardening | REVOKE policy `feature_flags_manage`, boutique | **INCONNU** — dépend des écritures directes de `fcdd4e7` |
| #42 `…255` ACL reconciliation (1220 REVOKE) | retrait massif de grants | **INCONNU** — nécessite un audit exhaustif des call-sites `fcdd4e7` ; à considérer NON par prudence |
| #3 `…202` admin v1 roles (775 l.) | modèle rôles plateforme | **INCONNU** — surface admin large |
| #2 `…201` tarifs v2 (prix nullable, `sur_mesure`) | schéma `plans_abonnement` | **INCONNU** — dépend du traitement NULL côté `fcdd4e7` |
| #15 `…234` multi-app / #28-31 Colors / #32-35 Tools | **tables et RPC purement additives** | **OUI** — `fcdd4e7` les ignore, aucun impact |
| #1,#5-#14 bloc historique GP hors admin | ajouts de structure GP | **OUI** (avec #41 en clôture) |

**Conclusion §5 : l'ancienne release `fcdd4e7` n'est PAS compatible avec la base pleinement
migrée.** La console admin plateforme est cassée (AAL2), et plusieurs chemins remise/Stripe
tombent en fail-closed. Le cutover DOIT appliquer **migrations + déploiement du frontend
canonique `6df3ebd` dans la même fenêtre de maintenance**. Aucun scénario « base migrée / ancien
front laissé en Production » n'est acceptable au-delà de la fenêtre.

---

## 6. Point de non-retour

| Étape franchie | Un simple rollback Vercel vers `fcdd4e7` suffit ? |
|---|---|
| Avant #15 `…234` (bloc historique `…200`→`…232`) | **OUI** — additif GP, `fcdd4e7` tolère (avec #41 appliqué en clôture du bloc, ou bloc laissé partiel) |
| Après #15 `…234` + #16 `…235` + #18 `…237` + #19 `…238` | **NON** — multi-app + admin UID canonique + AAL2 + write-hardening : l'ancien front ne peut plus administrer la plateforme ; rollback = **restauration PITR de la base + rollback frontend** |
| Après #42 `…255` (ACL reconciliation) | **NON, définitivement** — 1220 REVOKE ; seul un **PITR restore coordonné + rollback frontend** ramène un état cohérent |

**Point de non-retour = migration #18 `20260826000237_platform_aal2_role_integrity_v1`.**
À partir de là, tout rollback est une opération coordonnée base + application, jamais un rollback
Vercel seul (principe déjà posé dans `docs/runbooks/ELSATIA_PRODUCTION_ROLLBACK_V1.md`).

---

## 7. Stratégie de cutover (ordre coordonné — aucune exécution)

> Fenêtre de maintenance unique, `app.elsatia.fr` en mode maintenance pendant les étapes 6→11.

1. **Gel des changements** : figer `feat/preprod-e2e-runbook-integration-v1` @ `6df3ebd` ; aucune
   autre PR mergée ; confirmer que 256/257 restent hors périmètre.
2. **Snapshot / PITR** : noter le timestamp PITR de `exhvuzegsefmoguxoiak` juste avant migration ;
   vérifier que la rétention PITR couvre la fenêtre + marge (≥ 24 h).
3. **Backup DB chiffré** : `pg_dump` complet (schéma + données) de Production, chiffré, horodaté,
   stocké hors du projet ; noter le checksum.
4. **Backup Storage** : inventaire + copie des 12 buckets Production (cf. REGISTRE_CENTRAL P6) ;
   checksum par objet.
5. **Checksums** : enregistrer `schema_migrations` complet (ledger avant), liste des rôles, liste
   des extensions (`pgsodium` requis pour #26), empreinte `pg_dump --schema-only`.
6. **Maintenance ON** : `app.elsatia.fr` bascule en page de maintenance ; crons Vercel déjà
   `FEATURE_CRONS_ENABLED=false` (confirmer) ; aucun webhook Stripe traité (Stripe Live absent →
   sans objet, mais couper l'endpoint webhook par précaution).
7. **Migrations Production** : appliquer les **42 migrations** dans l'ordre lexical des noms, en
   **une transaction par fichier**, avec ancrage explicite de la cible (`SUPABASE_PROJECT_REF` +
   hôte `NEXT_PUBLIC_SUPABASE_URL` + `supabase/.temp/project-ref` = `exhvuzegsefmoguxoiak`, jamais
   `pgvvpqyjziyapbbkydmc`). S'arrêter au premier échec. Ne jamais improviser de down migration.
   - Prérequis avant #26 : extension `pgsodium` activée sur Production ; clé Ed25519 provisionnée
     (§12).
8. **Verify ledger** : `schema_migrations` = 253 entrées, head `20260902000255` ; comparer au
   ledger Preview (doit être identique après `20260901000254`).
9. **pgTAP / smoke DB** : exécuter les **45 fichiers pgTAP** de `6df3ebd` contre Production (ou
   contre une copie PITR si politique « pas de pgTAP sur Prod ») ; smoke SQL : `applications_elsatia`
   peuplé, `contexte_application_courant()` répond, `a_acces_application()` répond, `colors_*` et
   `stripe_attestation.*` présents, `SELECT count(*)` sur tables critiques inchangés vs backup.
10. **Déploiement Gestion Pro canonique** : promouvoir `6df3ebd` sur le projet Vercel
    `elsatia-production` (Production Branch = la branche de `6df3ebd`, cf. écart historique noté en
    P3 : Production Branch doit pointer sur la branche canonique, pas `main`). Variables Production
    complètes (dont clé Ed25519 privée — §12 — et l'existant Sentry/Brevo/Supabase).
11. **Validation MFA / admin** : `julien@elsatia.fr` se connecte sur le **nouveau** frontend →
    `/parametres/securite` → **enrôle TOTP** (autorisé à AAL1 : `decisionGardeMfa` renvoie
    « enroler » quand `aal1` + next `aal1`) → challenge → **AAL2 obtenu** → `/plateforme`
    accessible. **Aucune autre opération plateforme avant cette étape.** Enrôler le 2ᵉ admin total
    ensuite.
12. **Seed catalogue apps** (§8) : vérifier/insérer les lignes `applications_elsatia`
    (`gestion_pro`, `colors`, `tools`) et `roles_applications_elsatia` — **via les seeds inclus
    dans #15/#28-31/#32-35 si présents**, sinon via les RPC plateforme (`plateforme_activer_*`),
    jamais par INSERT direct.
13. **Activation Colors entreprise** : `plateforme_activer_application_entreprise(<entreprise de
    Julien>, 'colors')` (AAL2) → crée `acces_applications_entreprises(autorise=true, fenêtre
    valide)`.
14. **Habilitation Julien Colors** : `plateforme_habiliter_utilisateur_application(<entreprise>,
    <uid Julien>, 'colors', 'colors_admin_organisation')` (AAL2).
15. **Validation Colors** : `colors.elsatia.fr` — login `julien@elsatia.fr` → `contexte_application_courant`
    OK → `a_acces_application('colors')=true` → `/dashboard` ; parcours nuanciers/inventaire/dépôts ;
    déconnexion ; récupération de session ; callback Auth ; isolation entreprise (2ᵉ tenant non visible).
16. **Activation / habilitation Tools** : `plateforme_activer_application_entreprise(<entreprise>,
    'tools')` + `plateforme_habiliter_utilisateur_application(..., 'tools', <rôle Tools>)` (AAL2).
17. **Validation Tools** : `tools.elsatia.fr` — login/logout, `/compte`, `/projets`, `/offline`,
    PWA/manifeste, `/suppression-compte`, **aucun bouton d'achat mobile actif**
    (`NEXT_PUBLIC_TOOLS_BILLING_API_URL` non défini), entitlement Pro hors-ligne, isolation RLS.
18. **Multitenant** : rejouer un parcours d'isolation A/B sur GP + Colors + Tools (aucune fuite
    cross-entreprise).
19. **Stripe TEST** : vérifier `verify:stripe-prices` / webhook `STRIPE_WEBHOOK_EXPECTED_MODE=test`
    (Stripe Live toujours absent — hors périmètre) ; l'endpoint webhook rouvert après cutover.
20. **Ouverture du service** : maintenance OFF ; surveillance Sentry `vercel-production` 24-48 h
    (erreurs 4xx/5xx, `Accès refusé` inattendus, fail-closed remises).

---

## 8. Seed multi-app : ce qui est déjà seedé vs à activer par RPC

| Élément | Seedé par migration ? | Action post-migration |
|---|---|---|
| `applications_elsatia` : `gestion_pro`, `colors`, `tools` | **à confirmer** dans #15 (`…234`) et #28/#32 — le catalogue applicatif est généralement seedé par la migration de convergence + les migrations Colors/Tools | si absent : `plateforme_activer_application_entreprise` ne suffit pas (il faut la ligne catalogue) → seed contrôlé de `applications_elsatia` uniquement, sans INSERT direct sur les tables d'accès |
| `roles_applications_elsatia` : `colors_admin_organisation`, `colors_gestionnaire_stock`, `colors_utilisateur_depot`, `colors_consultation`, rôles Tools, `ROLE_ADMIN_PLATEFORME` | **à confirmer** (probablement seedé par #15/#28-31/#32-35) | vérifier la présence des codes de rôle attendus par `@elsatia/application-access` |
| `acces_applications_entreprises` (droit entreprise) | **NON** (données tenant) | RPC `plateforme_activer_application_entreprise(entreprise, code)` — AAL2 |
| `habilitations_applications_utilisateurs` (habilitation user) | **NON** (données tenant) | RPC `plateforme_habiliter_utilisateur_application(entreprise, uid, code, role)` — AAL2 |
| `historique_acces_applications` | rempli automatiquement par les RPC ci-dessus | — |

**Règle : aucun INSERT direct sur `acces_applications_entreprises` / `habilitations_applications_utilisateurs`.**
Les RPC plateforme (`plateforme_activer_application_entreprise`, `plateforme_desactiver_application_entreprise`,
`plateforme_habiliter_utilisateur_application`, `plateforme_retirer_habilitation_application`, définies dans #15)
existent et journalisent. Être admin Gestion Pro **ne donne pas** Colors/Tools (sauf le cas
explicite `ROLE_ADMIN_PLATEFORME` géré par `resoudreRoleColors`).

---

## 9. Colors — opérations minimales après migration

| Type | Détail |
|---|---|
| **Migration** | #15 `…234` (contrat multi-app) + #28–31 (`colors_*` : `colors_seaux`, `colors_emplacements`, mouvements, nuanciers, RLS) |
| **Donnée entitlement** | 1) `acces_applications_entreprises(<entreprise de Julien>, 'colors', autorise=true, valide_du<=now, valide_jusqu_au null|futur)` via RPC ; 2) `habilitations_applications_utilisateurs(<uid Julien>, 'colors', role='colors_admin_organisation')` via RPC ; 3) catalogue : ligne `applications_elsatia(code='colors', actif=true)` + rôles Colors dans `roles_applications_elsatia` (seed migration à vérifier) |
| **Callback Auth** | ajouter `https://colors.elsatia.fr/auth/callback` dans Supabase `exhvuzegsefmoguxoiak` → Auth → URL Configuration → Redirect URLs (ne rien supprimer). `Site URL` inchangé (Gestion Pro). |
| **Storage** | bucket `documents-colors` (ou nom réel défini par #28) + policies RLS d'isolation tenant ; le code Colors `api/photos` utilise `SUPABASE_SERVICE_ROLE_KEY` → cette variable **doit** être présente en Production Vercel `elsatia-colors` (déjà ajoutée). Vérifier l'existence effective du bucket après migration. |
| **Env Vercel `elsatia-colors` Production** | `NEXT_PUBLIC_SUPABASE_URL` = `https://exhvuzegsefmoguxoiak.supabase.co` ; `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable de `exhvuz…`) ; `SUPABASE_SERVICE_ROLE_KEY` ; `ELSATIA_APPLICATION_ENV=production` ; `NEXT_PUBLIC_COLORS_URL=https://colors.elsatia.fr` ; `NEXT_PUBLIC_ELSATIA_ACCOUNT_URL=https://app.elsatia.fr/abonnement` ; `RATE_LIMIT_HMAC_KEY`. (État actuel : présentes, à reconfirmer sur `exhvuz…`.) |

---

## 10. Tools — opérations minimales après migration

| Type | Détail |
|---|---|
| **Migration** | #15 `…234` + #32 `…236` (entitlements Tools + sync comptes) + #33 `…237` (monétisation) + #34 `…238` (publication multi-entreprise) + #35 `…239` (suppression compte) + #37 `20260901000240` (réconciliation entitlements + AAL2) |
| **Catalogue application** | ligne `applications_elsatia(code='tools', actif=true)` + rôles Tools dans `roles_applications_elsatia` (seed migration à vérifier) |
| **Donnée entitlement entreprise** | `acces_applications_entreprises(<entreprise>, 'tools', autorise=true, fenêtre valide)` via RPC |
| **Habilitation user** | `habilitations_applications_utilisateurs(<uid Julien>, 'tools', <rôle Tools>)` via RPC |
| **Callback Auth** | `https://tools.elsatia.fr/auth/callback` + vérifier présence de `fr.elsatia.tools://auth/recovery` (schéma natif — ne pas supprimer) |
| **RLS / sync** | vérifier RLS des tables d'entitlement Tools + le contrat de synchronisation hors-ligne (R8 validé en préprod : entitlement Pro hors-ligne, isolation entreprises) |
| **Billing web** | `NEXT_PUBLIC_TOOLS_BILLING_API_URL` **non défini** + `NEXT_PUBLIC_TOOLS_RUNTIME` **non défini** ⇒ runtime web, boutons d'achat désactivés (« Produit indisponible »), aucune redirection App Store / Play Store. R9 (achats mobiles) hors périmètre de cette mise en ligne Web. |
| **Env Vercel `elsatia-tools` Production** | `NEXT_PUBLIC_SUPABASE_URL` = `https://exhvuzegsefmoguxoiak.supabase.co` ; `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable `exhvuz…`) ; `NEXT_PUBLIC_TOOLS_ENV=production` ; `NEXT_PUBLIC_TOOLS_URL=https://tools.elsatia.fr`. Tools **n'utilise pas** `SUPABASE_SERVICE_ROLE_KEY`. |

> **Attention** : l'env actuellement configuré sur `elsatia-tools` (Preview + Production) pointe
> encore sur le Supabase **Preview** `pgvvpqyjziyapbbkydmc` (posé lors du lot de déploiement
> initial). **À repointer sur `exhvuzegsefmoguxoiak` pour la Production** avant le cutover Tools.

---

## 11. MFA admin — séquence sûre (éviter le verrouillage plateforme)

Piège : #18 `…237` (+ #36 `…250`, #39 `…252`) exigent AAL2 sur les RPC plateforme ; l'UI
d'enrôlement/challenge MFA n'existe **que dans le frontend canonique** (lot `feat/elsatia-mfa-v1`,
intégré à `6df3ebd`). Si la base est migrée mais l'ancien front (`fcdd4e7`) reste servi, **aucun
admin ne peut obtenir AAL2** → plateforme verrouillée.

**Séquence sûre :**
1. Le frontend canonique `6df3ebd` (avec UI MFA) est déployé **dans la même fenêtre**, immédiatement
   après les migrations (étape 10), **avant** toute opération plateforme.
2. Premier admin (`julien@elsatia.fr`) : login → `/parametres/securite`. `decisionGardeMfa` :
   `aalActuel=aal1`, `aalSuivant=aal1` (aucun facteur) → **« enroler »** → enrôlement TOTP
   **autorisé à AAL1** (pas de chicken-and-egg). Puis challenge TOTP → **AAL2**.
3. `/plateforme` (garde `exigerAal2Plateforme`) devient accessible → enrôler le 2ᵉ admin total,
   puis exécuter les étapes 12→16 (seed catalogue, activations Colors/Tools).
4. Ne jamais lancer une RPC plateforme AAL2 (activation application, habilitation) **avant** que
   l'admin exécutant ait complété son challenge AAL2.

Prérequis MFA : la config GoTrue de `exhvuzegsefmoguxoiak` doit autoriser TOTP (MFA activé au
niveau projet Supabase). À vérifier avant cutover.

---

## 12. Ed25519 (attestation Stripe state — #26 `…244`, #27 `…245`)

**Prérequis DB** (créés par #26, mais **vides**) :
- schéma `stripe_attestation` : `configuration`, `public_keys(key_id text PK, public_key bytea(32))`,
  `consumed_attestations(jti, key_id, …)` ;
- colonnes `preuve_attestation_*` sur `plateforme_operations_remise` ;
- **extension `pgsodium`** requise ;
- grants au rôle `elsatia_discount_f4_writer`.

**À provisionner AVANT le premier traitement de remise post-cutover** (aucune clé dans ce
rapport) :
1. Générer une paire Ed25519 (32 octets clé publique).
2. **Insérer la clé publique + `key_id`** dans `stripe_attestation.public_keys` — via une étape de
   seed contrôlée post-migration (la migration ne seed pas la clé), `key_id` conforme au motif
   `^[a-z0-9_.:-]{1,64}$`.
3. Renseigner en **Vercel `elsatia-production` (Production)** : `STRIPE_STATE_ATTESTATION_KEY_ID`
   (= le `key_id` ci-dessus) et `STRIPE_STATE_ATTESTATION_PRIVATE_KEY_B` (clé privée encodée) ;
   le toggle `ACTIONS_ATTESTATION_STRIPE` selon le contrat du lot.
4. Vérifier `stripe_attestation.configuration` (environnement attendu = `production`).

Sans (2) et (3) cohérents, `#27` rend l'observation des remises **fail-closed** : toute opération
de remise/coupon Stripe échoue tant que l'attestation n'est pas vérifiable. Stripe Live étant
absent, l'impact immédiat est nul, mais **la clé doit être en place avant l'ouverture de Stripe
Live** (lot séparé) — à traiter dans la fenêtre de cutover pour éviter un oubli.

---

## 13. Rollback (réf. `docs/runbooks/ELSATIA_PRODUCTION_ROLLBACK_V1.md`)

| Moment | Procédure |
|---|---|
| **Avant migration #15 `…234`** (échec pendant le bloc historique `…200`→`…232`) | Rollback simple : `pg_restore` du backup (étape 3) **ou** PITR au timestamp étape 2 ; frontend inchangé (`fcdd4e7` reste servi). Aucune down migration. |
| **Après le bloc ACL / AAL2 (#16-#19, #21-#27, #36, #39)** | Rollback **coordonné** : (a) `app.elsatia.fr` en maintenance ; (b) **PITR restore** de `exhvuzegsefmoguxoiak` au timestamp étape 2 (les REVOKE ne se « dé-révoquent » pas proprement à la main — restaurer l'état) ; (c) rollback Vercel `elsatia-production` vers `fcdd4e7` ; (d) `elsatia-colors` / `elsatia-tools` : dépublier les domaines ou laisser en page « indisponible » (leurs tables n'existent plus après restore) ; (e) rouvrir. Storage : aucun rollback nécessaire si aucune écriture Colors/Tools n'a eu lieu (vérifier via l'inventaire étape 4). |
| **Après #15 `…234` + activation multi-app (#12-#16 du plan)** | Impact données : `acces_applications_entreprises` / `habilitations_applications_utilisateurs` / `historique_acces_applications` contiennent des lignes réelles ; un PITR pré-migration les efface (acceptable — elles seront recréées par RPC au prochain cutover). Aucune donnée métier Gestion Pro n'est touchée par ces activations. |
| **Après #42 `…255`** | Idem « après bloc ACL » : PITR restore + rollback frontend obligatoires. Un rollback Vercel seul laisse 1220 REVOKE en place → ancien front cassé. |

Aucune down migration improvisée. Le point de bascule « rollback simple → rollback coordonné » =
migration #18 `20260826000237` (§6).

---

## 14. Fenêtre / downtime

| Phase | Estimation |
|---|---|
| Backups (DB + Storage + checksums) — hors ligne possible mais recommandé maintenance OFF encore | 20–40 min (selon volume Storage ; Production ~peu d'objets d'après P6) |
| **Maintenance ON → app indisponible** | — |
| Application des 42 migrations | **5–15 min** (REVOKE = métadonnées, rapides ; seul le bloc `…201`/`…202`/`…254` touche des données `plans_abonnement`, volume minime ; tables multi-app/Colors/Tools créées vides) |
| Verify ledger + smoke SQL | 5–10 min |
| pgTAP 45 fichiers contre Production (ou copie PITR) | 5–15 min |
| Déploiement frontend canonique `6df3ebd` (build Vercel) | 5–10 min |
| Enrôlement MFA + AAL2 + seed catalogue + activations Colors/Tools | 10–20 min |
| Validations fonctionnelles GP + Colors + Tools + multitenant | 20–40 min |
| **Maintenance OFF** | — |

**Downtime dur (app inaccessible) : ~30–60 min.**
**Fenêtre de maintenance totale : 90–150 min** (backups inclus), à planifier hors heures ouvrées
BTP (soir / week-end). **Zéro downtime non démontré → ne pas le promettre.**

---

## 15. Checklist GO / NO-GO

### Avant migration
| Contrôle | Preuve | Responsable |
|---|---|---|
| Ledger Production lu directement (`schema_migrations`) et = état attendu (head `…233`, 211) | capture SQL | DBA / Julien |
| Branche cible figée `6df3ebd`, 253 migrations, head `…255` ; `fcdd4e7` ancêtre confirmé | `git merge-base --is-ancestor` | Claude/Codex |
| 256/257 confirmées hors périmètre | ce document §3 | Julien |
| PITR rétention ≥ 24 h ; timestamp T0 noté | dashboard Supabase | Julien |
| `pg_dump` chiffré + checksum ; backup Storage + checksums | fichiers + hash | Julien |
| Extension `pgsodium` disponible sur `exhvuzegsefmoguxoiak` | `select * from pg_available_extensions where name='pgsodium'` | DBA |
| TOTP MFA activé au niveau projet Supabase Production | dashboard Auth | Julien |
| Clé Ed25519 générée ; plan d'insertion `public_keys` + env Vercel prêt (valeurs non partagées) | checklist §12 | Julien |
| Env Vercel `elsatia-production` complètes pour `6df3ebd` (Sentry, Brevo, Supabase, Ed25519) | `vercel env ls` (noms) | Claude/Codex |
| Env `elsatia-tools` **repointées** sur `exhvuzegsefmoguxoiak` (Production) | `vercel env ls` | Claude/Codex |
| Production Branch Vercel `elsatia-production` = branche canonique (pas `main`) | dashboard Vercel | Julien |
| Fenêtre communiquée ; endpoint webhook Stripe coupé | plan | Julien |

### Après migration
| Contrôle | Preuve | Responsable |
|---|---|---|
| `schema_migrations` = 253 entrées, head `20260902000255`, identique à Preview | diff ledger | DBA |
| `applications_elsatia`, `acces_applications_entreprises`, `habilitations_applications_utilisateurs`, `roles_applications_elsatia`, `colors_*`, `stripe_attestation.*` présents | `\dt` / `to_regclass` | DBA |
| `contexte_application_courant()` et `a_acces_application()` répondent | appel SQL | DBA |
| pgTAP 45 fichiers : PASS | sortie `supabase test db` | Claude/Codex |
| `count(*)` tables métier GP inchangés vs backup | diff | DBA |
| Aucune erreur de migration ; aucune down migration exécutée | log | DBA |

### Avant deploy
| Contrôle | Preuve | Responsable |
|---|---|---|
| Build `6df3ebd` vert (lint/typecheck/test/build racine + tools + colors) | CI / local | Claude/Codex |
| `verify:migrations`, `verify:secrets`, `npm audit` OK | sortie | Claude/Codex |

### Après deploy
| Contrôle | Preuve | Responsable |
|---|---|---|
| `app.elsatia.fr` HTTP 200, login `julien@elsatia.fr` OK | ouverture réelle | Julien |
| MFA : enrôlement TOTP + AAL2 obtenu ; `/plateforme` accessible | parcours réel | Julien |
| 2ᵉ admin total enrôlé | parcours | Julien |
| Seed catalogue apps vérifié ; activations Colors + Tools via RPC (AAL2) | log RPC + `historique_acces_applications` | Julien |
| `colors.elsatia.fr` : login Julien → `/dashboard`, parcours métier, isolation tenant | ouverture réelle | Julien |
| `tools.elsatia.fr` : login/logout, PWA, `/suppression-compte`, aucun bouton achat mobile actif, entitlement Pro | ouverture réelle | Julien |
| Multitenant A/B sur GP + Colors + Tools : aucune fuite | parcours | Julien |
| Sentry `vercel-production` : pas d'erreur 5xx / `Accès refusé` inattendu sur 30 min | dashboard Sentry | Julien |

### Avant réouverture
| Contrôle | Preuve | Responsable |
|---|---|---|
| Callback Auth Supabase : `colors.elsatia.fr/auth/callback` + `tools.elsatia.fr/auth/callback` ajoutés (rien supprimé) | dashboard Auth | Julien |
| Endpoint webhook Stripe rouvert ; `STRIPE_WEBHOOK_EXPECTED_MODE=test` | config | Julien |
| Rollback documenté et testé conceptuellement (PITR T0 connu) | ce document §13 + runbook | Julien |
| Décision GO explicite consignée | message | Julien |

**NO-GO si** : ledger Production illisible ou inattendu ; `pgsodium` indisponible ; TOTP MFA
désactivé côté projet ; clé Ed25519 non prête ; pgTAP rouge ; `count(*)` métier divergent ;
impossibilité d'obtenir AAL2 sur le nouveau front ; env `elsatia-tools` encore sur Preview.

---

## 16. Livrable

Ce fichier : `docs/audits/ELSATIA_PRODUCTION_MIGRATION_CUTOVER_PREFLIGHT_V1.md`. Aucune
modification de code, aucune migration, aucun déploiement, aucune donnée Production touchée.

---

## 17. Rapport

1. **Ledger Production** : reconstruit (sondes anon + SHA Vercel déployé), **à confirmer par lecture directe** — head `20260825000233`, 211 migrations, historique non canonique (dérive `…200`→`…215` + `…232` absente, `…219`→`…233` présente).
2. **Dernière migration Production** : `20260825000233_admin_plateforme_julien_elsatia_fr`.
3. **Cible canonique** : `feat/preprod-e2e-runbook-integration-v1`.
4. **SHA cible** : `6df3ebd`.
5. **Migration head cible** : `20260902000255_acl_reconciliation_v1` (253 fichiers).
6. **Migrations manquantes exactes** : **42** (liste §4) — 12 du bloc historique `20260815000200`→`20260818000215`, 30 de `20260825000232` à `20260902000255`.
7. **Migrations sensibles** : #18 `…237` (AAL2), #19 `…238` (write hardening), #23 `…242` (DROP RPC remises), #25 `…243` (garde colonnes remise), #26 `…244` + #27 `…245` (attestation Ed25519 fail-closed), #36 `…250` + #39 `…252` (AAL2), #41 `…254` (réparation dérive), #42 `…255` (1220 REVOKE).
8. **Ancien frontend `fcdd4e7` compatible avec la base migrée ?** : **NON** — console admin plateforme cassée (AAL2 sans UI MFA), chemins remise/Stripe en fail-closed ; multi-app/Colors/Tools additifs sont sans impact mais ne suffisent pas. Cutover = migrations **+** déploiement `6df3ebd` dans la même fenêtre.
9. **Point de non-retour** : migration #18 `20260826000237_platform_aal2_role_integrity_v1` — au-delà, tout rollback est coordonné (PITR restore + rollback frontend), jamais Vercel seul.
10. **Ordre cutover** : 20 étapes §7 (gel → backups/PITR → maintenance → 42 migrations → verify ledger → pgTAP/smoke → deploy `6df3ebd` → MFA/AAL2 → seed catalogue → activation+habilitation Colors → validation Colors → activation+habilitation Tools → validation Tools → multitenant → Stripe TEST → réouverture).
11. **Seed apps** : catalogue `applications_elsatia` + `roles_applications_elsatia` probablement seedés par #15/#28-31/#32-35 (à confirmer) ; `acces_applications_entreprises` et `habilitations_applications_utilisateurs` **jamais** en INSERT direct → RPC `plateforme_activer_application_entreprise` / `plateforme_habiliter_utilisateur_application` (AAL2).
12. **Activation Colors** : migrations #15 + #28-31 ; puis RPC droit entreprise `colors` + habilitation Julien `colors_admin_organisation` + callback Auth `colors.elsatia.fr/auth/callback` + bucket/policies Colors + `SUPABASE_SERVICE_ROLE_KEY` présent.
13. **Activation Tools** : migrations #15 + #32-35 + #37 ; RPC droit entreprise `tools` + habilitation Julien + callback `tools.elsatia.fr/auth/callback` (+ vérifier `fr.elsatia.tools://auth/recovery`) ; **repointer l'env `elsatia-tools` de Preview vers `exhvuzegsefmoguxoiak`** ; billing web désactivé (R9 absent).
14. **MFA** : frontend canonique déployé dans la même fenêtre ; `julien@elsatia.fr` enrôle TOTP à AAL1 (`decisionGardeMfa` = « enroler ») puis challenge → AAL2 → `/plateforme` ; aucune RPC plateforme AAL2 avant ce challenge ; TOTP MFA activé au niveau projet Supabase (prérequis).
15. **Ed25519** : schéma `stripe_attestation` + `pgsodium` créés vides par #26 ; générer la paire, insérer clé publique + `key_id` dans `stripe_attestation.public_keys` (seed contrôlé), renseigner `STRIPE_STATE_ATTESTATION_KEY_ID` + `STRIPE_STATE_ATTESTATION_PRIVATE_KEY_B` (+ `ACTIONS_ATTESTATION_STRIPE`) en Vercel `elsatia-production` — avant tout traitement de remise ; aucune clé dans ce rapport.
16. **Backup / rollback** : `pg_dump` chiffré + checksum, backup Storage + checksums, PITR T0 noté ; rollback simple avant #15, rollback coordonné PITR+frontend après #18/#42 ; réf. `docs/runbooks/ELSATIA_PRODUCTION_ROLLBACK_V1.md` ; aucune down migration.
17. **Downtime estimé** : dur ~30–60 min ; fenêtre de maintenance 90–150 min (backups inclus) ; hors heures ouvrées ; zéro downtime non promis.
18. **Checklist GO** : §15 (avant migration / après migration / avant deploy / après deploy / avant réouverture), chaque ligne avec preuve + responsable ; conditions NO-GO listées.
19. **Production modifiée** : **NON**.
20. **Verdict** : ci-dessous.

---

`ELSATIA-PRODUCTION-MIGRATION-CUTOVER-PREFLIGHT-V1 VALIDÉ — PLAN DE CUTOVER COORDONNÉ PRÊT — AUCUNE MIGRATION PRODUCTION EXÉCUTÉE`
