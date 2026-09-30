# ELSATIA Studio — Preview dédiée : infra, déploiement & lien de test (V2)

Date : 2026-09-30 · Branche source : `origin/claude/charming-allen-k61cec` @ `561793c0`
Branche de travail : `claude/vibrant-allen-hkovku` (branche imposée par la session ; la mission
proposait `claude/studio-preview-live-deploy-v2` — `DECISION_REQUIRED:BRANCH-NAME`, choix conservateur :
branche imposée, contenu identique) · Rapport précédent : `ELSATIA_STUDIO_PREVIEW_DEPLOYMENT_V1.md`
· Guide : `ELSATIA_STUDIO_PREVIEW_USER_TEST_V2.md`

## Verdict

**STUDIO PREVIEW BLOCKED**

**URL DE TEST STUDIO : aucune.** Ni `https://studio-preview.elsatia.fr`, ni une URL `*.vercel.app`.

La mission V2 supposait un **poste Mac local avec accès réseau réel**. Elle a en fait été exécutée
dans un **conteneur cloud** dont la politique réseau refuse les mêmes hôtes qu'en V1, et qui ne porte
aucun identifiant Vercel/Supabase. Aucune écriture distante n'a eu lieu : aucun Vercel, aucun
Supabase, aucune Production, aucun `--prod`, aucun merge sur `main`, aucune donnée client.

## 1. Préparation Git

| Vérification | Résultat |
|---|---|
| `git fetch origin claude/charming-allen-k61cec` | OK |
| SHA de départ | `561793c01ba185491965d2b930dde987b12f3167` |
| Branche de travail | `claude/vibrant-allen-hkovku` = `checkout -B … origin/claude/charming-allen-k61cec` |
| `git status` | propre |
| `git remote -v` | `origin https://github.com/julien-gregurec/Appli_BTP` |
| Code depuis la qualification V1 | inchangé : `561793c0` ne modifie que les 2 rapports V1 |

## 2. Outils

| Outil | État |
|---|---|
| node / npm / git / psql / curl | présents (node v22.22.0) |
| docker | présent |
| supabase CLI / vercel CLI | absents ; le script opérateur les appelle via `npx --yes` (npm joignable : `supabase` 2.119.0, `vercel` 62.0.0). Non installés : inutiles sans accès API. |

## 3. Authentification & réseau (blocage)

| Hôte | Résultat |
|---|---|
| `api.vercel.com`, `vercel.com` | `CONNECT tunnel failed, response 403` |
| `api.supabase.com`, `supabase.com` | `CONNECT tunnel failed, response 403` |
| `pgvvpqyjziyapbbkydmc.supabase.co` (GP Preview) | `CONNECT tunnel failed, response 403` |
| `elsatia.fr`, `studio-preview.elsatia.fr` | `CONNECT tunnel failed, response 403` |

- 403 = refus de la **politique d'accès sortant de l'environnement** (non contournable, non contourné).
- Aucun jeton Vercel/Supabase (`VERCEL_*`, `SUPABASE_*` absents ; aucune session CLI locale).
- `supabase projects list` / `vercel whoami` : **non exécutables**.

## 4–6. Inventaire Supabase / projet Studio Preview

Non vérifiable à distance. État connu (V1, runbook V3 D2) : organisation à **2 projets**
(GP Preview `pgvvpqyjziyapbbkydmc`, GP Production). Aucun projet Studio Preview connu.

