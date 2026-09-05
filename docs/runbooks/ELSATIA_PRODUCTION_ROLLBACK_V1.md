# Runbook — Go-live et rollback Production ELSATIA

Version 2 — 2026-09-05 (**rebasage sur la cible cutover réelle**, lot
`ELSATIA-GP-CUTOVER-RUNBOOK-AND-QA-REBASE-V1`). **Documentation opérateur.** Ce document décrit
une procédure ; il n'exécute rien et ne crée aucun snapshot Production.

> **Rebasage 253 → 263.** La version 1 (2026-09-02) visait `ac7bf05` / ledger 253 / gap 42 depuis
> une baseline supposée de 211. Ces valeurs sont **obsolètes** et remplacées partout dans ce
> document par la cible réelle ci-dessous. Les mentions de `ac7bf05` / 253 / 211 / gap 42 qui
> subsistent sont **exclusivement historiques** et explicitement étiquetées comme telles.

## Cible et baseline en vigueur (V2)

| Élément | Valeur en vigueur |
|---|---|
| **Code cible** | **`996be15c136f09d9977375e700462b503a1720c3`** (HEAD de `feat/elsatia-commercial-canonical-r1-r2-r3-v1`) |
| **Chemin de déploiement** | promotion de `996be15` dans **`release/commercialisation-v1`**, puis déploiement de cette release. Production Branch Vercel = `release/commercialisation-v1`, **inchangée** |
| **Ledger cible** | **263** (dernière `…000265`) |
| **Baseline DB Production réelle** | **210** (dernière `…000231`) — à reconfirmer en direct au P0-1 |
| **Gap de migration** | **53** migrations, purement additives (append-only) |
| **Frontend Production actuel (cible de rollback code)** | `release/commercialisation-v1` @ **`fcdd4e7c90f32abb15502e825335659f9d57c9a1`** |
| **Point de non-retour** | application de **`20260902000255_acl_reconciliation_v1.sql`** (§0, §6) |

**Traçabilité des preuves — attribution exacte :**
- **Drill DB 263** (Fresh 263 + pgTAP 54 fichiers/1154 tests, Restore 210→263 + pgTAP 54/1154,
  rollback `210 → 263 → 210` sur snapshot, drift ACL applicatif = 0) : **exécuté au SHA
  `a81f317`**, 2026-09-05 — `ELSATIA_PRODUCTION_CUTOVER_PREFLIGHT_FINAL_V1.md` §13.1–§13.4.
  Opposable pour `996be15` : l'arbre `supabase/migrations/` y est identique au bit près.
- **QA applicative** (Vitest GP 93/815, Tools 20/107, typecheck, ESLint, build, `verify:migrations`
  263, `verify:secrets` 1 304, `npm audit` 0/0) : **rejouée au SHA cible `996be15`**, 2026-09-05 —
  préflight §13.5.
- **Historique (ne plus utiliser comme cible)** : preuve BDD/E2E de la cible 253 (Fresh 253 +
  pgTAP 870/870, E2E 40/40, Stripe TEST 8/8, rollback local 210→253→210) = commit
  **`a354d13233fd865b8cb6c735ca56c3dd0de00eca`**, `docs/audits/ELSATIA_PREPROD_DB_E2E_ROLLBACK_V1.md`
  (CODEX, lot `ELSATIA-PREPROD-DB-E2E-ROLLBACK-V1`) ; rédaction initiale de ce runbook = commit
  **`a3aad60eea25bad2b123c9141dc86d00183a4c55`** (lot `ELSATIA-PRODUCTION-ROLLBACK-RUNBOOK-V1`).
  L'ancienne cible pré-production `feat/tarification-on-canonical-preprod-v1` @ `ac7bf05` /
  ledger 253 est **abandonnée**.

---

## 0. Principe central

> **UN ROLLBACK VERCEL SEUL N'EST PAS SUFFISANT APRÈS APPLICATION DES MIGRATIONS ACL/MFA.**

