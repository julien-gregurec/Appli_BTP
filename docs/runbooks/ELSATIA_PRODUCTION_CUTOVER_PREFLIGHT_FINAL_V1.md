# ELSATIA — Préflight final de cutover Production V1

Version 1.1 — 2026-09-04 (mise à jour : clôture offline P0-2/P0-4). **Documentation opérateur —
lecture / préparation, plus preuves d'exécution offline au §13.** Aucune migration Production,
aucun déploiement Production, aucune mutation Stripe Live, aucun secret affiché.

Il **met à jour** la cible du cutover avec le vrai HEAD commercial canonique et se superpose au
runbook de bascule/rollback existant :

- Mécanique de bascule et de rollback détaillée : `docs/runbooks/ELSATIA_PRODUCTION_ROLLBACK_V1.md` (V1, 2026-09-02).
- Preuves BDD E2E + rollback local (cible 253) : `docs/audits/ELSATIA_PREPROD_DB_E2E_ROLLBACK_V1.md`.
- Canonicalisation d'historique : `docs/audits/migration-canonicalization-v2.md`.
- Revue indépendante préprod : `docs/audits/ELSATIA_PREPROD_INDEPENDENT_REVIEW_V1_R2.md`.
- **Preuves d'exécution offline au SHA `c1930ab` (Fresh 261, Restore→261, rollback, drift ACL)** :
  §13 de ce document (lot `ELSATIA-CUTOVER-OFFLINE-P0-CLOSURE-V1`, 2026-09-04).

---

## 0. Ce qui change par rapport au runbook V1

| Élément | Runbook V1 (2026-09-02) | Préflight final (ce document) |
|---|---|---|
| Branche cible | `feat/tarification-on-canonical-preprod-v1` | `feat/elsatia-commercial-canonical-r1-r2-r3-v1` |
| SHA cible | `ac7bf050…` | **`c1930ab366109a990c1d89a1a38401f5e1c4b2c5`** |
| Ledger cible | 253 (`…000255`) | **261 (`…000263`)** |
| Delta vs `ac7bf05` | — | **+8 migrations** : `…000256` → `…000263` (R1 capacité, R3 modules, R2 Stripe capacité, ACL webhook abonnement, clôture lifecycle) |
| Frontend Production actuel | `release/commercialisation-v1` @ `fcdd4e7c` (obsolète pré-canonique) | inchangé |

Le reste du runbook V1 (principe central, stratégies de rollback A/B/C, rollback ACL/Auth/MFA/
Storage/Stripe, matrice de décision, responsabilités) **reste applicable tel quel**.

---

## 1. Baseline Production — à relire en direct avant le cutover (P0)

**Cette session n'a pas d'accès à Supabase Production.** La CLI locale est liée au projet
**Preview** (`pgvvpqyjziyapbbkydmc`) ; Production = `exhvuzegsefmoguxoiak` (eu-west-3). Aucun
jeton d'accès Supabase ni identifiant DB Production n'est disponible ici, et la lecture directe
exigerait un secret que ce lot n'a pas le droit de manipuler.

La baseline ci-dessous provient donc du runbook V1 (P5/P10, 2026-09-02) et **doit être
reconfirmée par une lecture en lecture seule** par l'opérateur, à T-60 :

| Attendu (runbook V1) | À reconfirmer en direct |
|---|---|
| Branche/SHA app | `release/commercialisation-v1` @ `fcdd4e7c90f32abb15502e825335659f9d57c9a1` |
| Ledger migrations Production | **211** versions (l'audit de canonicalisation observait 210 ; l'écart de 1 est précisément la raison de cette relecture) |
| Dernière version appliquée | à lire |
| `…000255_acl_reconciliation_v1` appliquée ? | **non** attendu (point de non-retour non encore franchi) |
| Sentinelles métier | 6 entreprises / 6 utilisateurs / 31 clients / 30 chantiers / 108 devis / 73 factures (snapshot DR 2026-09-02) |

### Commandes de relecture (lecture seule, opérateur)

```
# jeton d'accès personnel Supabase requis dans l'environnement de l'opérateur
supabase login                      # ou export SUPABASE_ACCESS_TOKEN=...
supabase migration list --linked --project-ref exhvuzegsefmoguxoiak
# → colonne "Remote" = ledger réel ; comparer au fichier supabase/migrations/ de c1930ab

# ledger brut + sentinelles (psql lecture seule sur la chaîne Production)
psql "$PROD_READONLY_DSN" -c "select count(*), max(version) from supabase_migrations.schema_migrations;"
psql "$PROD_READONLY_DSN" -c "select version from supabase_migrations.schema_migrations order by version;"
psql "$PROD_READONLY_DSN" -c "select
  (select count(*) from public.entreprises)  as entreprises,
  (select count(*) from public.utilisateurs) as utilisateurs,
  (select count(*) from public.clients)      as clients,
  (select count(*) from public.chantiers)    as chantiers,
  (select count(*) from public.devis)        as devis,
  (select count(*) from public.factures)     as factures;"
```

**Sortie attendue à archiver** : liste ordonnée des versions Production + `count`/`max` +
sentinelles. Le diff `versions canoniques (c1930ab) − versions Production` **est** la liste
d'application du §2.

---

## 2. Migration gap — liste ordonnée à appliquer

Cible canonique : **261 migrations** (`supabase/migrations/*.sql` @ `c1930ab`,
`verify:migrations` = « 261 migrations valides, noms et horodatages uniques »).

Aucune migration historique déjà présente sur Production (≤ `fcdd4e7c`) n'est modifiée par la
lignée canonique — vérifié par la revue indépendante R2
(`git diff fcdd4e7c..c1930ab -- supabase/migrations/` : aucune migration existante touchée).
**Le cutover est donc purement additif (append-only).**

### 2.1 Volume

| Départ Production | Cible | Migrations à appliquer |
|---|---|---|
| ledger **211** (attendu) | ledger **261** | **50** |
| ledger **210** (si relecture le confirme) | ledger **261** | **51** |