- Création `elsatia-studio-preview` : **non tentée** (pas d'accès API).
- Classement : **BLOCKED_SUPABASE_PROJECT_LIMIT** probable (à confirmer) + `DECISION_REQUIRED:PREVIEW-PROJECT-INVENTORY`
  — options A (upgrade plan, paiement → décision humaine), B (autre organisation ELSATIA autorisée),
  C (projet existant non détecté). **GP Preview jamais utilisé (B + I1).**

## 7. Garde de cible

`scripts/preview/studio-preview-guard.mjs` : tests **20/20** (`npm run test:studio-preview`). Elle refuse
GP Preview, GP Production, `studio.elsatia.fr`, clé serveur dans `NEXT_PUBLIC_*`, `--prod`.
Non exécutée contre une cible réelle (aucune cible) → **STOP WRITES** de fait.

## 8–10. Ledger, backup, migrations

| Élément | État |
|---|---|
| Chaîne locale Studio dédiée | **21** migrations (`apps/studio/supabase/migrations`), `verify-migration-targets` : « Studio dédié 21 (9 copies gelées + 12 dédiées) », partagé 359 |
| Ledger distant | non lisible (aucun projet, pas de réseau) |
| Backup | sans objet (aucun projet) |
| Migrations appliquées | **aucune** |

## 11–12. Storage / Auth

Non configurés à distance. Preuves locales existantes (V1, pile réelle dédiée, même arbre de code) :
upload / URL signée / lecture / suppression / cross-user / read-only / révocation couverts par les
suites pgTAP + Playwright dédiées. B + I1 conservé : aucun signup, aucun mot de passe, aucun reset
Studio (`STUDIO_IDENTITY_MODE=local` refusé au build Preview).

## 13. Pont d'identité GP Preview

Non vérifiable (réseau). Prérequis inchangés (V1 B4) : GP Preview sur V7 (migration
`20260927100000_elsatia_identity_broker`, `/identity/studio/handoff`, JWKS) + `ELSATIA_IDENTITY_*`,
`ELSATIA_STUDIO_EXCHANGE_URL`, `ELSATIA_STUDIO_LIFECYCLE_URL`, `STUDIO_ACCESS_MODE=allowlist` sur
la cible **Preview uniquement**.

## 14–16. Domaine, projet Vercel, variables

Non créés. Cible prévue : projet `elsatia-studio-preview`, root `apps/studio`, framework Next.js,
domaine `studio-preview.elsatia.fr` (CNAME Vercel, sinon alias stable + `DNS_PENDING`), variables
**Preview uniquement** (liste : `.env.preview.example` + V1 §2). Aucune clé serveur en `NEXT_PUBLIC_*`
(garde).

## 17–19. E-mail, Redis, worker

| Élément | État |
|---|---|
| E-mail | garde `EMAIL_PREVIEW_ALLOWLIST` présente (V1) ; hors allowlist → lien d'invitation affiché à copier |
| Redis | `DECISION_REQUIRED:REDIS-PREVIEW` — aucune instance ; aucun achat |
| Worker | **WORKER_PREVIEW_PENDING** (`DECISION_REQUIRED:HOSTING-PROVIDER-STUDIO-WORKER`) ; l'UI reste testable sans rendu |

## 20. Contrôles locaux (exécutés dans cette session)

| Contrôle | Résultat |
|---|---|
| Studio `typecheck` | OK |
| Studio `lint` | OK |
| Studio Vitest | **345/345** (24 fichiers) |
| Studio `build` (`next build --webpack`, prebuild env + identity) | OK |
| Garde Studio Preview | **20/20** |
| Cibles de migration | OK (Studio dédié 21) |
| pgTAP dédié / Playwright dédié | **non rejoués** ici (binaires GoTrue/PostgREST/storage non provisionnés) ; derniers résultats sur **arbre de code identique** : 829/829 pgTAP, 23/23 Playwright (V1) |

## 21–28. Déploiement, protection, smoke, tests utilisateur, mobile, identité, liens publics, RGPD

**Non exécutés** : aucune URL. Séquence prête (`studio-preview-deploy.sh` :
guard → ledger → backup → migrate → env → deploy → alias → smoke). Protection recommandée :
Vercel Authentication conservée sur les Preview ordinaires, exception pour le seul domaine
`studio-preview.elsatia.fr` (Studio garde son auth ELSATIA). Effacement RGPD automatique non activé.

## 29. Rollback (prêt, rien à annuler aujourd'hui)

| Action | Commande |
|---|---|
| Couper Studio Preview | `scripts/preview/studio-preview-deploy.sh disable` (`STUDIO_ENABLED=0` + redéploiement → 503) |
| Retirer l'alias | `npx vercel alias rm studio-preview.elsatia.fr --cwd apps/studio` |
| Rollback Vercel | `scripts/preview/studio-preview-deploy.sh rollback <url-précédente>` |
| Restaurer la DB Preview | dumps `backup` (`~/elsatia-studio-preview/backups`) via `psql` sur le **seul** projet Studio Preview, après garde |

## 30. Levée du blocage — ce qu'il faut pour aboutir

1. Exécuter depuis un **poste réellement connecté** (Mac opérateur) ou autoriser dans l'environnement
   cloud : `api.vercel.com`, `vercel.com`, `api.supabase.com`, `supabase.com`, `*.supabase.co`,
   `elsatia.fr` + poser les jetons en variables d'environnement (jamais dans le chat/dépôt).
2. Décider **PREVIEW-PROJECT-INVENTORY** (upgrade Supabase ou autre organisation).
3. Suivre `docs/qualification/ELSATIA_STUDIO_PREVIEW_DEPLOYMENT_V1.md` §§ opérateur avec
   `studio-preview-deploy.sh`.

## Décisions requises

- `DECISION_REQUIRED:NETWORK-OR-OPERATOR-POSTE`
- `DECISION_REQUIRED:PREVIEW-PROJECT-INVENTORY` (paiement éventuel)
- `DECISION_REQUIRED:REDIS-PREVIEW`
- `DECISION_REQUIRED:HOSTING-PROVIDER-STUDIO-WORKER`
- `DECISION_REQUIRED:BRANCH-NAME` (informative)

Aucun secret dans ce rapport.