Le déploiement `fcdd4e7c → 996be15` applique **53 migrations** (ledger **210 → 263**), dont la
migration `20260902000255_acl_reconciliation_v1.sql` : **1 220 `REVOKE` ciblés + 14
`ALTER DEFAULT PRIVILEGES … REVOKE`**, plus les migrations MFA/AAL2 (`…237`,
`…251_platform_lister_admins_statut_identite`, `…250_platform_promotion_aal2_hardening`) et
d'attestation Stripe Ed25519 (`…244`, `…245`).

Conséquence : après migration, **l'ancien binaire applicatif (`fcdd4e7c`) n'est plus garanti
compatible** avec la base :

- des privilèges DB historiques de `authenticated` / `service_role` ont été retirés ;
- des RPC de remise legacy sont révoquées (`…000242_revoke_legacy_discount_rpcs_v1`) ;
- `est_plateforme_admin()` est devenue UID-based + AAL2 ; l'ancien code peut échouer fermé ;
- le schéma comporte des tables/fonctions absentes de `fcdd4e7c`.

Un `Rollback to this deployment` dans Vercel **ne restaure pas** la base. Le rollback complet
doit couvrir : **application + DB + migrations + Auth/MFA + ACL + Storage + Stripe**.

---

## 1. Prérequis obligatoires avant migration Production

| # | Prérequis | État attendu | Qui |
|---|---|---|---|
| P1 | **Snapshot / PITR Production** daté, identifiable, restaurable, rétention ≥ fenêtre de déploiement | créé et vérifié à T-30 | Codex/opérateur + Supabase |
| P2 | **Dump PostgreSQL logique chiffré** (format custom, gzip) + SHA-256 vérifié, sur le volume DR chiffré | présent, checksum PASS | Codex |
| P3 | **Backup Storage chiffré** (13 buckets) + manifeste + SHA-256 par objet | présent, `verify-storage-backup` PASS | Codex |
| P4 | **Manifestes + checksums** DB et Storage reliés au même `backup_id` (horodatage UTC commun) | cohérents | Codex |
| P5 | **Ledger migrations** capturé avant (attendu **210**, dernière `…000231` — noter la valeur observée, ne pas supposer) | archivé | Codex |
| P6 | **État ACL** capturé avant (inventaire `aclexplode` + policies) | archivé | Codex |
| P7 | **Inventaire des admins plateforme** : email, `utilisateur_id`, rôle, `actif`, `statut_identite` | archivé — 2 admins `total` actifs attendus | Codex |
| P8 | **État MFA des admins** : facteurs TOTP enrôlés / vérifiés, moyens de récupération | archivé | Julien + Codex |
| P9 | **Fiche variables Vercel** (nom / environnement / présence / état attendu — **jamais** les valeurs) | à jour, cf. § 12 | opérateur |
| P10 | **Branche + SHA Production actuels** notés (`release/commercialisation-v1` / `fcdd4e7c`) | notés | opérateur |
| P11 | **Configuration Stripe** : `STRIPE_WEBHOOK_EXPECTED_MODE`, mode des Prices câblés, `ABONNEMENTS_PUBLICS_OUVERTS` | TEST partout, `false` | opérateur |
| P12 | **Fenêtre de maintenance** décidée et communiquée | planifiée | Julien |
| P13 | **Responsable de rollback** désigné et joignable pendant toute la fenêtre | désigné | Julien |
| P14 | Preuves Codex `ELSATIA-PREPROD-DB-E2E-ROLLBACK-V1` **vertes** (Fresh pgTAP, Restore pgTAP, drift ACL 0, E2E MFA/multitenant/Stripe) | VALIDÉ | Codex |

**Aucune migration Production ne démarre si un seul de P1–P14 n'est pas satisfait.**

---

## 2. Snapshot / PITR — validation

Un point de restauration n'est considéré **valide** que si les trois conditions sont réunies :

1. **Identifiable** : identifiant + horodatage UTC notés, reliés au `backup_id` du déploiement.
2. **Restaurable** : la restauration est techniquement possible sur le plan Supabase du projet
   Production (PITR activé, ou snapshot managé disponible) — vérifié, pas supposé.