La liste exacte = **toute version de `supabase/migrations/` @ `c1930ab` absente du ledger
Production**, appliquée **dans l'ordre lexical du nom de fichier** (= ordre d'application).
Y compris les versions à horodatage inférieur au `max(version)` Production (migrations Preview-only
et réconciliations réintégrées par la canonicalisation v2).

### 2.2 Bloc 211 → 253 (identique au runbook V1)

42 migrations, déjà validées Fresh + Restore + pgTAP 870/870 + rollback local 210→253→210
(`ELSATIA_PREPROD_DB_E2E_ROLLBACK_V1`). Comprend notamment, dans l'ordre :

- `20260815000200_reconciliation_pre_tarifs_v2` (préflight tarifs, no-op si déjà réconcilié)
- `20260816000201_tarifs_v2_catalogue` … `20260818000215_avenants_v1_integration_facturation`
- `20260825000232_platform_function_signature_preflight_v2` (préflight signature, no-op Fresh/Preview)
- restauration exacte de `20260826000237_platform_aal2_role_integrity_v1` (compat `42P13`)
- `20260828000246_colors_functional_core_v1` … `20260828000249_colors_security_cleanup_v13`
- `20260901000250_platform_promotion_aal2_hardening_v1` … `20260901000253_support_message_author_guard_r75`
- `20260901000254_migration_canonicalization_v2` (réconciliation tarifaire finale, append-only, 5 lignes d'audit sur Fresh/Production, 0 sur Preview)
- **`20260902000255_acl_reconciliation_v1`** — *point de non-retour* (cf. §3)

### 2.3 Bloc 253 → 261 — delta commercial R1/R2/R3 (nouveau)

| Ordre | Version | Objet | Nature ACL |
|---|---|---|---|
| 254 | `20260903000256_active_person_capacity_r1_v1` | R1 — capacité « personnes actives » (colonnes `entreprises`, RPC pures, backfill) | REVOKE/GRANT **locaux aux nouveaux objets** ; `grant execute … to authenticated` |
| 255 | `20260903000257_modules_a_la_carte_r3_v1` | R3 — modules à la carte (`modules_gestion_pro`, `modules_entreprises`, `historique_modules_entreprises`, RPC garde `acces_module_pour_permission`, `plateforme_definir_module_entreprise` = admin + AAL2) | `revoke all … from public, anon, service_role` sur les **nouveaux** objets ; `grant … to authenticated` ; **aucun** grant service_role |
| 256 | `20260903000258_capacity_stripe_r2_v1` | R2 — modèle de données + logique pure capacité Stripe | locaux aux nouveaux objets |
| 257 | `20260903000259_capacity_stripe_r2_b_v1` | R2-B — RPC `synchroniser_capacite_stripe_service` (SECURITY DEFINER, garde tenant) | RPC service dédiée, minimale |
| 258 | `20260903000260_capacity_stripe_r2_d_cancel_scheduled_v1` | R2-D — `annuler_baisse_capacite_planifiee` | RPC service dédiée |
| 259 | `20260903000261_capacity_stripe_r2_d_close_converged_op_v1` | R2-D — `capacite_stripe_finaliser_op_convergente`, marqueur d'événement | RPC service dédiée |
| 260 | `20260904000262_stripe_subscription_webhook_acl_v1` | Webhook abonnement compatible ACL canonique — 5 RPC SECURITY DEFINER (`synchroniser_abonnement_stripe_service`, journal `reserver/finaliser/annuler_evenement_abonnement_service`, `synchroniser_facture_abonnement_service`) | RPC service dédiées, **pas** de réattribution large de `UPDATE public.entreprises` |
| 261 | `20260904000263_stripe_subscription_lifecycle_closure_v1` | Clôture B1/B2/B3 — `lier_subscription_entreprise_service`, `calculer_depassement_appareils_service`, `enregistrer_/finaliser_releve_stockage_service` | RPC service dédiées |

Aucune migration 256–263 ne touche les schémas Colors ou Tools, ne modifie la migration 255, ni
ne réaccorde un grant large à `service_role`. Elles n'ajoutent **aucune** incompatibilité
supplémentaire pour l'ancien binaire au-delà de ce que 255 impose déjà (cf. §3).

### 2.4 Contrôles post-application (T0)

- ledger final = **261**, `…000263` présente, `…000255` présente, aucune collision de timestamp ;
- `verify:migrations` (dans un environnement portant le code `c1930ab`) = 261 uniques ;
- second passage `supabase migration up` : `applied: []` ;
- pgTAP Production ciblé (référence Fresh 261 **et** Restore→261, drill offline §13.1/§13.2 :
  **53 fichiers / 1133 tests — PASS**, identique sur les deux) + smoke SQL sentinelles inchangées ;
- 5 lignes d'audit tarifaire (`…000254`) attendues sur Production (0 si l'état est déjà réconcilié).

---

## 3. Compatibilité frontend — cutover coordonné obligatoire

**Confirmé :**

1. **L'ancien frontend Production (`fcdd4e7c`) est incompatible avec la base migrée.**
   Dès `20260902000255_acl_reconciliation_v1` : ~1 220 `REVOKE` ciblés + 14
   `ALTER DEFAULT PRIVILEGES … REVOKE`, `est_plateforme_admin()` devient UID + AAL2, RPC de
   remise legacy révoquées (`…000242`), tables/fonctions absentes de `fcdd4e7c`. Le binaire
   `fcdd4e7c` échouera fermé sur des chemins plateforme/remise et ignore R1/R2/R3.

2. **Un cutover coordonné DB + app est nécessaire.** Ordre : migrations (T0) → déploiement de
   l'app sur **`c1930ab`** (T+15) → contrôles → ouverture (T+30). L'app `c1930ab` est la seule
   qui connaît le schéma cible complet (ACL 255, MFA/AAL2, Colors, Tools, R1/R2/R3).

