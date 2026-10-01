# ELSATIA GESTION PRO — Hosted Preview V8 : qualification finale (V1)

| | |
|---|---|
| Date | 2026-10-01 |
| Base canonique | `integration/elsatia-canonical-train-v8` @ `53b4bc7` (371 migrations, dernière `20260928000812`) |
| Pack Preview V8 | `claude/modest-shannon-uhp2ic` @ `27f4241` (V8 + outillage Preview, 0 changement applicatif) |
| Cible | Supabase `elsatia-preview` (`pgvvpqyjziyapbbkydmc`), Vercel Preview GP |
| Production | `elsatia-production` (`exhvuzegsefmoguxoiak`) : **jamais touchée** (ni lecture, ni écriture) |
| Branche du rapport | `claude/adoring-planck-2us9x5` (rapport seul, aucun code ni migration) |

## 0. Verdict

**`ELSATIA GP PREVIEW BLOCKED`**

URL GP PREVIEW : **non obtenue**. Aucun déploiement n'a été fait.
La dernière URL connue, citée dans les docs du pack, est `https://elsatia-preview-julien-gregurec-julien-gregurec1.vercel.app`. Elle était **inaccessible** depuis cette session : son contenu n'a donc pas été vérifié.

LOGIN : **BLOQUÉ**. Non testé.

Cause unique, un blocage d'environnement et non applicatif :

1. **La politique réseau de la session cloud refuse tous les hôtes de la mission.** Le proxy répond `CONNECT tunnel failed, response 403` pour :
   - `pgvvpqyjziyapbbkydmc.supabase.co` (REST et Auth) ;
   - `api.supabase.com` ;
   - `api.vercel.com` ;
   - `*.vercel.app`.

   Seul GitHub passe.
2. **Aucun identifiant n'est présent dans la session.** Il manque notamment :
   - Supabase : access token, `ELSATIA_PREVIEW_DB_URL`, service role ;
   - Vercel : token ;
   - Stripe Test ;
   - Brevo ou fournisseur email ;
   - Redis.

Conséquence : **aucune écriture distante, aucune lecture distante**. Le règle « STOP WRITES » s'applique de fait.

Seule la partie locale de la mission a été exécutée (§A) : elle est verte.

## A. Ce qui a été vérifié (local, hors réseau)

| Contrôle | Résultat |
|---|---|
| Pack descend de V8 (`git merge-base --is-ancestor 53b4bc7`) | ✅ `V8-OK` |
| Code applicatif du pack identique à V8 (`supabase apps src workers packages public`) | ✅ `APP-IDENTIQUE-V8` |
| `verify:migrations` | ✅ 371 migrations valides ; partagé 371 · Studio 23 |
| `verify:train-expectations` | ✅ 371, dernière `20260928000812`, DB verify 37 contrôles |
| `test:preview-v8-gate` | ✅ 12/12 |
| `test:preview-pack` | ✅ 31/31 |
| `preview:v8-gate --plan` sans identifiant | ✅ refus propre : `ELSATIA_PREVIEW_DB_URL absente`, code de sortie 2. La garde fonctionne et rien n'est tenté |

## B. Statut par étape de la mission

| # | Étape | Statut | Détail |
|---|---|---|---|
| 1 | Précondition `ACTIVE_HEALTHY` | **NON VÉRIFIABLE** | Management API refusée par le réseau. STOP WRITES |
| 2 | Backup (DB, ledger, Auth, inventaire Storage) | **NON FAIT** | `npm run preview:backup` exige `ELSATIA_PREVIEW_DB_URL`. Aucun push possible sans backup : règle respectée |
| 3 | Ledger réel vs V8 (371 / `…0812`) | **NON LU** | Aucune hypothèse prise sur l'état hébergé |
| 4 | Upgrade → V8 | **NON FAIT** | Bloqué par 1 à 3. Aucun `db push` |
| 5 | DB verify (37 contrôles, 39 server-only) | **NON FAIT** | Attendus locaux confirmés (§A) |
| 6 | Entreprise pilote | **NON DIAGNOSTIQUÉE** | `DECISION_REQUIRED_PILOT_SUBSCRIPTION` reste ouvert (cf. handoff V2 §7) |
| 7 | Droits GP du pilote | **NON VÉRIFIÉS** | Aucun droit posé. Colors, Tools et Réserves non ouverts |
| 8 | Variables Preview | **NON CONFIGURÉES** | Valeurs attendues en §C |
| 9 | Déploiement Vercel Preview | **NON FAIT** | Aucun `--prod`. Build V8 servi : **non prouvé** ; le build du 23 août est peut-être toujours servi |
| 10 | Auth (login, logout, session, refresh, membre actif ou désactivé, suspendu, essai expiré, admin billing) | **NON TESTÉ** | |
| 11 | Routes GP critiques | **NON TESTÉES** | |
| 12 | Data correctness V8 | **NON TESTÉE** (hébergé) | Couverte localement par la qualification V8 |
| 13 | Storage | **NON TESTÉ** | |
| 14 | Email allowlist | **NON TESTÉ** | Aucun email envoyé |
| 15 | Stripe Test | **`HOSTED_PROOF_REQUIRED`** | Aucun Stripe, ni Test ni Live |
| 16 | Playwright hébergé | **NON EXÉCUTÉ** | |
| 17 | TTFB | **NON MESURÉ** | |
| 18 | Sécurité hébergée | **NON TESTÉE** | |
| 19 | Rollback | **DOCUMENTÉ** | §D |
| 20 | Rapport | ✅ | ce document |