3. **Rétention** : couvre la fenêtre complète de déploiement + une marge (≥ 24 h après T0).

> Ce lot **ne crée pas** de snapshot Production. Le snapshot est un prérequis d'exécution Codex.

---

## 3. Backup DB — ordre (acquis réutilisés, ne pas relancer)

Acquis documentés : **backup PostgreSQL : GO · restore chiffré : GO · fidélité DB : GO**
(lots ELSATIA-*-DR). Ordre de référence :

```
dump pg_dump (format custom, --compress=9)
  → SHA-256 du dump
  → écriture directe sur le volume DR chiffré (jamais de fichier en clair hors volume)
  → vérification SHA-256 relue
  → manifeste (taille, SHA-256, TOC count, backup_id)
  → conservation (rétention 7 quotidiens / 4 hebdo / 12 mensuels)
```

---

## 4. Backup Storage — ordre de restauration (après DB)

Acquis : **Storage DR : GO · 13 buckets · 12 privés / 1 public (`entreprise-assets`) ·
checksums + isolation tenant validés**. Restauration **après** la DB :

```
restore DB (§ 7)
  → application des migrations → buckets + policies recréés depuis les migrations canoniques
  → restore-storage-dr : upload objet par objet, fail-closed sur collision de checksum
  → vérification : chaque référence DB (*_storage_path) retrouve son objet
  → contrôle public/privé : aucun bucket privé rendu public
  → contrôle isolation : préfixe entreprise_id conservé (storage.foldername(name)[1])
```

---

## 5. Rollback DB — trois stratégies

### A — Forward-fix (à privilégier)
Conditions : migration DB appliquée avec succès, **données intactes**, incident applicatif
mineur, correctif rapide disponible et testé.
Action : déployer un correctif applicatif (nouveau SHA) sans toucher la base.

### B — Restauration snapshot / PITR
Conditions : migration destructrice ou incohérente, corruption, ou état ACL non récupérable
proprement par forward-fix.
Action : restaurer le snapshot/PITR pris à T-30 **et** redéployer l'application `fcdd4e7c`
(rollback **coordonné** app + DB). Toute écriture Production entre le snapshot et l'incident
est perdue — d'où la fenêtre de maintenance / freeze.

### C — Bundle d'urgence de compatibilité
Conditions : uniquement si **préparé et validé à l'avance** — un jeu de `GRANT` ciblés
restaurant temporairement la compatibilité de RPC/ACL historiques pour que `fcdd4e7c` refonctionne
sans restore complet.
Action : appliquer ce bundle **uniquement** s'il a été écrit, revu et testé avant le go-live.
**Ne jamais improviser un `GRANT`/`REVOKE` permissif en Production sous pression.**

> Pas de « down migration » automatique pour les REVOKE/ACL complexes de `…000255` : leur
> inversion fiable passe par le snapshot (B) ou un bundle préparé (C).

---

## 6. Rollback ACL — risques particuliers

- `…000255_acl_reconciliation_v1.sql` : **1 220 `REVOKE`** ciblés + **14** `ALTER DEFAULT
  PRIVILEGES … REVOKE`.
- `…000242_revoke_legacy_discount_rpcs_v1.sql` : RPC de remise legacy révoquées.
- Migrations `platform_*` : `est_plateforme_admin()` UID-based, `plateforme_admins`
  `statut_identite`, `FORCE ROW LEVEL SECURITY`.

**Équation à retenir :** `ancien frontend (fcdd4e7c) + nouvelle DB ACL ≠ garantie de
fonctionnement`. Le rollback **code seul est insuffisant** dès que `…000255` est appliquée :
soit rollback DB coordonné (stratégie B), soit bundle d'urgence préparé (stratégie C).

---

## 7. Rollback Auth / MFA

Distinguer trois choses :