3. **Point de non-retour exact : application de `20260902000255_acl_reconciliation_v1`.**
   Avant : un rollback Vercel seul suffit. Après : le rollback code seul est insuffisant — les
   migrations 256–263 ne déplacent pas ce point (append-only, sans REVOKE large supplémentaire),
   mais elles élargissent le schéma que seul `c1930ab` sait exploiter.

4. **Rollback = restauration DB (PITR / snapshot pris à T-30) + redéploiement coordonné du
   frontend correspondant à l'état DB restauré.** Détail : runbook V1 §5 (stratégies A/B/C),
   §6 (ACL), §13 (scénarios T0–T4). Les « down migrations » improvisées sont interdites ;
   l'inversion fiable des REVOKE de `…000255` passe par le snapshot (B) ou un bundle de
   compatibilité préparé et testé à l'avance (C).

---

## 4. Sauvegardes avant cutover

Procédure inchangée — runbook V1 §2 (PITR), §3 (dump DB), §4 (Storage), et prérequis P1–P8.
Rappel synthétique :

| # | Sauvegarde | Vérification | Emplacement |
|---|---|---|---|
| T0-snap | **PITR / snapshot managé Production** | identifiable (id + horodatage UTC), restaurable (vérifié sur le plan du projet, pas supposé), rétention ≥ T0 + 24 h | Supabase (projet `exhvuzegsefmoguxoiak`) |
| dump | **`pg_dump` format custom `--compress=9`** | SHA-256 calculé puis relu ; manifeste (taille, SHA-256, TOC count, `backup_id`) | volume DR chiffré `/Volumes/ELSATIA-PRODUCTION-DR/…/database/` **uniquement** (jamais de fichier en clair hors volume) |
| storage | **Backup Storage chiffré (13 buckets)** | `verify-storage-backup` PASS ; SHA-256 par objet ; manifeste | volume DR chiffré `…/storage/` |
| lien | **Manifestes DB + Storage reliés au même `backup_id`** (horodatage UTC commun, ex. `20260904T…Z`) | cohérents | volume DR chiffré `…/manifest/` |
| état | ledger (attendu 211) + inventaire ACL (`aclexplode` + policies) + inventaire admins plateforme (email, `utilisateur_id`, rôle, `actif`, `statut_identite`) + état MFA (facteurs TOTP, moyens de récupération) | archivés | volume DR chiffré |
| preuve | **test de restauration** : dump → base isolée → sentinelles `…|211|…` exactes (cf. `ELSATIA_PREPROD_DB_E2E_ROLLBACK_V1` §10, rollback local 210→253→210 déjà prouvé) | sentinelles identiques avant/après | base probe jetable, jamais Preview/Production |

Aucun secret n'apparaît dans les manifestes, dumps, tickets ou logs. Le rôle de dump dédié
`elsatia_backup` (NOLOGIN hors fenêtre) est réactivé le temps du dump puis refermé.

---

## 5. Variables / secrets requis avant cutover — **noms uniquement**

Valeurs jamais affichées. Présence/état à cocher sur la fiche Vercel (runbook V1 §10).

**Supabase (Production) :** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
(ou `NEXT_PUBLIC_SUPABASE_ANON_KEY` selon convention), `SUPABASE_SERVICE_ROLE_KEY`.

**Stripe (TEST — recette Production fermée) :** `STRIPE_SECRET_KEY` (clé `sk_test_…`),
`STRIPE_WEBHOOK_EXPECTED_MODE` (= `test`), `STRIPE_WEBHOOK_ABONNEMENT_SECRET`,
`STRIPE_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_BOUTIQUE_SECRET`,
`STRIPE_PRICE_{MINI,PRO,BUSINESS,ENTREPRISE}_{MENSUEL,ANNUEL}`,
`STRIPE_PRICE_COMPTE_SUP_{…}_{MENSUEL,ANNUEL}`, `STRIPE_PRICE_OPTION_IA_{100,300,ILLIMITE}_{MENSUEL,ANNUEL}`,
`STRIPE_AUTOMATIC_TAX_ENABLED`, `STRIPE_CONNECT_CLIENT_ID` (si Connect utilisé).

**Attestation Ed25519 (Stripe state proof) :** `STRIPE_STATE_ATTESTATION_KEY_ID` (non secret,
doit correspondre entre Vercel et la registry en base), `STRIPE_STATE_ATTESTATION_PRIVATE_KEY_B64`
(**Vercel uniquement**, jamais dans doc/dump/log).

**Feature flags / gel commercial :** `ABONNEMENTS_PUBLICS_OUVERTS` (= `false`),
`FEATURE_AI_ENABLED`, `FEATURE_BOUTIQUE_ENABLED`, `FEATURE_CRONS_ENABLED`,
`DISABLE_EMAIL_LOGIN` (= `false` en Production), `ELSATIA_APPLICATION_ENV`.

**URLs app :** `NEXT_PUBLIC_APP_URL` (= `https://app.elsatia.fr`), `SUPPORT_EMAIL`
(= `support@elsatia.fr`), `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`.

**Colors / Tools (multi-app) :** `NEXT_PUBLIC_TOOLS_BILLING_API_URL`, `TOOLS_APP_URL`,
`TOOLS_ALLOWED_ORIGINS`, `STRIPE_TOOLS_SECRET_KEY`, `STRIPE_TOOLS_WEBHOOK_SECRET`,
`STRIPE_TOOLS_PRICE_{MONTHLY,ANNUAL}`.

