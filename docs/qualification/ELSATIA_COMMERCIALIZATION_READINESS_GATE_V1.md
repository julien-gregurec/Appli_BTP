# ELSATIA — Commercialization Readiness Gate V1

| | |
|---|---|
| Date | 2026-09-28 |
| Base documentaire | `integration/elsatia-canonical-train-v6` @ **`9102ec80`** — verdict d'origine `CANONICAL TRAIN V6 LOCALLY QUALIFIED` (358 migrations, dernière `20260928000601`) |
| Branche | `claude/gifted-cori-vv7scp`, repartie de `9102ec80` (V6 + ce gate uniquement ; **rien n'est intégré dans le train**) |
| Livrables | `npm run commercialization:check` → `artifacts/commercialization-readiness.json` + `artifacts/commercialization-readiness.md` ; registre `scripts/commercialization/registry.mjs` ; moteur `gate.mjs` ; 16 tests `npm run test:commercialization` |
| Actions distantes | **Aucune.** Aucun appel Production ni Preview, aucun paiement, aucun e-mail réel, aucun déploiement. Le gate ne fait aucun appel réseau (testé). |
| Date d'activité déclarée | 01/10/2026 : **repère de configuration seulement**. Le gate n'en déduit aucune obligation de vendre à cette date (point `LEGAL-ACTIVITY-DATE`, NOT_APPLICABLE) |

## 0. Verdict

**`ELSATIA COMMERCIALIZATION GATE NOT YET PASSED`**

126 points applicables : **38 GO**, **88 ouverts**, dont **21 P0**, 50 P1 et 17 P2. Il n'y a volontairement **aucun score global** : une moyenne masquerait les P0.

Raisons exactes : les 21 P0 ci-dessous. Chacun, seul, empêche le verdict PASS. §3 en donne la dépendance technique.

| # | ID | Statut | Classe | Ce qui manque |
|---|---|---|---|---|
| 1 | `PREVIEW-EXECUTED` | REMOTE_PROOF_REQUIRED | BLOCKER_REMOTE | Aucune qualification Preview distante n'a jamais été exécutée : V4 `PREVIEW BLOCKED`, pack V1 `NOT EXECUTED` |
| 2 | `PREVIEW-PACK-TARGETS-V6` | NO-GO | BLOCKER_TECHNIQUE | Le pack opérateur est figé sur V5 `f6399f15`. Son préflight rend NO-GO dès qu'un train plus récent qualifié existe (V6) |
| 3 | `PREVIEW-PROJECT-INVENTORY` | DECISION_REQUIRED | DECISION_REQUIRED | Choix des projets Preview (limite de 2 projets Supabase). Aucun projet Vercel pour Colors, Tools, Réserves, Studio |
| 4 | `DB-HOSTED-LEDGER` | REMOTE_PROOF_REQUIRED | BLOCKER_REMOTE | Migrations V6 appliquées nulle part (V6 non déployé) |
| 5 | `OPS-V6-PRODUCTION` | REMOTE_PROOF_REQUIRED | BLOCKER_REMOTE | La Production `app.elsatia.fr` tourne sur une lignée antérieure |
| 6 | `SEC-STORAGE-HOSTED` | REMOTE_PROOF_REQUIRED | BLOCKER_REMOTE | Policies des 19 buckets jamais vérifiées sur un vrai service Storage |
| 7 | `SEC-BANK-KEY-VERSIONING` | NO-GO | BLOCKER_TECHNIQUE | Constat P0 du manifeste : clé bancaire sans version, donc sans rotation ; perte = IBAN/BIC illisibles |
| 8 | `BILL-STRIPE-TEST-PRICES` | REMOTE_PROOF_REQUIRED | BLOCKER_REMOTE | `verify:stripe-prices` strict n'a jamais été vert |
| 9 | `BILL-STRIPE-TEST-WEBHOOKS` | REMOTE_PROOF_REQUIRED | BLOCKER_REMOTE | Aucun webhook signé par Stripe Test réel |
| 10 | `BILL-STRIPE-TEST-FLOWS` | REMOTE_PROOF_REQUIRED | BLOCKER_REMOTE | Scripts Checkout, essai, ordre et réabonnement contre Stripe Test : préparés, jamais exécutés |
| 11 | `BILL-STRIPE-TAX` | DECISION_REQUIRED | DECISION_REQUIRED | Stripe Tax bloqué tant que le régime de TVA n'est pas confirmé |
| 12 | `BILL-STRIPE-LIVE` | MANUAL_REQUIRED | MANUAL_VALIDATION | Compte Stripe Live non activé |
| 13 | `BILL-COMMERCIAL-LOCK` | DECISION_REQUIRED | DECISION_REQUIRED | Verrou `ABONNEMENTS_PUBLICS_OUVERTS` : l'ouverture est une décision explicite |
| 14 | `LEGAL-IDENTITY-IN-TRAIN` | NO-GO | BLOCKER_LEGAL | Mentions légales V6 sans RCS ; SIRET « en cours de finalisation » ; TVA « à confirmer » |
| 15 | `LEGAL-ADDRESS` | DECISION_REQUIRED | BLOCKER_LEGAL | Adresse de publication : adresse retenue ou domiciliation. **Aucune adresse n'est choisie ici** |
| 16 | `LEGAL-VAT` | DECISION_REQUIRED | BLOCKER_LEGAL | Régime de TVA (franchise ou assujettissement) |
| 17 | `LEGAL-STRIPE-SELLER` | MANUAL_REQUIRED | BLOCKER_LEGAL | Identité vendeur du compte Stripe |
| 18 | `DR-REMOTE-BACKUP` | REMOTE_PROOF_REQUIRED | BLOCKER_REMOTE | Aucune sauvegarde hébergée restaurée ni vérifiée |
| 19 | `DR-HOSTED-STORAGE` | REMOTE_PROOF_REQUIRED | BLOCKER_REMOTE | Fichiers Storage absents des sauvegardes de base ; copie S3 → S3 à mettre en place |
| 20 | `DR-POST-RESTORE-PROCEDURE` | MANUAL_REQUIRED | MANUAL_VALIDATION | « P0 procédure » du DR V2. Une restauration rouvre des droits Stripe et ressuscite mots de passe, sessions et bans |
| 21 | `DR-VOLUME-PASSPHRASE` | MANUAL_REQUIRED | MANUAL_VALIDATION | Constat P0 du manifeste : passphrase du volume DR sans dépositaire documenté |

Ce qui est **prouvé** et n'est pas remis en cause :

- **Code.** Qualification locale de V6, rejouée dans cette mission (§4).
- **Base de données.** Base neuve 358/358, upgrade, RLS, policies, grants, DB verify GO.
- **Sécurité locale.** Multi-tenant, Réserves D-01, gardes Studio, auth sur GoTrue réel, secrets.
- **Facturation locale.** Ordre, essai, réabonnement, sécurité self-service, idempotence.
- **Rapports post-V6.** DR local, pack Preview prêt, recettes Réserves, Colors et Relevé.

## 1. Base et inventaire post-V6

`git fetch origin` a été fait au démarrage puis en fin de mission. `origin/integration/elsatia-canonical-train-v6` est resté sur `9102ec80`. Il n'existe **aucune branche `origin/*` descendante de V6**, **aucun train V7**, et **aucune mission Performance en cours** sur origin : la seule branche perf est `origin/perf/gp-capacity-readiness-v1` (2026-09-20), déjà reprise dans le train GP.

Rapports qualifiés postérieurs ou concurrents à V6. **Aucun n'est intégré au train.**

| Rapport | Branche @ tip | Base de la branche | Verdict | Utilisé pour |
|---|---|---|---|---|
| `ELSATIA_TRANSACTIONAL_EMAIL_ARCHITECTURE_V1.md` | `claude/practical-ritchie-yvsg3f` @ `98de5d39` | V5 `f6399f15` | **ELSATIA EMAIL ACTIONS REQUIRED** | EMAIL |
| `ELSATIA_LEGAL_IDENTITY_COMMERCIALIZATION_AUDIT_V1.md` | `claude/awesome-franklin-se2s33` @ `13b1d7fb` | **main `4d92ddbe`** (antérieur au train) | **ELSATIA LEGAL IDENTITY ACTIONS REQUIRED** | LEGAL |
| `ELSATIA_DISASTER_RECOVERY_RESTORE_V2.md` | `claude/determined-rubin-zdzpmy` @ `7249ca86` | V5 `f6399f15` (+ contrôle de compatibilité V6, §16) | **ELSATIA DR LOCALLY QUALIFIED** | BACKUP_DR, DATABASE |
| `ELSATIA_REMOTE_PREVIEW_OPERATOR_HANDOFF_V1.md` | `claude/wizardly-keller-3gz8nv` @ `f694a67a` | V5 `f6399f15` | **REMOTE PREVIEW OPERATOR HANDOFF PACK V1 READY** (qualification : `NOT EXECUTED`) | PREVIEW |
| `ELSATIA_V4_REMOTE_PREVIEW_EXECUTION_V1.md` | `claude/zen-davinci-xn6m3m` @ `05278925` | V4 `b7fa9e2c` | **V4 PREVIEW BLOCKED** | PREVIEW |
| `ELSATIA_STUDIO_POST_H_PORT_V1.md` | `claude/modest-pasteur-izfaqm` @ `b91084fc` | Studio `fb7082c6` | STUDIO POST-H LOCALLY QUALIFIED | STUDIO |
| `ELSATIA_STUDIO_DEDICATED_PLAYWRIGHT_CI_V1.md` | `claude/jolly-volta-doejq2` @ `a8c09c5a` | post-H `b91084fc` | STUDIO DEDICATED E2E LOCALLY QUALIFIED | STUDIO |
| `ELSATIA_TOOLS_RELEVE_METRE_LOT7_EQUIPEMENTS_CALQUES_V1.md` | `claude/nifty-edison-mevolm` @ `62ebcb1c` | Lot 6 `d734f255` | RELEVE METRE LOT 7 LOCALLY QUALIFIED | TOOLS_RELEVE |
| `ELSATIA_OBSERVABILITY_INCIDENT_READINESS_V1.md` | `ops/observability-incident-readiness-v1` @ `e67696ef` | **main `4d92ddbe`** | PILOT INCIDENT READY | OBSERVABILITY |

**Avertissement sur l'audit d'identité légale.** Il a été conduit sur `main` @ `4d92ddbe`, pas sur V6 : « 709 fichiers », « Tools, Colors, Réserves, Studio : dépôt absent », « aucun fournisseur e-mail actif ». Plusieurs de ses constats ne s'appliquent plus à V6. Les icônes PWA de V6 affichent ELSATIA. La fiche « Liria (boutique) » est renommée (migration `20260801000194`). Brevo est le fournisseur e-mail. Le gate ne reprend de cet audit que ce qui a été **revérifié dans V6**, ainsi que les actions propriétaire, qui ne dépendent pas de la base de code.

## 2. Le gate

### 2.1 Statuts, classes, priorités

- **Statuts, liste fermée :** `GO`, `NO-GO`, `DECISION_REQUIRED`, `REMOTE_PROOF_REQUIRED`, `MANUAL_REQUIRED`, `NOT_APPLICABLE`. Un « TODO », « TBD » ou « FIXME » dans un titre, une justification ou une dépendance **fait échouer le registre** (code 2).
- **Obligations hors GO :** chaque point porte une priorité `P0`/`P1`/`P2`, un porteur et une dépendance technique. Un `NOT_APPLICABLE` doit être justifié.
- **Classes de blocage :**
  - `BLOCKER_TECHNIQUE` : NO-GO technique ;
  - `BLOCKER_REMOTE` : REMOTE_PROOF_REQUIRED ;
  - `BLOCKER_LEGAL` : point juridique, quel que soit son statut ;
  - `DECISION_REQUIRED` ;
  - `MANUAL_VALIDATION` : MANUAL_REQUIRED.
- **Priorités :** les définitions de la mission, sans jugement business.
  - P0 : empêche objectivement la mise en vente, ou expose un risque sécurité/data majeur.
  - P1 : nécessaire avant l'ouverture aux clients.
  - P2 : amélioration possible après le lancement.

  Quand un rapport source fixe déjà une gravité (manifeste d'environnement, rapport DR V2, red team V3), elle est **reprise telle quelle** et citée dans `rationale`.

### 2.2 Preuves (sondes)

| Sonde | Ce qu'elle vérifie |
|---|---|
| `file` | le fichier existe dans HEAD et contient le marqueur cité (verdict, chiffre) |
| `ref` | le fichier existe sur une branche `origin/*` **déjà récupérée localement** (`git show`). Le gate ne contacte jamais origin |
| `unchanged-since` | `9102ec80` est un ancêtre de HEAD, et `src apps packages supabase workers package-lock.json` sont identiques. Sinon, la qualification V6 ne couvre plus le code |
| `manifest-finding` / `manifest-decision` | état courant de `config/env-manifest.json` |
| `exec` | code de sortie d'une porte locale exécutée par `--run-code` ou `--run-db`. Un échec l'emporte sur tout rapport |

Règles du moteur :

- **Un GO dont une preuve manque est rétrogradé en NO-GO**, avec `integrity_error`.
- **Bascule automatique (`derive`).** Un point bascule en GO quand le dépôt change :
  - lot porté dans le train : fichier attendu présent (`packages/email/src/identite.ts`, `scripts/dr/v2/dr-verify.mjs`, `src/app/api/healthz/route.ts`…) ;
  - constat du manifeste passé à `fixed` ou `accepted` ;
  - décision marquée « TRANCHÉE » ;
  - RCS présent dans les mentions légales ;
  - `artifacts/preview-qualification.json` rendu `PREVIEW QUALIFIED`.

  Le gate suit donc les progrès **sans réécriture manuelle du registre**.
- **Pourcentage par catégorie** : GO / points applicables. Toute catégorie qui a un P0 ouvert est marquée `BLOCKED_P0`, quel que soit son pourcentage. Le JSON porte `global_score: null`, avec la raison.
- **Verdict.** `GATE PASS` seulement si **tous** les points sont GO ou NOT_APPLICABLE. Sinon `GATE NOT YET PASSED`, avec la liste des P0 et leurs dépendances (`reasons_p0`).

### 2.3 Commandes

```bash
npm run commercialization:check                        # rapports + sondes du dépôt (secondes)
npm run commercialization:check -- --run-code          # + typecheck, lint, tests (5 apps), build (5 apps), migrations, seeds, secrets, manifeste, outillage
npm run commercialization:check -- --run-code --run-db --db-url postgresql://postgres:…@127.0.0.1/elsatia_gate_fresh
                                                       # + base neuve (rebuild_db.sh) et DB verify local ; base elsatia_gate_* en 127.0.0.1 uniquement
npm run test:commercialization                         # 16 tests hors réseau du gate
```

Codes de sortie : `0` PASS · `1` NOT YET PASSED · `2` registre invalide ou usage.

Ce que le gate refuse, et que ses tests vérifient :

- tout `fetch`, `node:http(s)`, `node:net` ;
- `git fetch`, `vercel deploy`, `supabase db push` ;
- toute porte `preview:*`, `smoke`, `stripe-verify` ou `--brevo-send` dans les exécutions ;
- toute base non locale ou hors du préfixe `elsatia_gate_`.

Le gate ne se substitue pas au pack Preview. Il **lit** son résultat quand il existe.

## 3. Catégories

Chiffres de `artifacts/commercialization-readiness.json` (exécution `--run-code --run-db` du §4). Le pourcentage n'a de sens qu'avec la colonne État.

| Catégorie | GO / applicables | % GO | État | NO-GO | DECISION | REMOTE | MANUAL | N/A | P0 ouverts |
|---|---|---|---|---|---|---|---|---|---|
| CODE | 7 / 8 | 87,5 % | OPEN | 1 | 0 | 0 | 0 | 0 | — |
| DATABASE | 7 / 9 | 77,8 % | **BLOCKED_P0** | 0 | 0 | 2 | 0 | 0 | DB-HOSTED-LEDGER |
| SECURITY | 6 / 14 | 42,9 % | **BLOCKED_P0** | 4 | 1 | 2 | 1 | 0 | SEC-STORAGE-HOSTED, SEC-BANK-KEY-VERSIONING |
| BILLING | 5 / 15 | 33,3 % | **BLOCKED_P0** | 1 | 4 | 4 | 1 | 0 | BILL-STRIPE-TEST-PRICES, -WEBHOOKS, -FLOWS, BILL-STRIPE-TAX, BILL-COMMERCIAL-LOCK, BILL-STRIPE-LIVE |
| EMAIL | 1 / 10 | 10 % | OPEN | 3 | 3 | 2 | 1 | 0 | — |
| LEGAL | 0 / 12 | 0 % | **BLOCKED_P0** | 2 | 5 | 0 | 5 | 1 | LEGAL-IDENTITY-IN-TRAIN, LEGAL-ADDRESS, LEGAL-VAT, LEGAL-STRIPE-SELLER |
| RGPD | 0 / 10 | 0 % | OPEN | 3 | 5 | 1 | 1 | 0 | — |
| BACKUP_DR | 1 / 8 | 12,5 % | **BLOCKED_P0** | 1 | 0 | 4 | 2 | 0 | DR-REMOTE-BACKUP, DR-HOSTED-STORAGE, DR-POST-RESTORE-PROCEDURE, DR-VOLUME-PASSPHRASE |
| PREVIEW | 1 / 5 | 20 % | **BLOCKED_P0** | 1 | 1 | 1 | 1 | 0 | PREVIEW-PACK-TARGETS-V6, PREVIEW-EXECUTED, PREVIEW-PROJECT-INVENTORY |
| OBSERVABILITY | 1 / 4 | 25 % | OPEN | 1 | 0 | 1 | 1 | 0 | — |
| PERFORMANCE | 2 / 3 | 66,7 % | OPEN | 0 | 0 | 1 | 0 | 0 | — |
| MOBILE | 1 / 6 | 16,7 % | OPEN | 0 | 0 | 0 | 5 | 0 | — |
| STUDIO | 2 / 5 | 40 % | OPEN | 1 | 1 | 1 | 0 | 0 | — |
| TOOLS_RELEVE | 1 / 5 | 20 % | OPEN | 1 | 2 | 1 | 0 | 0 | — |
| RESERVES | 1 / 3 | 33,3 % | OPEN | 1 | 0 | 1 | 0 | 1 | — |
| COLORS | 1 / 4 | 25 % | OPEN | 1 | 1 | 1 | 0 | 0 | — |
| OPERATIONS | 1 / 5 | 20 % | **BLOCKED_P0** | 1 | 1 | 2 | 0 | 0 | OPS-V6-PRODUCTION |

Totaux par classe : BLOCKER_TECHNIQUE **21** · BLOCKER_REMOTE **24** · BLOCKER_LEGAL **8** · DECISION_REQUIRED **20** · MANUAL_VALIDATION **15**.

Le détail point par point (statut, priorité, porteur, dépendance, preuves et résultat de chaque sonde) est dans `artifacts/commercialization-readiness.json`, avec un résumé dans `artifacts/commercialization-readiness.md`. Ci-dessous, la lecture par catégorie demandée par la mission.

### CODE

- **GO — preuve du rapport V6 et ré-exécution locale (§4) :** build, typecheck, lint, tests, migrations, seeds, outillage.
- **NO-GO P1 — `CODE-POST-V6-CONVERGENCE` :** sept lots qualifiés existent hors train.
  - Ils sont sur trois bases différentes : V5, Lot 6 et Studio `fb7082c6`.
  - Deux partent de `main` `4d92ddbe` : l'identité légale et l'observabilité.
  - Leur portage est une **dépendance commune** à EMAIL, LEGAL, BACKUP_DR, PREVIEW, OBSERVABILITY, STUDIO et TOOLS_RELEVE.

### DATABASE

- **GO :**
  - base neuve 358/358, rejouée ici ;
  - upgrade V5 → V6 : 91/91 empreintes, 28/28 contrôles métier ;
  - RLS : sonde 0 écart / 1 479 cellules ; DB verify local : 0 table sans RLS, 0 écriture anon ;
  - policies 639 → 639 ;
  - grants inchangés ; 37/37 RPC service-role only ;
  - DB verify local GO, rejoué ici ;
  - restauration locale (DR V2).
- **REMOTE P1 — `DB-PGTAP-COMPLETE` :** 143/152 fichiers propres. Les 9 autres relèvent des limites du banc : pgsodium réel absent, amorce Supabase incomplète, suites Studio du projet partagé.
- **REMOTE P0 — `DB-HOSTED-LEDGER`.**

### SECURITY

Preuves existantes compilées :

| Sujet | Statut | Preuve |
|---|---|---|
| Lecture seule — Réserves D-01 | GO | `RESERVES SUSPENSION POLICY LOCALLY QUALIFIED`, pgTAP 97, Playwright V6 7/7 |
| Lecture seule — Studio | GO | garde d'écriture en base, 22 RPC refusées (42501) |
| Lecture seule — GP suspendu | DECISION_REQUIRED P1 (`SEC-SUSPENSION-CROSS-APP`) | un abonnement suspendu **coupe** la lecture (ce n'est pas une lecture seule), et Colors, Tools et Réserves dépendent du statut GP (RT-V3-P2-02) : décision produit demandée par le red team |
| Multi-tenant | GO | red team V3 (3 failles corrigées, dont 2 P0), remédiation `SECURITY BLOCKERS REMEDIATED`, sonde RLS V6 |
| Résidus red team | NO-GO P2 | RT-V3-P2-01 (oracle), P3-02 (jeton anon), P3-03 (pas de limitation de débit) |
| Auth locale | GO | GoTrue réel : jetons expirés, bannis, révoqués ; identité Studio B + I1 73/73 ×3 ; signup Studio fermé |
| Auth hébergée | REMOTE P1 | AAL2/MFA réel, URLs de redirection par application |
| Storage hébergé | **REMOTE P0** | policies des 19 buckets jamais vérifiées sur un vrai service |
| Secrets | GO | `verify:secrets`, rejoué ici ; job CI |
| Dépendances | GO | `audit:security` en CI hebdomadaire. Non rejoué par le gate (registre npm = réseau) |
| Identifiants de démo historiques | MANUAL P1 | `docs/AUDIT_SECURITE.md` : « rotation requise ». Ce document date du 18/07 et n'a pas été mis à jour |
| Manifeste | **NO-GO P0** + NO-GO P1 | `F-DR-BANK-KEY-VERSIONING` (P0) ; 7 constats P1 ouverts (HMAC à double usage, repli d'environnement, replis localhost…) |
| CI | NO-GO P2 | pgTAP du projet partagé et recettes Playwright absents de la CI |

### BILLING

Prouvé **localement**, sans Stripe réel :

| Sujet | Preuve |
|---|---|
| Sécurité self-service | contournement RLS fermé ; 3DS ne suspend pas ; colonnes commerciales verrouillées |
| Ordre des événements | ordre, rejeu, doublons ; 100 courses concurrentes |
| Essai | synchronisation de l'essai ; double Checkout concurrent bloqué |
| Réabonnement | 120/120 ordres ; Playwright 6/6 ×2 sur V6 avec une clé factice |
| Webhooks Connect/Boutique | clos localement |
| Idempotence Boutique | close localement |

Exige **Stripe Test réel** :

| ID | Prio | Sujet |
|---|---|---|
| `BILL-STRIPE-TEST-PRICES` | P0 | Price IDs, `verify:stripe-prices` strict |
| `BILL-STRIPE-TEST-WEBHOOKS` | P0 | signatures, endpoints, `STRIPE_WEBHOOK_EXPECTED_MODE` |
| `BILL-STRIPE-TEST-FLOWS` | P0 | Checkout, essai, ordre, réabonnement : 3 scripts préparés, jamais exécutés |
| `BILL-CUSTOMER-PORTAL` | P1 | Portail client |

Également ouverts :

- **Décisions :** TVA et Stripe Tax (**P0**), verrou d'ouverture `ABONNEMENTS_PUBLICS_OUVERTS` (**P0**), grille de prix (5 décisions STRIPE-*, P1), délai de grâce (P1).
- **Compte Stripe Live : MANUAL P0.**
- **Résidu D3, NO-GO P1 :** un événement webhook réservé puis en échec est perdu au réessai suivant de Stripe.

**Date de commercialisation.** V6 ne contient **aucune garde de date**. L'ouverture dépend d'un drapeau d'environnement. La garde `DEBUT_COMMERCIALISATION` du 01/10/2026 n'existe que sur la branche d'identité légale, qui n'est pas portée.

### EMAIL — rapport `ELSATIA EMAIL ACTIONS REQUIRED`

| Nature | Points |
|---|---|
| **Code prêt, hors train** | `EMAIL-CODE-READY` (P1) et `EMAIL-SECURITY-FIXES` (P1 : open redirect du callback Réserves, jetons de partage vers Sentry, échappement HTML). Tous deux basculent en GO quand le lot est porté |
| **Configuration hébergée manquante** | A-2 : gabarits neutres à reporter dans le Dashboard Supabase (MANUAL P1). A-4 : `ELSATIA_APPLICATION_ENV=production` et `EMAIL_PREVIEW_ALLOWLIST` (REMOTE P1). Envois Brevo applicatifs réels : aucun (REMOTE P1) |
| **Décision propriétaire** | A-3 : adresse de contact, `support@` ou `contact@` (P1). A-1 : routage Auth par application (P1). A-8 : fournisseurs (P2). A-7 et A-9 : relais Colors, repli localhost (P2, avec A-5 et A-6 en défauts de flux) |
| **Déjà en place (GO)** | SMTP Brevo du projet Supabase Production, domaine `elsatia.fr` authentifié DKIM, reset de mot de passe testé de bout en bout. Preuve : registre central P5, lignée pré-V6 |

### LEGAL — rapport `ELSATIA LEGAL IDENTITY ACTIONS REQUIRED`

Constats **revérifiés dans V6**. Rien n'est inventé :

| Sujet | Constat V6 | Statut |
|---|---|---|
| Adresse de publication | `mentions-legales.md` publie l'adresse retenue à l'immatriculation, avec la note « à revérifier contre l'avis SIRENE ». L'audit la classe « LEGAL_REVIEW_REQUIRED » (domiciliation possible) | DECISION_REQUIRED **P0** |
| TVA | `[EDITEUR_MENTION_TVA]` s'affiche « à confirmer » ; les prix sont affichés HT | DECISION_REQUIRED **P0** |
| RCS / identité | aucun « 850 559 873 » dans le pack V6 ; SIRET « en cours de finalisation » | NO-GO **P0** (identité) + MANUAL P1 (SIRET : aucune valeur inventée) |
| Contact | pack V6 : `support@elsatia.fr` ; audit : `contact@elsatia.fr` | DECISION_REQUIRED P1 |
| Boutique | biens physiques hors activité déclarée ; Checkout sans facture | DECISION_REQUIRED P1 (Boutique OFF) |
| Identité vendeur Stripe | checklist §6 de l'audit | MANUAL **P0** |
| Visuels | icônes PWA V6 = ELSATIA ; guides PDF et vidéos `output/` encore « Liria » (non servis) | NO-GO P2 |
| Prestataires | OpenAI, Sentry, Powens : garanties et localisation | MANUAL P1 |
| Avocat | pack « brouillons solides, à faire relire par un avocat » | MANUAL P1 |
| Autres applications et site vitrine | identité non auditée ; pack limité à « ELSATIA Gestion Pro » | MANUAL P1 |
| Marque | dépôt non vérifié | DECISION_REQUIRED P2 |

### RGPD

Aucune durée n'est choisie par ce gate.

| Point | Statut |
|---|---|
| Contrat de conservation **A** (durée), **B** (point de départ B1 et repli B2), **C** (photos) — `docs/legal/ELSATIA_RGPD_CONTRACT_RETENTION_OWNER_DECISION_V2.md`. Rien n'est activé (fail-closed, DB verify 14 et 28) | DECISION_REQUIRED P1 |
| Invitations Studio : aucune analyse RGPD dans le train (lot post-H hors V6) | DECISION_REQUIRED P2 (Studio OFF) |
| Suppression des espaces partagés Studio : D3 espaces d'un compte supprimé, D4 contenus chez autrui, D1 délai, D2 journal | DECISION_REQUIRED P2 (Studio OFF) |
| Prestataires : région Sentry à confirmer ; hébergeur du worker Studio et Redis absents du registre | MANUAL P1 |
| Décisions de cycle de vie 1-5 (RETAIN, GPS/photos de pointage, pseudonymisation, purge self-service, anonymisation) | DECISION_REQUIRED P1 |
| Promesse CGV « suppression 30 jours après la fin », sans tâche de production qui l'exécute | NO-GO P1 |
| `employes` : e-mail, téléphone et notes lisibles par tout membre actif. **Vérifié sur la base V6 neuve** (policy PERMISSIVE ALL `est_membre_actif`) ; intra-tenant | NO-GO P1 |
| Tables `reserves_*` hors de l'architecture de purge | NO-GO P1 |
| Purge hébergée jamais exécutée | REMOTE P1 |
| Rétention des journaux techniques non définie | DECISION_REQUIRED P1 |

### BACKUP_DR — rapport `ELSATIA DR LOCALLY QUALIFIED`

- **GO — `DR-LOCAL`.** Restauration stricte à 0 écart. 4 sinistres. Storage réel (storage-api) et Auth réel (GoTrue). Compatibilité avec le schéma V6.
- **Outillage hors train.** `npm run dr:verify` n'existe pas dans V6 : NO-GO P1.

Marqués séparément, comme demandé :

| Sujet | Statut |
|---|---|
| Preuve de sauvegarde distante (PITR, sauvegardes Supabase) | **REMOTE P0** |
| Storage hébergé (copie S3 → S3 appariée au `backup_id`) | **REMOTE P0** |
| Configuration Auth hébergée (clés JWT, SMTP, gabarits, hooks, MFA, redirections) | REMOTE P1 |
| RTO/RPO : mesures locales ≠ SLA ; aucun objectif fixé | REMOTE P1 |
| Procédure post-restauration (R1/R2/R6) | MANUAL **P0** (« P0 procédure » du rapport) |
| Passphrase du volume DR | MANUAL **P0** (manifeste) |

### PREVIEW — Remote Preview Operator Handoff

| | Statut |
|---|---|
| **Pack prêt** (`REMOTE PREVIEW OPERATOR HANDOFF PACK V1 READY` : commande unique, 35 étapes, 27 tests hors réseau) | **GO** |
| **Preview réellement exécutée** | **NON** : V4 `PREVIEW BLOCKED` (réseau et identifiants absents), pack V1 `NOT EXECUTED` → REMOTE **P0** |
| Pack aligné sur le train à qualifier | NO-GO **P0** : `train.json` est figé sur V5 et le préflight refuse un train plus récent qualifié |
| Inventaire des projets Preview | DECISION_REQUIRED **P0** |
| Confirmations manuelles (réception des e-mails) | MANUAL P1 |

Les deux lignes ne sont jamais confondues. Le point `PREVIEW-EXECUTED` ne bascule en GO que si `artifacts/preview-qualification.json` porte un verdict `PREVIEW QUALIFIED`.

### OBSERVABILITY

| Point | Statut |
|---|---|
| Sentry câblé, `sendDefaultPii: false` | GO |
| Sentry reçu en Production | REMOTE P1 |
| Journaux structurés, `/api/healthz`, suivi des crons : branche `PILOT INCIDENT READY` sur `main`, hors train | NO-GO P1 |
| Alerting, disponibilité, astreinte | MANUAL P1 |

### PERFORMANCE — **REMOTE/LOCAL PROOF PENDING**

Aucun rapport Performance en cours n'est disponible sur origin : ce n'est pas attendu indéfiniment. Le dernier rapport GP (`PILOT CAPACITY READY`, pas « 40 utilisateurs qualifiés ») a été mesuré sur `release/gp-v1-rc` @ `8caef21`, pas sur V6. Il note un Dashboard à 1,7–1,8 s, et aucune mesure hébergée.

→ `PERF-V6-CAPACITY` : REMOTE P1.

Mesures locales V6 qui restent GO :

- Réserves : recette performance 5/5 (2 000 réserves) ;
- Relevé : 500 murs + 300 ouvertures (`next dev`).

### MOBILE

- **Émulation seulement : GO.** Profils Playwright WebKit iPhone 13 et iPad (gen 7), Pixel 7, `colors-mobile` 73/73, Réserves V4 mobile 6/6.
- **Tests manquants, tous MANUAL :**

| Test | Prio | Constat |
|---|---|---|
| iPhone physique | P1 | aucun test |
| iPad physique | P1 | Relevé tablette : « MOBILE EMULATED ONLY » |
| Safari iOS réel | P1 | non testé |
| Terrain réel | P1 | rechargement hors ligne de Réserves non exécutable localement ; installation PWA réelle non testée |
| Installation Tools native (TestFlight / Play) | P2 | non cochée |

### STUDIO, TOOLS_RELEVE, RESERVES, COLORS

**STUDIO**

- GO :
  - Studio OFF au lancement ;
  - chaîne dédiée : 543 pgTAP, identité 73/73 ×3.
- Ouverts, tous P2 tant que Studio reste OFF :
  - post-H et banc E2E hors train ;
  - projet dédié hébergé et contrôles H1-H6 ;
  - décisions d'inscription et d'hébergeur du worker.

**TOOLS_RELEVE**

- GO : Relevé 2-6 + Atelier 68/68.
- Entitlement cloud-sync : REMOTE P1.
- Perte de lecture d'un utilisateur rétrogradé : DECISION P1.
- Lot 7 hors train : P2.
- Volume de la pièce : DECISION P2.

**RESERVES**

- GO : 59/59, D-01 7/7, GP ↔ Réserves 5/5 ×3.
- Storage, GoTrue et e-mail réels (H-01) : REMOTE P1.
- R-06 à R-08 : P2.
- Télémétrie absente par choix produit : NOT_APPLICABLE.

**COLORS**

- GO : `COLORS LOCALLY QUALIFIED`, 73/73.
- Domaine « Preview config » : REMOTE P1.
- R1 et écran `/utilisateurs` : P2.
- Nuancier sous licence / OCR : DECISION P2.

### OPERATIONS

| Point | Statut |
|---|---|
| Support premiers clients (sans SLA promis) | GO |
| Rollback jamais répété sur la lignée V6 | REMOTE P1 |
| V6 non déployé en Production | REMOTE **P0** |
| Préflight Production pas encore en « enforce » | NO-GO P1 |
| `FEATURE_CRONS_ENABLED` fail-open | DECISION_REQUIRED P1 |

## 4. Portes rejouées localement dans cette mission

Tout a été exécuté sur `9102ec80`, avec pour seul ajout le gate lui-même : `scripts/commercialization/`, deux scripts npm, une exclusion justifiée du scanner du manifeste. Le résultat détaillé est dans `executions[]` de l'artefact.

| Porte | Résultat |
|---|---|
| `rebuild_db.sh elsatia_gate_fresh` (PostgreSQL 16) | ✅ **358 migrations applied cleanly** (~20 s) |
| `db-verify.mjs --local-harness --before-owner` | ✅ **`GO : base Preview conforme.`** (29 contrôles, préflight 21 / 0 bloquant, 0 table sans RLS, 19 buckets, 37/37 service-role only). Les deux alertes attendues avant l'étape propriétaire/attestation sont présentes |
| `typecheck` (racine, Tools, Réserves, Colors) | ✅ |
| `lint` | ✅ 0 erreur |
| `test` (Vitest) | ✅ GP **2 300** (36 ignorés), Tools **2 118**, Réserves **186**, Colors **431** ; Studio **291** |
| `verify:migrations`, `test:migration-targets`, `verify:train-expectations` | ✅ |
| `verify:secrets`, `verify:env-manifest`, `test:env-manifest` | ✅ (après l'exclusion du dossier du gate, voir ci-dessous) |
| `test:seeds`, `test:preview-pack`, scripts Stripe test-mode (hors réseau) | ✅ |
| `build` (GP + Tools, Réserves, Colors, Studio) | voir `executions[]` de l'artefact |

**Constat d'outillage.** Le scanner du manifeste lit tout littéral en MAJUSCULES dont le préfixe est suivi (`TOOLS_RELEVE`, par exemple), ainsi que toute variable. Le dossier `scripts/commercialization/` est un registre documentaire qui cite des noms de variables. Il est donc exclu du scan, avec justification, dans `config/env-manifest.json` (`scan.exclude_paths`). C'est la seule modification hors du dossier du gate, avec les deux scripts de `package.json`.

## 5. Ce que ce gate ne prouve pas

- **Hébergé.** Rien de ce qui touche l'hébergé n'est prouvé ici : c'est l'objet des points `REMOTE_PROOF_REQUIRED`.
- **Reprise des rapports.** Les chiffres des rapports cités (pgTAP 143/152, Playwright, upgrade, DR, Studio) ne sont **pas** rejoués par le gate. Il vérifie leur présence, leur verdict, et que le code n'a pas changé depuis `9102ec80`. Il rejoue ce qui est rapide et sûr (§4).
- **Performance.** Aucune mesure n'a été produite ici.
- **Bascule automatique.** Un point portant une sonde `derive` peut passer GO **par un fait du dépôt** : fichier porté, constat fermé, décision marquée « TRANCHÉE ». La revue de ce fait reste humaine, comme pour tout changement du train.

## 6. Fichiers

| Fichier | Rôle |
|---|---|
| `scripts/commercialization/registry.mjs` | registre des 128 points (17 catégories), portes exécutables |
| `scripts/commercialization/gate.mjs` | moteur pur : validation, sondes, rétrogradation, catégories, verdict, résumé |
| `scripts/commercialization/check.mjs` | CLI `npm run commercialization:check` |
| `scripts/commercialization/gate.test.mjs` | 16 tests hors réseau (`npm run test:commercialization`) |
| `artifacts/commercialization-readiness.json`, `.md` | résultat machine-readable et résumé lisible (généré) |
| `package.json` | scripts `commercialization:check`, `test:commercialization` |
| `config/env-manifest.json` | `scan.exclude_paths` : `scripts/commercialization/` (justifié) |