| Niveau | Contenu | Rollback |
|---|---|---|
| **Application** | guards `exigerAal2Plateforme`, pages `/mfa/*`, routes `api/auth/mfa/*` | rollback code (redéploiement `fcdd4e7c`) → les guards AAL2 disparaissent, l'accès `/plateforme` redevient AAL1 |
| **Auth (données)** | `auth.mfa_factors`, `auth.sessions`, `auth.identities` | **ne pas** modifier au SQL manuellement ; suivre le restore snapshot (stratégie B) si nécessaire |
| **Récupération admin** | 2 admins `total` actifs (`julien@elsatia.fr` + le compte technique `plateforme@invalid.local`, non connectable) | voir ci-dessous |

Procédure de récupération admin (contrôlée) :

1. Vérifier qu'au moins **un** admin `total` actif conserve un accès (facteur TOTP fonctionnel
   **ou** moyen de récupération e-mail Supabase Auth valide).
2. Si l'unique admin humain (`julien@elsatia.fr`) perd son facteur : reset de facteur via le
   **flux Supabase Auth de récupération** (e-mail), puis ré-enrôlement TOTP. **Jamais** de
   `DELETE FROM auth.mfa_factors` manuel comme procédure normale.
3. Ne **jamais** demander la seed TOTP, le QR ou un code à l'opérateur central / à un outil.
4. Le compte `plateforme@invalid.local` n'est **pas** un chemin de récupération (aucune
   identité `auth.identities`, non connectable) — c'est un résidu de fixture, pas un secours.

---

## 8. Sessions existantes

- Avant déploiement, les admins plateforme ont des sessions **AAL1**.
- Après déploiement, `exigerAal2Plateforme` exige **AAL2** → ces sessions sont **re-challengées**
  (comportement voulu, pas un bug).
- **Une session existante n'est jamais une preuve d'AAL2.** Le contrôle GO (§ 12) exige un
  login + challenge MFA réels effectués après le déploiement.
- Communication : prévenir les admins plateforme qu'un challenge MFA leur sera demandé au
  premier accès `/plateforme` post-déploiement.

---

## 9. Rollback Stripe

Séparer strictement **deux axes** :

### Recette actuelle
La Production app est **volontairement branchée sur Stripe TEST** pendant la recette. Aucun
objet Live n'existe (aucune clé `sk_live_`, aucun Price Live).

### Futur passage Live (hors de ce runbook — lot P15)
Un rollback Stripe distingue : **code** ↔ **Price IDs** (variables `STRIPE_PRICE_*`) ↔
**webhooks** (endpoint + secret) ↔ **`STRIPE_WEBHOOK_EXPECTED_MODE`** ↔ **clés**.
Ne **jamais** confondre « rollback code » et « bascule TEST/LIVE » : ce sont deux opérations
indépendantes, chacune réversible séparément.

Pendant tout ce déploiement pré-production : **aucun Stripe Live modifié**, `ABONNEMENTS_PUBLICS_OUVERTS`
reste `false`, mode webhook reste `test`.

---

## 10. Fiche d'état des variables Vercel (avant go-live)

**Noms, environnement, présence et état attendu uniquement — aucune valeur secrète.**

> ⚠ **Type Vercel `sensitive` — l'« état attendu » de ce tableau n'est pas vérifiable par lecture.**
> Sur `elsatia-production`, 27 des 46 variables sont de type `sensitive` : leur valeur est
> irrécupérable, y compris via `vercel env pull` (préflight §5.0). Pour ces lignes, la colonne
> « État attendu » énonce **la cible voulue, pas un constat**. Ne jamais cocher sur la foi d'une
> lecture de valeur, ne jamais afficher un secret pour contrôler.