**Crons / webhooks / intégrations :** `CRON_SECRET`, `NOTIFICATIONS_WEBHOOK_SECRET`,
`PAYROLL_IMPORT_SECRET`, `RATE_LIMIT_HMAC_KEY`, `BANK_DATA_ENCRYPTION_KEY`,
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`,
`POWENS_CLIENT_ID`, `POWENS_CLIENT_SECRET`, `POWENS_API_BASE_URL`, `POWENS_WEBVIEW_BASE_URL`,
`OPENAI_API_KEY`, `OPENAI_MODEL`, `BREVO_API_KEY`,
`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL`,
`GOOGLE_PLAY_RTDN_AUDIENCE`, `APPLE_ROOT_CA_BASE64`.

**Observabilité :** `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`,
`SENTRY_PROJECT`.

**Écart connu (P1) :** les 4 `STRIPE_PRICE_*_ANNUEL` peuvent encore pointer sur des Prices ×12
au lieu des Prices « 10 × mensuel » de la grille canonique — lot
`ELSATIA-STRIPE-TEST-ANNUAL-ENV-ALIGNMENT-V1`. `verify:stripe-prices --strict` doit être
**8/8** dans un environnement portant réellement les variables.

---

## 6. MFA / AAL2 — séquence exacte

Aucun QR, seed TOTP ni code n'est demandé, transmis ou consigné (ici ou ailleurs).

1. **Déployer l'app canonique (`c1930ab`)** sur la Production Branch correcte (**pas `main`**).
2. **Login AAL1** de l'admin humain (`julien@elsatia.fr`) — les sessions AAL1 pré-cutover sont
   automatiquement re-challengées (comportement voulu).
3. **Enrollment TOTP** si le facteur n'existe pas / doit être renouvelé : l'admin scanne son
   propre QR dans son application d'authentification, hors de tout canal partagé.
4. **Challenge AAL2** : saisie du code TOTP → session élevée à AAL2.
5. **Validation admin `total`** : l'admin atteint `/plateforme` en AAL2 ; matrice de refus
   vérifiée (non-authentifié → refus ; AAL1 → challenge imposé ; AAL2 non-admin → refus ;
   AAL2 admin inactif → refus).
6. **Second admin `total`** : confirmer qu'un deuxième porteur `total` actif dispose d'un accès
   indépendant (facteur TOTP fonctionnel **ou** récupération e-mail Supabase Auth valide). Le
   compte technique `plateforme@invalid.local` n'est **pas** un chemin de récupération.

Récupération en cas de perte de facteur : flux Supabase Auth de récupération par e-mail puis
ré-enrôlement TOTP. **Jamais** de `DELETE FROM auth.mfa_factors` manuel comme procédure normale
(runbook V1 §7).

---

## 7. Colors / Tools — impact du cutover

- **`c1930ab` contient déjà** l'intégration Colors (`apps/colors/**`, migrations `…000246`–`…000249`)
  et Tools (`apps/tools/**`, migrations `…8`/`…9`/`…10`, R8/R9/R10), la convergence multi-app
  (`…000234`), le compte partagé plateforme et le catalogue d'accès. Ces éléments sont dans le
  **bloc 211→253 déjà validé** Fresh + Restore + pgTAP + E2E `Playwright 40/40`.
- **Les migrations 256–263 ne touchent ni Colors, ni Tools, ni `apps.*`, ni les redirect URLs
  multi-app** (vérifié : `grep -liE "colors_|elsatia_tools|apps\." supabase/migrations/2026090*_25[6-9]|26[0-3]` → aucun).
- **Contrat multi-app** (compte partagé, catalogue d'accès, redirect URLs Colors/Tools) : porté
  par `…000234`–`…000240`/`…000248`/`…000250`, inclus dans le bloc déjà validé ; le cutover ne
  le modifie pas.
- **Devient immédiatement fonctionnel après migrations + déploiement `c1930ab`** :
  - R1 — compteur « personnes actives » X/Y sur `/abonnement`, garde de capacité serveur ;
  - R3 — section **Modules** de `/abonnement` (inclus plan / ajoutés / disponibles), garde
    module `acces_module_pour_permission` dans le proxy, page terminale
    `/abonnement/module-non-inclus` (correctif boucle post-login `c1930ab`) ;
  - R2 — gestion de capacité supplémentaire (+1/+5/+10, prévisualisation, baisse planifiée,
    annulation) câblée sur Stripe **TEST** ;
  - webhook abonnement Stripe conforme à l'ACL canonique (RPC SECURITY DEFINER dédiées).
- Colors Production et Tools Production restent fonctionnellement **inchangés** par le delta
  256–263 ; seul le socle commun (déjà présent dans le bloc validé) est requis.

---

## 8. Stripe — posture pendant le cutover technique

- Production **reste branchée sur Stripe TEST** pendant tout le cutover. Aucune clé `sk_live_`,
  aucun Price Live, aucun webhook Live créé, lu ou modifié.
- `ABONNEMENTS_PUBLICS_OUVERTS = false` : la souscription publique en ligne reste **fermée**
  (changement d'offre et ajout de capacité = opérations internes / contactez-nous).
- `STRIPE_WEBHOOK_EXPECTED_MODE = test` — `resoudreModeStripeWebhook` rejette fermé tout
  événement `livemode=true`.
- **Recette minimale post-cutover — Stripe TEST uniquement** :
  - `verify:stripe-prices --strict` = 8/8 (après alignement des 4 `_ANNUEL`) ;
  - 8 parcours Checkout Test aux bons montants (79/790, 249/2 490, 449/4 490, 599/5 990),
    sans paiement réel, sessions expirées ;
  - 1 aller-retour webhook abonnement Test signé → RPC `synchroniser_abonnement_stripe_service` ;
  - 1 prévisualisation de capacité `+1` sur une entreprise de recette (pas de « Confirmer »
    hors scénario dédié) ;
  - `expected_mode` = `test` vérifié ; entreprise inconnue → erreur contrôlée ; aucun log
    sensible.
- Passage Live = **lot P15 distinct** (`P15_STRIPE_LIVE_PREPARATION.md` / `STRIPE_LIVE_CHECKLIST.md`),
  hors de ce cutover.

---

## 9. Runbook minuté

Durées **indicatives** (repères d'ordre, pas d'engagement). Détail des contrôles : runbook V1 §12.

### T-60 — Préparation & gel
- [ ] Gel : aucun merge, aucun déploiement concurrent sur la branche canonique.
- [ ] **Relecture baseline Production en direct** (§1) : ledger réel, `max(version)`, sentinelles,
      confirmation que `…000255` n'est pas appliquée. Archiver la sortie.
- [ ] Calculer le diff `versions(c1930ab) − versions(Production)` → **liste d'application ordonnée** (§2).
- [ ] Vérifier SHA cible `c1930ab` et SHA Production actuel (`fcdd4e7c` attendu).
- [ ] Accès rollback vérifiés : Vercel, PITR/snapshot activé sur le projet, volume DR chiffré monté.
- [x] Preuves vertes (offline, §13) : Fresh 261 + pgTAP 53/1133, Restore→261 + pgTAP 53/1133,
      drift ACL applicatif = 0, rollback 211 → 261 → 211 sur snapshot ; GP `vitest` 791/791 +
      Tools 107/107 + typecheck + lint + build. **Reste à faire à T-60 réel** : le même contrôle
      sur le **dump Production chiffré** (pas le drill de reconstruction) une fois le PITR/dump
      T-30 disponible.
- [ ] Responsable de rollback (P13) confirmé et joignable ; fenêtre de maintenance (P12) communiquée.

### T-30 — Sauvegardes (§4)
- [ ] PITR/snapshot Production — id + horodatage UTC notés, restaurabilité **vérifiée**.
- [ ] Dump DB chiffré + SHA-256 relu + manifeste (`backup_id`).
- [ ] Backup Storage chiffré + `verify-storage-backup` PASS + manifeste au même `backup_id`.
- [ ] Capture ledger (211), inventaire ACL, inventaire admins plateforme + état MFA.
- [ ] Test de restauration sur base probe jetable → sentinelles `…|211|…` exactes.

### T0 — Migrations
- [ ] Fenêtre de maintenance activée si retenue.
- [ ] Appliquer les **50** (ou 51) migrations absentes, dans l'ordre lexical, via la CLI Supabase officielle.
- [ ] Ledger final = **261**, `…000263` + `…000255` présentes, aucune collision.
- [ ] `verify:migrations` = 261 ; second `migration up` → `applied: []`.
- [ ] pgTAP Production ciblé + smoke SQL sentinelles inchangées + 5 lignes d'audit `…000254` attendues.
- [ ] **Point de décision migration** : ledger + pgTAP OK → continuer ; sinon → §10 scénario T0.

### T+15 — Déploiement app + vérifications
- [ ] Déployer l'app sur **`c1930ab`** (Production Branch correcte, **pas `main`**).
- [ ] **Auth / MFA** (§6) : login AAL1 → challenge TOTP → AAL2 → `/plateforme` → logout/relogin.
- [ ] **Admin / rôle** : matrice non-auth / AAL1 / AAL2 non-admin / AAL2 admin inactif / AAL2 admin `total` actif.
- [ ] **Multitenant** : entreprise A ne voit rien de B (tables, RPC, documents, Storage, habilitations apps, changement d'entreprise).
- [ ] **R1/R3** : `/abonnement` affiche X/Y personnes actives + section Modules ; route non incluse → `/abonnement/module-non-inclus` **terminale** (pas de boucle) ; login entreprise onboardée → dashboard sans boucle.
- [ ] **Colors / Tools** : login croisé selon habilitations ; redirect URLs OK ; aucun accès non habilité.
- [ ] **Stripe TEST** (§8) : `verify:stripe-prices --strict` 8/8 ; 8 checkouts Test ; webhook abonnement Test ; `expected_mode` = `test`.
- [ ] **Storage** : upload/download privé, URL signée, aucun bucket privé devenu public, isolation A↔B.
- [ ] **Monitoring** : Sentry Production + logs Vercel accessibles.

### T+30 — Décision
- [ ] Tous les critères GO (§11 / runbook V1 §15) verts → **ouvrir le service** (retirer la maintenance).
- [ ] Un seul critère NO-GO (§11 / runbook V1 §16) → **rollback** selon §10.

### T+60 → T+90 — Surveillance rapprochée
- [ ] Taux d'erreur Sentry, 5xx Vercel, login/MFA réels, webhooks Stripe Test reçus, upload/download document, aucune erreur RLS anormale.
- [ ] Cohérence `/tarifs` (montants), aucune alerte de sécurité, quotas Auth e-mail non saturés.
- [ ] Puis surveillance T+24 h / T+7 j (runbook V1 §18).

---

## 10. Rollback — critères et procédure

Critères de déclenchement (un seul suffit) :

| Déclencheur | Seuil | Action |
|---|---|---|
| **Migration échoue** | toute migration non appliquée proprement, ledger partiel | **STOP**, ne pas déployer l'app. État incohérent → restaurer PITR/snapshot (stratégie B). Sinon corriger hors Production et recommencer. |
| **Ledger incohérent** | ledger ≠ 261 propre après T0, ou collision de timestamp | STOP, restaurer snapshot. |
| **MFA admin impossible** | aucun admin `total` n'atteint `/plateforme` en AAL2 après login + challenge réels | ne pas ouvrir. Tester 2e admin `total` / récupération e-mail (§6). Irréparable vite → rollback coordonné app+DB (B). |
| **Login cassé** | 5xx généralisés, page blanche, app indisponible > ~10 min sans correctif | forward-fix (A) si bug mineur identifié ; sinon **rollback coordonné** : redéployer `fcdd4e7c` **+** restaurer le snapshot (car `fcdd4e7c` incompatible avec la DB migrée — §3). |
| **Multi-tenant cassé** | toute fuite A↔B (tables, RPC, documents, Storage) | rollback app immédiat + restauration DB selon cause + STOP commercial. |
| **Webhook critique cassé** | webhook abonnement Test rejeté à tort, mauvais mode, ou double-facturation | maintenir `ABONNEMENTS_PUBLICS_OUVERTS=false` ; revenir à la config webhook TEST connue (variables Vercel) ; le code n'est pas rollbacké pour un problème de variable. |
| **App 5xx critique** | erreurs serveur massives sur chemins clés, non corrigeables en forward-fix | rollback coordonné app+DB (B). |
| **Absence de backup vérifié / rollback techniquement impossible** | constaté à T-30 ou T0 | **ne pas migrer**. |

Procédure de rollback coordonné (runbook V1 §11 / §13) :

1. Fermer les écritures ; capturer état, ledger, variables, version applicative.
2. Conserver PITR/snapshot, dump chiffré, backup Storage, hashes, inventaire ACL/admins/MFA, état Stripe.
3. Restaurer DB **et** Storage dans une cible isolée, puis basculer.
4. Vérifier checksums, sentinelles, Auth, ACL/RLS, liens DB ↔ Storage.
5. Déployer le binaire correspondant à l'état DB restauré (`fcdd4e7c` si retour pré-cutover complet).
6. Smoke : HTTP `/`, `/login`, `/dashboard` ; DB non mutatif ; Auth login/session/logout ; isolation tenant.
7. Rouvrir les écritures **seulement** après GO explicite.

Interdits : down migrations improvisées, `GRANT`/`REVOKE` permissif improvisé en Production,
extraction de la clé privée Ed25519 hors Vercel, `DELETE FROM auth.mfa_factors` manuel.

---

## 11. GO / NO-GO

### Blockers P0 (bloquants — à lever avant toute fenêtre de cutover)

| # | Blocker | État | Levée |
|---|---|---|---|
| P0-1 | **Baseline Production non relue en direct** dans un contexte autorisé (ledger réel, sentinelles, absence de `…000255`) | ouvert (pas d'accès Production dans le lot de préparation) | opérateur exécute §1 à T-60, archive la sortie |
| P0-2 | ~~Répétition Fresh 261 + Restore 261 + pgTAP + rollback `211 → 261 → 211`~~ | **FERMÉ 2026-09-04** — drill offline complet au SHA `c1930ab`, preuves §13.1–§13.3 | — |
| P0-3 | **PITR/snapshot + dump chiffré + backup Storage + test de restauration** au `backup_id` du **cutover réel** | non créés (interdits hors fenêtre Production) — le T0-snapshot §13.2 est un drill offline, pas la sauvegarde Production | T-30, opérateur + CODEX |
| P0-4 | ~~Diff ACL applicatif Fresh↔Restore rejoué au SHA `c1930ab`~~ | **FERMÉ 2026-09-04** — `application_acl_drift = 0` (6 294 lignes normalisées, 0 diff), preuve §13.4 | — |
| P0-5 | **Fenêtre de maintenance décidée + responsable de rollback désigné et joignable** (P12/P13) | à confirmer | Julien |

### Blockers P1 (à traiter, non bloquants pour figer la date)

| # | Blocker | État |
|---|---|---|
| P1-1 | 4 `STRIPE_PRICE_*_ANNUEL` encore ×12 en environnement → `verify:stripe-prices --strict` non 8/8 (lot `ELSATIA-STRIPE-TEST-ANNUAL-ENV-ALIGNMENT-V1`) | ouvert |
| P1-2 | Ancienne Price Enterprise mensuelle dupliquée sans lookup key côté Stripe TEST (laissée intacte, sélection fail-closed) | observé |
| P1-3 | Protection de branche GitHub `main` + épinglage Vercel « Production Branch ≠ main » à re-vérifier (`NE_PAS_DEPLOYER_MAIN.md`) | à vérifier |
| P1-4 | HTTP 500 Preview (P0 historique **du projet Preview**, sans causalité migration prouvée) — n'affecte pas Production mais doit être tranché avant d'utiliser Preview comme miroir de validation | ouvert |

### Éléments externes non techniques

- Régime fiscal / TVA validé par l'expert-comptable (prérequis commercial).
- Immatriculation micro-entreprise / mentions légales à jour (`P14_*`, `PREPARATION_JURIDIQUE.md`).
- Décision INPI « marque déposée » et calendrier de commercialisation phasée.
- Refonte visuelle ELSATIA-UI-V2 (lot obligatoire avant commercialisation, non démarré) —
  n'empêche pas le **cutover technique** mais conditionne l'**ouverture commerciale**.
- Communication aux admins plateforme du challenge MFA au premier accès post-cutover.

### Fenêtre de maintenance estimée

- Sauvegardes (T-30) : ~30–45 min.
- Migrations (T0) : 50–51 migrations append-only, essentiellement DDL + RPC + backfill R1 borné →
  ~10–25 min selon volume `entreprises`.
- Déploiement + contrôles (T+15 → T+30) : ~30–45 min.
- **Fenêtre totale conseillée : 2 h**, dont ~45 min de service potentiellement dégradé/fermé,
  marge de rollback incluse.

### Verdict

**NOT READY** au sens « exécutable maintenant » : **P0-1, P0-3, P0-5 restent ouverts**
(relecture Production live, sauvegardes datées du cutover réel, fenêtre + responsable désigné).
**P0-2 et P0-4 sont fermés** (2026-09-04, preuves §13) : le drill Fresh 261 / Restore→261 /
rollback / drift ACL au bon SHA (`c1930ab`) est fait et vert, rejoué sur le schéma historique
exact de `fcdd4e7c` (211 migrations, commit git de référence Production selon le runbook V1) —
mais **sans lire la Production réelle** : le ledger live et ses éventuelles données de production
restent à confirmer au P0-1. La **cible technique est prête et figée** : SHA `c1930ab`, ledger
261, 50 migrations additives ordonnées depuis `fcdd4e7c`, aucune migration historique modifiée,
runbook et rollback définis, socle commercial + correctif boucle post-login validés en local
**et** via un upgrade réel 211→261 rejoué sur ce schéma historique.

---

## 12. Rappels d'interdiction (ce lot)

- Aucun déploiement Production. Aucune migration Production. Aucune mutation Stripe Live.
- Aucun secret affiché (noms de variables uniquement).
- Aucune modification des migrations 256–263 ni de la migration 255.
- Aucun réélargissement d'ACL `service_role`.

---

## 13. Preuves d'exécution — drill offline P0-2 / P0-4 (2026-09-04)

Lot `ELSATIA-CUTOVER-OFFLINE-P0-CLOSURE-V1`. **Aucune Supabase/Vercel Production, aucun Stripe
Live, aucune migration 255–263 modifiée.** Toutes les preuves ci-dessous sont locales, sur des
projets Supabase dédiés au drill (containers Docker isolés), jetables, nettoyés en fin de lot.

### 13.0 Méthode et limite assumée

Aucun accès Production dans ce lot (cf. §1). Le drill ne rejoue donc pas le **dump chiffré réel**
de Production (volume DR non déverrouillé ici), mais reconstruit un état « ancien Production »
**représentatif et vérifiable** : les **211 fichiers de migration exacts** présents au commit
`fcdd4e7c90f32abb15502e825335659f9d57c9a1` (SHA Production de référence, runbook V1) sont
rejoués tels quels sur une pile Supabase locale dédiée neuve (images/managed schemas
authentiques, pas de bricolage de schéma). Cette approche est cohérente avec la méthode déjà
documentée par `ELSATIA_PREPROD_DB_E2E_ROLLBACK_V1.md` (« reconstruits depuis les ledgers et
objets observés, pas depuis une restauration physique distante ») — avec un jeu de migrations
**exact** ici (fichiers git réels), pas une reconstruction approximative.

Confirmé au préalable (`git diff --name-status fcdd4e7c c1930ab -- supabase/migrations/`) :
**50 fichiers ajoutés, 0 modifié** → le gap est purement additif, et est la même liste que le §2.

### 13.1 A. Fresh 261

- Pile : projet Supabase local `btp-platform` (existant), `supabase db reset --local` au SHA
  `c1930ab`+docs (`6be33d4`, sans effet sur les migrations).
- Résultat : 261 migrations appliquées dans l'ordre, 0 erreur, ~38 s.
- Ledger : `count=261`, `max=20260904000263`.
- Sondes objets : colonne capacité R1 présente ; `modules_gestion_pro`/`modules_entreprises`
  présentes, **19** modules seedés ; RPC R2 (`synchroniser_capacite_stripe_service`,
  `annuler_baisse_capacite_planifiee`, `capacite_stripe_finaliser_op_convergente`) présentes ;
  RPC webhook (`synchroniser_abonnement_stripe_service`, `reserver_evenement_abonnement_service`)
  présentes ; RPC lifecycle (`lier_subscription_entreprise_service`,
  `calculer_depassement_appareils_service`) présentes ; `plateforme_admins` et
  `est_plateforme_admin()` présents ; `service_role` **sans** INSERT/UPDATE/DELETE sur
  `abonnement_evenements` (effet ACL 255 vérifié) ; plans tarifaires : 5 actifs, 0 incohérent.
- pgTAP (`supabase test db --local`) : **Files=53, Tests=1133 — PASS** (couvre R1/R2/R3,
  webhook ACL, lifecycle closure, MFA/AAL2, isolation multitenant, tarification).

### 13.2 B. Restore → 261

- Pile dédiée neuve : projet `elsatia-drill-v1`, ports 573xx, images Supabase locales identiques
  (même `config.toml` que `btp-platform`, project_id et ports seuls changés) — managed schemas
  (`auth`, `storage`, `extensions`, `graphql`, `realtime`, `vault`, `supabase_functions`)
  authentiques, pas reconstruits à la main.
- **Ancien état** : les 211 fichiers de migration exacts de `fcdd4e7c` appliqués via
  `supabase start` → ledger `count=211`, `max=20260825000233` (identique à `fcdd4e7c`).
- **Sentinelles synthétiques représentatives** insérées (1 utilisateur Auth, 1 entreprise
  offre `business` statut `actif`, 1 poste + permissions + rattachement, 1 client, 1 chantier
  budget `12345.67`, 1 devis TTC `1200.00`, 1 facture TTC `1200.00`) — même structure de preuve
  que les 7 sentinelles de `ELSATIA_PREPROD_DB_E2E_ROLLBACK_V1`.
- **T0-snapshot** : `pg_dump -Fc --compress=9` → `drill_211_snapshot.dump`, **2 025 167 octets**,
  SHA-256 `5e6df7532eb07620b16f662f7f479e5f2ab13e468a99d866a1112f11ea5f7adb` (conservé localement
  pour la durée du lot, supprimé avec le reste du drill).
- **Migrations manquantes → 261** : les 50 fichiers du §2 copiés dans le répertoire de
  migrations, puis `supabase migration up --local --include-all` (le flag `--include-all` est
  requis, exactement comme documenté par `migration-canonicalization-v2.md`, car plusieurs
  fichiers portent un horodatage antérieur au max déjà appliqué). **50/50 appliquées, 0 erreur,
  ~2,2 s**, dans l'ordre lexical exact du §2.
- **Vérifications post-upgrade** :
  - ledger `count=261`, `max=20260904000263` ;
  - **sentinelles identiques** avant/après (diff nul sur entreprise/offre/statut/client/budget
    chantier/montants devis-facture/rattachement utilisateur) ;
  - mêmes sondes objets qu'en 13.1, **toutes identiques** (R1/R2/R3, webhook, lifecycle, MFA,
    ACL 255, 5 plans actifs / 0 incohérent) ;
  - pgTAP (`supabase test db --db-url … 57322 …`) : **Files=53, Tests=1133 — PASS**, résultat
    strictement identique au Fresh.

### 13.3 C. Rollback drill — 211 → 261 → 211

- Restauration du **même** dump T0 (`drill_211_snapshot.dump`) dans une base probe jetable
  (`rollback_probe`, `template0`) du même cluster de drill — jamais Preview/Production, jamais
  la base de travail elle-même (méthodologie identique à `elsatia_preprod_rollback_probe` de
  `ELSATIA_PREPROD_DB_E2E_ROLLBACK_V1`).
- **Aucune down migration** : restauration pure via `pg_restore`, conformément à la stratégie B
  du runbook (jamais d'inversion SQL improvisée des `REVOKE` de `…000255`).
- Résultat : `pg_restore` termine avec **148 erreurs ignorées**, **toutes** confinées à la
  plomberie de rôles/propriétaires **gérée par Supabase** propre à une base secondaire créée
  dans un cluster déjà démarré (`SET ROLE supabase_auth_admin/storage_admin/realtime_admin/
  admin/pgbouncer`, default privileges sur le schéma `supabase_functions`,
  `realtime.list_changes`, `vault.secrets`, `pg_stat_statements_reset`, `pg_reload_conf`) —
  **zéro erreur sur un objet applicatif** (`public`/`storage`/`colors`/`tools`). Cette limitation
  est déjà documentée comme anomalie de harness connue par
  `ELSATIA_PREPROD_DB_E2E_ROLLBACK_V1.md` §10 (« la suite pgTAP complète ne doit pas être
  relancée dans une base secondaire ») — constat identique, pas une régression nouvelle.
- **Preuve retenue** (niveau structurel/donnée, la cible de ce drill) :
  - ledger revenu à `count=211`, `max=20260825000233` — **identique à l'état pré-upgrade** ;
  - sentinelles **byte-identiques** à la capture pré-upgrade (diff nul, ledger exclu) ;
  - **149 tables `public`**, toutes RLS **activées**, **443 policies** restaurées — cohérent
    avec l'état pré-`…255` (ACL/RLS antérieures, pas les 1 220 REVOKE de la migration 255) ;
  - conséquence : le frontend ancien (`fcdd4e7c`) est **théoriquement compatible** avec cet état
    DB restauré, par construction (ACL et schéma strictement antérieurs à `…000255`).

### 13.4 P0-4 — Drift ACL applicatif Fresh 261 ↔ Restore → 261

Inventaire normalisé produit sur les **deux** bases (13.1 et 13.2 post-upgrade), pour les rôles
`anon`, `authenticated`, `service_role`, `authenticator` (+ motif `elsatia_*`), sur les schémas
`public`, `storage`, `colors`, `tools` (+ `auth`, `stripe_attestation` pour les privilèges de
table) :

| Catégorie | Lignes (Fresh = Restore) |
|---|---:|
| Privilèges de table (`role_table_grants`) | 355 |
| Privilèges de colonne (`role_column_grants`) | 4 754 |
| Privilèges de séquence | 10 |
| `EXECUTE` sur fonctions/RPC | 272 |
| `ALTER DEFAULT PRIVILEGES` | 187 |
| État RLS (`relrowsecurity`/`relforcerowsecurity`) | 191 |
| Policies (`pg_policies`) | 522 |
| Appartenance de rôle | 3 |
| **Total normalisé** | **6 294** |

`diff <(sort fresh_acl.txt) <(sort restore_acl.txt)` → **0 ligne de différence**.

**`application_acl_drift = 0`.** Aucune distinction système/applicatif/exploitable n'a été
nécessaire ici : l'inventaire est **scopé aux schémas et rôles applicatifs** dès le départ (les
schémas gérés par Supabase — `auth` en interne, `_realtime`, `graphql`, `vault`,
`supabase_functions`, `pgsodium`, `pg_catalog` — sont hors périmètre par construction, car
identiques par construction entre les deux piles : mêmes images Supabase locales pinnées par
`config.toml`, aucune migration canonique ne les modifiant). Toute différence système déjà
observée par ailleurs reste couverte par l'allowlist figée de
`elsatia-supabase-system-drift-audit-v1.md` (532 écarts système managés, classés, sans droit
`anon`/`authenticated`/`service_role`/`authenticator` en trop) — non remise en cause ici.

### 13.5 Tests finaux (SHA `c1930ab` + docs `6be33d4`)

| Contrôle | Résultat |
|---|---:|
| `verify:migrations` | PASS — 261 migrations valides, noms/horodatages uniques |
| pgTAP Fresh 261 | **53 fichiers / 1133 tests — PASS** |
| pgTAP Restore→261 | **53 fichiers / 1133 tests — PASS** (identique) |
| GP Vitest | **92 fichiers / 791 tests — PASS** |
| Tools Vitest | **20 fichiers / 107 tests — PASS** |
| Typecheck (GP + Tools) | PASS |
| ESLint (GP + Tools) | PASS — 0 erreur, 3 avertissements `<img>` préexistants |
| Build (GP + Tools) | PASS |
| `verify:secrets` | PASS — 1 297 fichiers suivis, aucun secret reconnu |
| `npm audit` (racine + Tools) | 0 vulnérabilité (les deux) |
| `git diff --check` | PASS |

R1/R2/R3, ACL webhook abonnement, clôture lifecycle et MFA/AAL2 sont couverts par la suite
pgTAP ci-dessus (fichiers `active_person_capacity_*`, `capacity_stripe_r2_*`,
`modules_a_la_carte_r3_*`, `stripe_subscription_webhook_acl_v1`,
`stripe_subscription_lifecycle_closure_v1`, `platform_aal2_role_integrity_v1` et suites MFA
associées) — tous verts sur les deux bases (13.1 et 13.2).

### 13.6 Nettoyage

Pile de drill `elsatia-drill-v1` arrêtée (`supabase stop`) puis ses volumes Docker supprimés ;
base probe `rollback_probe` conservée le temps de la vérification puis supprimée avec la pile ;
dump et fichiers d'inventaire ACL restés strictement locaux (répertoire de travail temporaire de
la session), non committés. Pile `btp-platform` (Fresh 261) et les autres piles préexistantes non
concernées par ce lot n'ont pas été touchées.

### 13.7 Verdict du drill

```text
P0-2 (Fresh/Restore/rollback au SHA c1930ab) : FERMÉ
P0-4 (drift ACL applicatif Fresh↔Restore)     : FERMÉ — application_acl_drift = 0
```

---

*Fin — `ELSATIA-PRODUCTION-CUTOVER-PREFLIGHT-FINAL-V1`. Ce document ne vaut pas autorisation de
cutover ; il fige la cible et la checklist. L'exécution reste humaine et explicitement autorisée.*
