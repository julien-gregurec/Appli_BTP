# ELSATIA — Pré-production : contrôles BDD/E2E + plan de rollback V1

Date : 2026-09-02.

> **VOLET DOCUMENTAIRE UNIQUEMENT — LES PREUVES D'EXÉCUTION BDD/E2E SONT FOURNIES PAR CODEX.**
> Aucune procédure ci-dessous n'a été exécutée par Claude. Aucune base n'a été construite,
> aucun snapshot Production créé, aucun test Fresh/Restore/pgTAP/E2E lancé. Ce document
> **cadre** ce que Codex doit exécuter (lot `ELSATIA-PREPROD-DB-E2E-ROLLBACK-V1`) et **fournit**
> le plan de rollback ; les résultats réels devront être renseignés dans les colonnes « Preuve
> Codex ».

SHA pré-production : `feat/tarification-on-canonical-preprod-v1` @
`ac7bf050056c1bf74593c299112d68d2d26e9b45` (HEAD distant confirmé identique).
Production actuelle : `release/commercialisation-v1` @ `fcdd4e7c90f32abb15502e825335659f9d57c9a1`.
Runbook opérateur associé : `docs/runbooks/ELSATIA_PRODUCTION_ROLLBACK_V1.md`.

---

## 1. Périmètre — qui fait quoi

| Bloc | Exécutant | Statut |
|---|---|---|
| Fresh Supabase (253 migrations depuis zéro) | **Codex** | à exécuter |
| pgTAP Fresh (suite complète) | **Codex** | à exécuter |
| Restore chiffré + migration → SHA final | **Codex** | à exécuter |
| pgTAP Restore + comparaison Fresh↔Restore | **Codex** | à exécuter |
| Diff ACL applicatif (Fresh↔Restore) | **Codex** | à exécuter |
| E2E MFA / admin / multitenant / Stripe TEST | **Codex** | à exécuter |
| Plan de rollback DB/Auth/MFA/ACL/Stripe/Storage | **Claude** | **fourni ci-dessous + runbook** |
| Runbook go-live / rollback T0→T4 | **Claude** | **fourni** (`docs/runbooks/…`) |
| Snapshot/PITR Production | **Codex/opérateur** | non exécuté ici |

Claude n'exécute **aucune** opération BDD/Production/Vercel/Stripe.

---

## 2. Grille de contrôle BDD/E2E à renseigner par Codex

| # | Contrôle | Attendu | Preuve Codex |
|---|---|---|---|
| C1 | Fresh : 253 migrations appliquées depuis zéro | 0 erreur, ledger cohérent, `…000255` présente, aucune collision | _à renseigner_ |
| C2 | pgTAP Fresh | 870/870 (ou nouveau total exact) — fichiers / tests / PASS-FAIL | _à renseigner_ |
| C3 | Restore chiffré + migration → SHA final | sentinelles Auth (6) / Storage (1) / ledger 253 / aucune perte de données synthétiques DR | _à renseigner_ |
| C4 | pgTAP Restore | = résultat Fresh | _à renseigner_ |
| C5 | Diff ACL applicatif Fresh↔Restore | **application drift = 0** ; **exploitable system drift = 0** | _à renseigner_ |
| C6 | 532 écarts managés | toujours conformes à l'allowlist V1 (`ELSATIA-SUPABASE-SYSTEM-DRIFT-AUDIT-V1`) ; tout nouvel écart → STOP | _à renseigner_ |
| C7 | MFA E2E local | user test → login → enroll TOTP → verify → AAL2 → `/plateforme` → logout/relogin → challenge → unenroll contrôlé ; 0 fixture résiduelle | _à renseigner_ |
| C8 | Admin/rôle E2E | non-auth → refus ; AAL1 → MFA ; AAL2 non-admin → refus ; AAL2 admin inactif → refus ; AAL2 admin `total` actif → autorisé ; 0 email hardcodé | _à renseigner_ |
| C9 | Multitenant E2E (A/B) | 0 fuite A→B sur tables / RPC / documents / Storage / habilitations apps / changement d'entreprise | _à renseigner_ |
| C10 | Stripe TEST E2E (8 parcours) | 79/790 · 249/2 490 · 449/4 490 · 599/5 990 ; webhook Test/Live guard ; idempotence ; entreprise inconnue → erreur contrôlée ; erreur Supabase gérée ; 0 log sensible | _à renseigner_ |
| C11 | Storage | 13 buckets, 12 privés / 1 public, checksums, isolation tenant | _à renseigner_ (DR : GO déjà acquis) |
| C12 | `verify:migrations` / `verify:secrets` | PASS / PASS | _à renseigner_ |

Tant qu'une ligne de C1–C12 n'est pas verte et prouvée, le prérequis technique Production
**n'est pas fermé**.

---

## 3. Éléments déjà acquis (contrôle statique Claude, R2)

- SHA `ac7bf05` : HEAD distant = attendu ; graphe tracé (release `fcdd4e7c` + canonique
  `6a814a2b` + ACL 255 + Root QA + MFA + replay tarif).
- **253 migrations**, timestamps uniques, `…000255` + R7.4/R7.5 + `canonicalization_v2`
  présentes, **aucune migration historique modifiée**.
- Migration `…000255_acl_reconciliation_v1.sql` : **1 220 `REVOKE` + 14 `ALTER DEFAULT
  PRIVILEGES … REVOKE`** (comptés sur le SHA).
- Vitest GP **686/686**, Tools **107/107**, MFA vitest **24/24**, Stripe vitest **94/94**,
  tarification **94/94** ; typecheck/lint/builds PASS ; `npm audit` 0 ; `verify:secrets` 0 ;
  `verify:stripe-prices --strict` **8/8** (mapping cible).