| Variable | Environnement | Présence attendue | État attendu |
|---|---|---|---|
| `STRIPE_WEBHOOK_EXPECTED_MODE` | Production, Preview | présente | `test` — **valeur lisible, vérifiée** |
| `STRIPE_SECRET_KEY` | Production, Preview | présente | clé **Test** attendue — **mode NON lisible** (`sensitive`), confirmé par smoke contrôlé (préflight §23), jamais par affichage |
| `STRIPE_WEBHOOK_ABONNEMENT_SECRET` | Production, Preview | présente | secret du webhook **Test** — non affiché |
| `STRIPE_PRICE_{MINI,PRO,BUSINESS,ENTREPRISE}_MENSUEL` | Production, Preview | présentes | `price_1Tzi6A0…/6j0…/6u0…/710…` (7 900 / 24 900 / 44 900 / 59 900) |
| `STRIPE_PRICE_{MINI,PRO,BUSINESS,ENTREPRISE}_ANNUEL` | Production, Preview | présentes | **cible** : `price_1UBJ9l0…/9m0…FjSr/9m0…TxUD/9n0…` (79 000 / 249 000 / 449 000 / 599 000). **Écart connu** : encore les Prices ×12 → lot CODEX `ELSATIA-STRIPE-TEST-ANNUAL-ENV-ALIGNMENT-V1` |
| `STRIPE_STATE_ATTESTATION_KEY_ID` | Production, Preview | **ABSENTE sur Production** (constaté 2026-09-05) — **à provisionner pendant la fenêtre** | identifiant de clé — non secret. **P0 pendant fenêtre, item A** (préflight §5.4/§11) |
| `STRIPE_STATE_ATTESTATION_PRIVATE_KEY_B64` | Production, Preview | **ABSENTE sur Production** (constaté 2026-09-05) — **à provisionner pendant la fenêtre** | clé privée Ed25519 base64 — **Vercel uniquement**, jamais dans une doc/dump. **P0 pendant fenêtre, item A** |
| `ABONNEMENTS_PUBLICS_OUVERTS` | Production, Preview | présente | `false` — **valeur lisible, vérifiée** |
| `FEATURE_AI_ENABLED`, `FEATURE_AI_DEVIS_ENABLED`, `FEATURE_RELANCES_AUTO_ENABLED` | Production | présentes | `false` attendu — **valeurs NON lisibles** (`sensitive`) : à **réaffirmer explicitement** pendant la fenêtre, jamais à « vérifier ». **P0 pendant fenêtre, item B** |
| `NEXT_PUBLIC_APP_URL` | Production | présente | `https://app.elsatia.fr` — **valeur lisible, vérifiée** |
| `SUPPORT_EMAIL` | Production | présente | `support@elsatia.fr` attendu — **valeur NON lisible** (`sensitive`) ; sinon les pages légales rendent « — » |
| `SUPABASE_PROJECT_REF`, `ELSATIA_SUPABASE_PROJECT_NAME` | Production | présentes | `exhvuzegsefmoguxoiak` / `elsatia-production` — **valeurs lisibles, vérifiées**. Variables d'**ops** (scripts et gardes), **pas** des clés applicatives (préflight §5.2) |
| `NEXT_PUBLIC_LEGAL_SIRET` | Production, Preview | **présente sur Production** (provisionnée 2026-09-05) | `850 559 873 00011` — **valeur lisible, vérifiée conforme** |
| `NEXT_PUBLIC_LEGAL_TVA` | Production, Preview | **absente — laisser vide** | régime de TVA **non confirmé** — ne rien inventer ; absente/vide → repli neutre « à confirmer » dans les mentions légales et les CGV |
| `NEXT_PUBLIC_SUPABASE_URL` | Production | présente | hôte du projet Production — **valeur lisible, vérifiée** |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Production | présente | **seule** clé publique Supabase lue par l'app, qui **jette** sans elle. **`NEXT_PUBLIC_SUPABASE_ANON_KEY` n'est pas consommée** au SHA `996be15` — ne pas la chercher ni la créer |
| `SUPABASE_SERVICE_ROLE_KEY` | Production | présente | non affichée (`sensitive`) |

Contrôle : `npm run verify:stripe-prices --strict` doit passer **8/8** dans un environnement
portant réellement ces variables (après repointage des 4 `_ANNUEL`). Les `STRIPE_PRICE_*` étant de
type `sensitive`, **cet écart n'est pas vérifiable par lecture** : seule l'exécution du script dans
un environnement qui les porte peut le trancher.

---

## 11. Attestation Ed25519 (Stripe state proof)

- **Clé privée** (`STRIPE_STATE_ATTESTATION_PRIVATE_KEY_B64`) : **Vercel uniquement**. Jamais
  dans un document, un dump, un ticket, un log.