## C. Pour débloquer (propriétaire)

### C.1 Réseau de l'environnement cloud

Dans le menu de l'environnement cloud (barre de titre de la session, puis **Edit**, puis **Network access**), autoriser :
- `pgvvpqyjziyapbbkydmc.supabase.co`
- `db.pgvvpqyjziyapbbkydmc.supabase.co` (port 5432 ou pooler)
- `api.supabase.com`
- `api.vercel.com`, `vercel.com`, `*.vercel.app`
- `api.stripe.com`, uniquement en clé de test

Documentation : https://code.claude.com/docs/en/claude-code-on-the-web

> Avec une politique `full`, **ne pas** ajouter de secret Production à l'environnement. La garde du pack refuse `exhvuzegsefmoguxoiak` par code, mais la règle reste : aucun identifiant Production dans la session.

### C.2 Secrets d'environnement (Preview uniquement)

| Secret | Usage |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | `supabase link`, `projects list`, contrôle `ACTIVE_HEALTHY` |
| `ELSATIA_PREVIEW_DB_URL` | backup, ledger, `db push` sous garde, DB verify |
| `VERCEL_TOKEN` (+ org/projet GP Preview) | `vercel deploy`, **sans `--prod`**, et variables Preview |
| `STRIPE_SECRET_KEY=sk_test_…` + webhook test | §15 |
| Comptes de recette Preview : pilote admin, membre, membre désactivé | §10 |

### C.3 Variables Vercel GP Preview attendues (§8)

```
ELSATIA_APPLICATION_ENV=preview
NEXT_PUBLIC_TOOLS_ENV=preview
NEXT_PUBLIC_TOOLS_BILLING_API_URL=<URL GP Preview, *.vercel.app>   # jamais app.elsatia.fr
NEXT_PUBLIC_COLORS_URL=<URL Colors Preview>                         # jamais app.elsatia.fr
EMAIL_PREVIEW_ALLOWLIST=<adresses de recette uniquement>
```

Gabarits : `.env.preview.example` et `apps/tools/.env.preview.example`, sur la branche du pack.

### C.4 Séquence à rejouer une fois débloqué

Suivre `docs/qualification/ELSATIA_V8_PREVIEW_OPERATOR_HANDOFF_V2.md` §3 → §12, sur la branche du pack :

1. `preview:backup` ;
2. `preview:v8-gate --plan`, puis `--authorize-push` ;
3. `supabase db push` ;
4. DB verify : attendu GO, 37 contrôles, 39 server-only ;
5. `pilot-subscription.mjs`, en diagnostic seulement ;
6. décision sur l'abonnement pilote ;
7. `vercel deploy` (Preview) ;
8. `http-smoke`, `storage-smoke`, `stripe-test-verify`, puis Playwright hébergé.

Pour prouver que le build servi est V8 et non celui du 23 août, comparer le SHA du déploiement Vercel (`meta.githubCommitSha` ou l'en-tête de build) à `53b4bc7` ou à `27f4241`.

## D. Rollback (§19)

| Objet | Procédure |
|---|---|
| Vercel | `vercel rollback <deployment-précédent>` ou « Promote » de l'ancien déploiement **dans le scope Preview**. Aucune action sur Production |
| DB Preview | `pg_restore --clean --if-exists -d "$ELSATIA_PREVIEW_DB_URL" <backup>/db.dump`. Vérifier ensuite `ledger.txt` contre `supabase_migrations.schema_migrations` et le sha256 du `manifest.json`. Auth : `auth.dump`, données seules |
| Variables Preview | `vercel env rm <NAME> preview` ; rotation des clés Stripe Test, Supabase service role Preview et token Vercel |
| Compte pilote | passer l'abonnement pilote à `canceled` / désactiver l'entreprise pilote via la procédure du pack (`ELSATIA_PILOT_SUBSCRIPTION_APPLY_V1.sql`, section retrait). Ne jamais modifier les règles Billing globales |

Aucun rollback n'est nécessaire à ce jour : **aucune modification distante n'a été effectuée.**

## E. Décisions

| Code | État | Choix conservateur appliqué |
|---|---|---|
| `DECISION_REQUIRED_ENV_NETWORK` | ouvert | aucune tentative de contournement du proxy |
| `DECISION_REQUIRED_PREVIEW_CREDENTIALS` | ouvert | aucune écriture, aucune lecture distante |
| `DECISION_REQUIRED_PILOT_SUBSCRIPTION` | ouvert | aucun abonnement posé |
| `HOSTED_PROOF_REQUIRED` (Stripe Test, et toute la recette hébergée) | ouvert | — |