- MFA : `decisionGardeMfa` fail-closed, dernier admin protégé, multi-facteur, 0 hardcode email,
  open-redirect sanitisé (`destinationInterneSure`).
- Ces éléments **ne remplacent pas** C1–C12 (statique ≠ exécution BDD/E2E).

---

## 4. Plan de rollback — synthèse

Détail complet et séquencé : `docs/runbooks/ELSATIA_PRODUCTION_ROLLBACK_V1.md`.

### 4.1 Principe
**Un rollback Vercel seul n'est pas suffisant après application des migrations ACL/MFA.** Le
déploiement applique 42 migrations dont `…000255` (1 220 REVOKE) : l'ancien binaire `fcdd4e7c`
n'est plus garanti compatible avec la base migrée. Rollback complet = application + DB +
migrations + Auth/MFA + ACL + Storage + Stripe.

### 4.2 Snapshot / PITR
Prérequis strict avant toute migration Production : snapshot/PITR **identifiable, restaurable,
à rétention suffisante**, relié au `backup_id` du déploiement. **Non créé dans ce lot.**

### 4.3 Backup DB
Acquis : backup PostgreSQL GO, restore chiffré GO, fidélité DB GO. Ordre :
dump → SHA-256 → écriture volume chiffré → vérification → manifeste → rétention (7/4/12).

### 4.4 Storage
Acquis : Storage DR GO — 13 buckets, 12 privés / 1 public, checksums + isolation validés.
Restauration **après** la DB ; contrôle public/privé et préfixe `entreprise_id` obligatoires.

### 4.5 Rollback DB — 3 stratégies
- **A Forward-fix** : migration OK + données intactes + bug applicatif mineur → correctif code.
- **B Restauration snapshot/PITR** : migration destructrice/incohérente, corruption, ACL non
  récupérable → restore DB **+** redeploy `fcdd4e7c` (coordonné).
- **C Bundle d'urgence** : `GRANT` de compatibilité **préparés et testés à l'avance**
  uniquement. Jamais de rollback SQL permissif improvisé. Pas de down-migration automatique
  pour les REVOKE/ACL de `…000255`.

### 4.6 ACL
`ancien frontend + nouvelle DB ACL ≠ garantie de fonctionnement`. Rollback code seul
insuffisant dès `…000255` appliquée → stratégie B ou bundle C.

### 4.7 Auth / MFA
Distinguer **application** (guards AAL2, rollback = redeploy) / **Auth données** (facteurs,
sessions — via restore snapshot, jamais de SQL manuel) / **récupération admin** (2 admins
`total` ; reset de facteur via le flux Supabase Auth e-mail ; ne jamais demander seed/QR/TOTP à
l'opérateur central ; `plateforme@invalid.local` n'est **pas** un secours). Pas de `DELETE FROM
auth.mfa_factors` comme procédure normale.

### 4.8 Sessions existantes
Sessions AAL1 → re-challengées par les guards AAL2 (voulu). **Une session existante n'est pas
une preuve d'AAL2.** Prévenir les admins plateforme.

### 4.9 Stripe
Production app volontairement en **Stripe TEST** pendant la recette. Aucun Live. Le rollback
distingue code / Price IDs / webhooks / `STRIPE_WEBHOOK_EXPECTED_MODE` / clés — ne jamais
confondre « rollback code » et « bascule TEST/LIVE ». `ABONNEMENTS_PUBLICS_OUVERTS` reste `false`.

### 4.10 Variables Vercel
Fiche d'état par **nom / environnement / présence / état attendu**, jamais de valeur secrète
(cf. runbook § 10). Écart connu : 4 `STRIPE_PRICE_*_ANNUEL` encore en ×12 (lot CODEX séparé).

### 4.11 Attestation Ed25519
Clé privée = Vercel uniquement (jamais en doc/dump/log). Clé publique = DB. `key_id` cohérent
entre les deux. Fail-closed si registry absente.

---

## 5. Runbooks (fournis)

- **Go-live** : séquence T-60 (préparation) → T-30 (sauvegardes) → T0 (migration + point de
  décision) → T+15 (déploiement app + tests auth/MFA/admin/multitenant/Stripe/Storage) → T+30
  (décision GO/ROLLBACK) → surveillance T+1h/T+24h/T+7j. Durées **indicatives**.
- **Rollback T0→T4** : migration échoue / migration OK + app KO / Auth-MFA KO / Stripe KO /
  Storage KO — pour chacun : symptôme, seuil, action, responsable, preuve de retour à la
  normale.
- **Matrice de décision** : incident → {forward-fix, rollback app, rollback DB, restore
  Storage, STOP commercial}.
- **Critères GO** (10) et **NO-GO** (10) explicites.
- **Responsabilités** : Julien (décideur), Codex (exécution), Claude (documentation, sans
  responsabilité opératoire), supports Supabase/Vercel/Stripe.

Voir `docs/runbooks/ELSATIA_PRODUCTION_ROLLBACK_V1.md`.

---

## 6. Limites

Ce document et son runbook :
- décrivent la procédure ;
- n'exécutent aucune migration ;
- ne créent aucun snapshot Production ;
- ne valident pas Fresh/Restore/pgTAP/E2E sur `ac7bf05` ;
- ne remplacent pas les preuves Codex (C1–C12 § 2).

Le prérequis technique Production n'est **fermé** que lorsque C1–C12 sont vertes **et** que le
snapshot/PITR + les backups DB/Storage du déploiement sont créés et vérifiés.

---

`ELSATIA-PRODUCTION-ROLLBACK-RUNBOOK-V1 VALIDÉ — DOCUMENTATION GO-LIVE ET ROLLBACK PRÊTE — EXÉCUTION BDD RESTE À CODEX`