- **Clé publique** : en base (schéma `stripe_attestation`) — sert à la vérification.
- **`key_id`** : identifiant non secret, doit correspondre entre Vercel et la base.
- **Fail-closed** : si la registry de clés publiques est absente / incohérente, la vérification
  d'attestation échoue **fermé** (aucune remise « présumée absente »).
- **Rollback** : en cas de rotation ou de rollback, ne jamais recopier la clé privée hors
  Vercel. Un mismatch `key_id` se corrige côté Vercel + migration de clé publique, pas par
  extraction de secret.

---

## 12. Runbook GO-LIVE (séquence opérateur — durées **indicatives**)

> Les jalons T-x / T+x sont des repères d'ordre, pas des engagements de durée.

### T-60 — Préparation
- [ ] Gel des changements (aucun merge, aucun déploiement concurrent).
- [ ] Vérifier SHA cible (`996be15`) promu dans `release/commercialisation-v1`, et SHA Production actuel (`fcdd4e7c`).
- [ ] Vérifier l'accès aux mécanismes de rollback (Vercel, snapshot/PITR, volume DR chiffré monté).
- [ ] Vérifier les preuves Codec `ELSATIA-PREPROD-DB-E2E-ROLLBACK-V1` (toutes vertes).
- [ ] Responsable de rollback (P13) confirmé et joignable.

### T-30 — Sauvegardes
- [ ] Snapshot / PITR Production (P1) — identifiant + horodatage notés.
- [ ] Dump DB chiffré + SHA-256 vérifié (P2).
- [ ] Backup Storage chiffré + manifeste + checksums (P3).
- [ ] Capture ledger migrations (**210** attendu), état ACL, inventaire admins/MFA (P5–P8).
- [ ] Vérifier les manifestes et le `backup_id` commun.

### T0 — Migration
- [ ] Fenêtre de maintenance activée si retenue (P12).
- [ ] Appliquer les **53 migrations (210 → 263)** dans l'ordre lexical, via la CLI Supabase officielle.
- [ ] Vérifier le ledger final : **263** migrations, `…000255` **et** `…000265` présentes, aucune collision ; 2ᵉ `migration up` → `applied: []`.
- [ ] pgTAP Production ciblé + smoke SQL (sentinelles Auth / Storage / entreprises / devis /
      factures inchangées).
- [ ] **Point de décision migration** : ledger + pgTAP OK → continuer ; sinon → scénario T0 (§ 13).

### T+15 — Déploiement application + vérifications
- [ ] Promouvoir `996be15` dans `release/commercialisation-v1`, puis déployer cette release
      (Production Branch Vercel inchangée, **pas** `main`, **pas** la branche `feat/…`).
- [ ] Tests **Auth / MFA** : login admin, challenge TOTP, AAL2, accès `/plateforme`, logout/relogin.
- [ ] Tests **admin / rôle** : non authentifié → refus ; AAL1 → MFA ; AAL2 non-admin → refus ;
      AAL2 admin inactif → refus ; AAL2 admin `total` actif → autorisé.
- [ ] Tests **multitenant** : entreprise A ne voit rien de B (tables, RPC, documents, Storage,
      habilitations apps, changement d'entreprise).
- [ ] Tests **Stripe TEST** : `verify:stripe-prices --strict` 8/8 ; 8 parcours checkout Test
      (79/790, 249/2 490, 449/4 490, 599/5 990) sans paiement réel ; webhook `expected_mode`
      = `test` ; idempotence ; entreprise inconnue → erreur contrôlée ; aucun log sensible.
- [ ] Tests **Storage** : upload/download privé, URL signée, aucun bucket privé devenu public,
      isolation A↔B.

### T+30 — Décision
- [ ] Tous les contrôles § 14 (GO) verts → **ouvrir le service** (retirer la maintenance).
- [ ] Un seul critère § 15 (NO-GO) → **rollback** selon § 13.

### T+30 → T+7j — Surveillance (§ 16).

---

## 13. Runbook ROLLBACK — scénarios T0 à T4

| Scénario | Symptôme | Seuil de décision | Action | Responsable | Preuve de retour à la normale |
|---|---|---|---|---|---|
| **T0 — Migration échoue** | erreur SQL, ledger partiel, migration interrompue | toute migration non appliquée proprement | **STOP** — ne pas déployer l'app. Si l'état DB est incohérent : **restaurer le snapshot/PITR** (stratégie B). Sinon corriger la migration hors Production et recommencer. | opérateur + Codex | ledger = **210** restauré **ou** **263** propre ; pgTAP PASS ; sentinelles inchangées |
| **T1 — Migration OK, application KO** | build/déploiement échoue, 5xx généralisés, page blanche | app indisponible > seuil (ex. 10 min) et pas de correctif immédiat | Décider **forward-fix** (A) si bug mineur identifié, sinon **rollback coordonné** : restaurer le snapshot/PITR pris à T-30 (retour ledger 210) **+** redéployer `fcdd4e7c` — jamais l'un sans l'autre, `fcdd4e7c` n'étant pas compatible avec la DB migrée à 263 (§ 6) | responsable de rollback | app 200 sur `/`, `/login`, `/dashboard` ; smoke fonctionnel |
| **T2 — Auth / MFA KO** | impossible de se connecter, challenge MFA en boucle, admin plateforme inaccessible | aucun admin `total` ne peut atteindre `/plateforme` | **Ne pas ouvrir le service.** Tester le second admin `total` / le flux de récupération e-mail Supabase (§ 7). Si irréparable rapidement : rollback coordonné app+DB (B). | Julien + opérateur | un admin `total` atteint `/plateforme` en AAL2 après login + challenge réels |
| **T3 — Stripe KO** | `verify:stripe-prices` rouge, checkout au mauvais montant, webhook rejeté, mauvais mode | montant checkout ≠ catalogue, ou `expected_mode` ≠ `test` | **Maintenir `ABONNEMENTS_PUBLICS_OUVERTS=false`.** Revenir à la configuration TEST connue (Price IDs + `expected_mode` d'origine, via variables Vercel). **Aucun Live.** Le code n'est pas rollbacké pour un problème de variable. | opérateur | `verify:stripe-prices --strict` 8/8 ; 1 checkout Test au bon montant |
| **T4 — Storage KO** | documents inaccessibles, 403 sur objets, bucket privé exposé | toute fuite public/privé, ou indisponibilité des documents | **Ne pas ouvrir les fonctionnalités documents.** Restaurer via le backup Storage validé (§ 4), re-vérifier public/privé et isolation. | opérateur + Codex | checksums Storage PASS ; A↔B isolés ; aucun bucket privé public |

---

## 14. Matrice de décision

| Incident | Forward-fix (A) | Rollback app | Rollback DB (B) | Restore Storage | STOP commercial |
|---|:--:|:--:|:--:|:--:|:--:|
| Erreur UI mineure (texte, style) | ✅ | — | — | — | — |
| Build applicatif cassé | ✅ (fix + redeploy) | éventuel | — | — | — |
| Migration SQL partielle / interrompue | — | — | ✅ | — | ✅ |
| RLS / ACL applicative incorrecte (droit manquant/en trop) | ✅ si borné | — | ✅ si non borné | — | ✅ |
| Fuite cross-tenant A→B | — | ✅ immédiat | ✅ | selon cause | ✅ |
| MFA admin plateforme inaccessible | selon cause | ✅ | ✅ si récup. impossible | — | ✅ |
| Checkout Stripe au mauvais montant | ✅ (variables Vercel) | — | — | — | ✅ (abonnements restent fermés) |
| Bucket privé devenu public | — | ✅ | selon cause | ✅ | ✅ |
| Absence de backup vérifié constatée | **ne pas migrer** | — | — | — | ✅ |
| Rollback techniquement impossible | **ne pas migrer** | — | — | — | ✅ |

---

## 15. Critères GO (tous requis avant ouverture)

- [ ] Migrations appliquées, ledger = **263**, `…000255` et `…000265` présentes, aucune collision.
- [ ] pgTAP Production ciblé PASS (référence : 870/870 Fresh & Restore côté Codex).
- [ ] Auth / MFA PASS (login + challenge TOTP + AAL2 réels post-déploiement).
- [ ] Admin plateforme PASS (matrice non-auth / AAL1 / AAL2 non-admin / AAL2 admin inactif /
      AAL2 admin `total` actif).
- [ ] Multitenant PASS (aucune fuite A↔B sur tables, RPC, documents, Storage, habilitations).
- [ ] Stripe TEST PASS (`verify:stripe-prices --strict` 8/8, 8 parcours checkout au bon
      montant, `expected_mode` = `test`).
- [ ] Storage PASS (privé/public correct, URL signées, isolation).
- [ ] Aucun secret exposé (`verify:secrets` PASS, `git grep` patterns durs = 0).
- [ ] Monitoring accessible (Sentry Production, logs Vercel).
- [ ] Rollback prêt : snapshot/PITR identifié, volume DR monté, responsable joignable.

## 16. Critères NO-GO (un seul suffit à bloquer immédiatement)

- Migration partielle ou ledger incohérent.
- Drift ACL **applicatif** ≠ 0 (nouvel écart pour `anon` / `authenticated` / `service_role` /
  `authenticator` / `elsatia_*`).
- Fuite cross-tenant.
- MFA **fail-open** (une session AAL1 atteint `/plateforme`).
- Admin plateforme inaccessible (aucun admin `total` en AAL2).
- Mode Stripe incorrect (`expected_mode` ≠ `test`, ou clé Live branchée).
- Checkout au mauvais montant.
- Bucket privé devenu public.
- Absence de backup vérifié (DB ou Storage).
- Rollback techniquement impossible à ce moment.

---

## 17. Responsabilités

| Rôle | Périmètre |
|---|---|
| **Julien (décideur)** | GO/NO-GO commercial, fenêtre de maintenance, arbitrages, communication admins, déclenchement du rollback |
| **Codex / outil d'exécution** | Fresh Supabase, Restore chiffré, pgTAP, drift ACL, E2E, application des migrations, snapshot/backups, restauration DB/Storage |
| **Claude** | documentation (ce runbook, audits, plans) — **aucune** responsabilité opératoire permanente, aucune exécution BDD/Production |
| **Support Supabase** | PITR/snapshot, incident plateforme DB |
| **Support Vercel** | incident déploiement, variables d'environnement |
| **Support Stripe** | incident compte, webhooks (au passage Live) |
| **Expert-comptable** | régime fiscal/TVA (prérequis commercial, hors runbook technique) |

Aucune responsabilité humaine permanente n'est attribuée à Claude ni à Codex.

---

## 18. Post-déploiement — surveillance

| Fenêtre | Contrôles |
|---|---|
| **Immédiat (T+0 → T+30 min)** | taux d'erreur Sentry, 5xx Vercel, login/MFA réels, webhooks Stripe Test reçus, upload/download document, aucune erreur RLS anormale |
| **T+1 h** | logs (aucune erreur récurrente), latence des pages clés, cohérence `/tarifs` (montants), aucune alerte de sécurité |
| **T+24 h** | volume d'erreurs stabilisé, aucun incident cross-tenant, quotas Auth e-mail non saturés, sauvegardes automatiques reprises |
| **T+7 j** | revue des incidents, décision d'archivage des anciens Prices Stripe ×12, ré-audit DR complet planifié |

---

## 19. Limites de ce document

Ce document :

- **décrit** un runbook go-live et rollback ;
- **n'exécute pas** les migrations ;
- **ne crée pas** de snapshot Production ;
- **ne valide pas** Fresh / Restore / pgTAP / drift ACL par lui-même : ces preuves vivent dans
  `ELSATIA_PRODUCTION_CUTOVER_PREFLIGHT_FINAL_V1.md` §13 (drill DB au SHA `a81f317`, QA
  applicative au SHA `996be15`) ;
- **ne remplace pas** les preuves d'exécution du lot Codex `ELSATIA-PREPROD-DB-E2E-ROLLBACK-V1`.

Il n'est applicable qu'une fois ces preuves fournies et vertes.
