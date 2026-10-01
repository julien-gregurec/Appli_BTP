# ELSATIA Studio — Preview dédiée : déploiement réel (V2)

Date : 2026-10-01 · Branche : `claude/studio-preview-live-deploy-v2` (depuis `origin/claude/charming-allen-k61cec` @ `561793c0`)
· Poste opérateur : Mac local · Guide utilisateur : `docs/qualification/ELSATIA_STUDIO_PREVIEW_USER_TEST_V2.md`

## Verdict

**STUDIO PREVIEW PARTIALLY READY**

| | |
|---|---|
| **URL de test** | **https://studio-preview-elsatia.vercel.app** (alias Preview stable) |
| Domaine préféré | `studio-preview.elsatia.fr` : rattaché au projet, lié à la branche, propriété vérifiée — **DNS manquant** (CNAME chez Squarespace) |
| En ligne et prouvé | Studio UI (Preview), base Studio dédiée migrée 21/21, pgTAP **distant** 836/836, Auth (inscription fermée), garde Storage active sur le backend hébergé, smoke distant GO, navigateurs réels (Chromium, WebKit, mobile, tablette) |
| **Bloqué** | **Connexion** : « Continuer avec mon compte ELSATIA » part vers la GP Preview, qui répond **HTTP 500** (base GP Preview en pause, non restaurable sur le plan Supabase Free ; code GP servi = 23 août, sans pont d'identité). Aucun parcours connecté n'est donc testable à distance. |
| En attente | `WORKER_PREVIEW_PENDING` (rendu vidéo), Redis Preview |

Aucune Production touchée (voir §12 pour l'incident CLI maîtrisé), aucun `--prod`, aucun achat, aucun secret dans le dépôt, aucun merge sur `main`.

---

## 1. Vérification initiale

| Contrôle | Résultat |
|---|---|
| Dépôt / branche | `/Users/juliengregurec/Appli_BTP` · `claude/studio-preview-live-deploy-v2` · arbre propre @ `561793c0` |
| Outils | node 24.18.0, npm 11.16.0, git 2.54, curl 8.7.1, Vercel CLI 62.0.0 (`julien-gregurec`, Hobby), Supabase CLI 2.119 ; **psql absent** → psql du conteneur Supabase local (Docker Desktop démarré) |
| Dépendances | absentes du poste → `npm ci` racine + `apps/studio` |

## 2. Supabase

| Projet | Ref | État | Rôle |
|---|---|---|---|
| elsatia-production | `exhvuzegsefmoguxoiak` | ACTIVE | Production GP — **non touché** |
| elsatia-preview | `pgvvpqyjziyapbbkydmc` | **INACTIVE (en pause)** | GP Preview — **non touché**, jamais utilisé pour Studio |
| **elsatia-studio-preview** | **`sknyngppqcyndofshwfv`** | ACTIVE_HEALTHY | **Studio Preview dédié** (créé par cette mission, eu-west-3 Paris) |

Plan : la pause n'existe que sur le plan **Free** ⇒ organisation Free (2 projets actifs). La création a réussi
gratuitement car GP Preview est en pause. **Conséquence** : la GP Preview ne peut plus être restaurée sans
dépasser la limite (Production + Studio Preview actifs) — voir §9 et décisions.

Recherche d'un projet Studio préexistant : aucun (CLI, `.temp` locaux, `~/elsatia-studio-preview`, docs, scripts).
Secrets du projet (mot de passe DB, clés) : `~/elsatia-studio-preview/` (0700/0600), **hors dépôt**.
Liens CLI : `apps/studio/supabase/.temp/project-ref` = Studio ; **racine non liée** ; `.temp/` et `.vercel/` ignorés par git.

### 2.1 Ledger

Projet neuf : **EMPTY NEW PREVIEW PROJECT** (aucune donnée, aucun backup nécessaire). Après migration :
**21/21 migrations Studio dédiées, dans l'ordre**, local = distant, **aucune migration GP**.
Empreintes (SHA-256, 16) inchangées par rapport à V1 sauf les trois migrations corrigées (§3) :

| Version | Migration | V1 | V2 |
|---|---|---|---|
| 20260928100000 | studio_db_write_guard | `e3fc904ad07cfefe` | **`dee1e6b343a96d78`** |
| 20260928110000 | studio_rgpd_erasure_foundation | `7d4afeb9bd211c09` | **`333e6f5e3471d163`** |
| 20260929160000 | studio_post_h_guard_rgpd | `710a9585056f4ad1` | **`0164b33ef9c0ae6d`** |

Ces trois migrations n'avaient jamais été appliquées sur un projet hébergé (modification sans risque de dérive de ledger).

## 3. Défaut réel trouvé et corrigé : garde d'écriture inapplicable sur un projet hébergé

Premier `db push` : échec à la migration 12 —
`ERROR: permission denied to set parameter "studio.write_path" (SQLSTATE 42501)`.

Cause : sur Supabase hébergé (PostgreSQL 17.11) le rôle `postgres` **n'est pas super-utilisateur** ; PostgreSQL
refuse alors de stocker un paramètre personnalisé dans une clause `SET` de fonction (et `GRANT SET ON PARAMETER`
est refusé aussi ; `set_config()` à l'exécution reste permis). Le banc V1 (`dedicated-db-check.sh`) appliquait la
chaîne **en super-utilisateur** et ne pouvait pas le voir. Reproduit à l'identique avec `supabase start --workdir apps/studio`.
Les migrations 1–11 étaient appliquées ; la 12 a été annulée par sa transaction.

Correctif (commit `6b897275`), **sémantique identique, aucun corps de fonction modifié** :
`studio_guard.bind_path(fonction, chemin)` déplace l'original dans le schéma privé `studio_guard_impl` et crée une
enveloppe publique de même signature, `SECURITY DEFINER`, `search_path=''`, **mêmes droits d'exécution exacts**, qui
pose `studio.write_path` (local), appelle l'original, puis **restaure la valeur précédente** ; en cas d'erreur,
l'annulation de la (sous-)transaction restaure le paramètre, comme une clause SET. Registre `studio_guard.path_functions`.
29 fonctions liées sur 7 chemins (identity, media_finalize, media_cleanup, render_worker, analysis_worker, rgpd_erasure,
exposure_revocation). Les re-définitions post-H visent désormais `studio_guard_impl.*`.

Nouvelles assertions pgTAP (+7) : aucune clause SET restante ; chaque chemin = enveloppe + original privé de même
signature ; originaux non exécutables par anon/authenticated/service_role ; schéma privé sans accès API ;
`bind_path` réservé aux migrations ; chemin restauré après l'appel.
Préconditions de test adaptées à la plateforme réelle : `storage.protect_delete` (suppression SQL directe refusée hors
Storage API → émulée par `storage.allow_delete_query`) ; `service_role` sans `SELECT` sur `studio_projects`.

## 4. Contrôles SQL distants (projet Studio Preview)

| Contrôle | Résultat |
|---|---|
| Tables `public` | 18, **toutes `studio_*`** (0 table GP) |
| RLS | activée sur toutes les tables `public`, `studio_identity`, `studio_guard` |
| Enveloppes / clauses SET | 29 / **0** |
| Fonctions Studio exécutables par `anon` | **0** |
| RPC d'écriture exécutables par `authenticated` | 29 (= inventaire revu) |
| Droits d'écriture de table anon/authenticated/service_role | **0** |
| `studio_guard.control` | `read_write`, `allow_unlinked_writes = false` |
| Politique d'inscription | `closed` |
| Buckets | `studio-originals`, `studio-renders` : privés |

## 5. Tests base

| Suite | Résultat |
|---|---|
| pgTAP Studio, pile Supabase **locale** (PG 17, `postgres` non super-utilisateur) | **836/836** (829 + 7) |
| pgTAP Studio, **projet distant** Studio Preview (chaque suite dans une transaction annulée) | **836/836** |
| Résidu après exécution distante | 0 utilisateur, 0 workspace, 0 objet, pgTAP non installé, garde et inscription intactes |
| `verify:migrations` / cibles | 359 partagées · Studio dédié 21 · OK |
| `verify:train-expectations`, `verify:secrets` | OK · aucun secret (3156 fichiers) |

## 6. Auth Studio (B + I1 conservé)

Poussée de `config.toml` (copie hors dépôt avec URL Preview) : `site_url = https://studio-preview-elsatia.vercel.app`,
`additional_redirect_urls` = `…/auth/elsatia/exchange` sur l'alias **et** sur `studio-preview.elsatia.fr`,
`jwt_expiry = 600`, rotation des refresh tokens, `enable_signup = false`, anonyme off, fournisseur e-mail off
(identique au banc qualifié). Prouvé : `GET /auth/v1/settings` → `disable_signup: true` ; `POST /auth/v1/signup` → **422 signup_disabled**.
Aucun mot de passe Studio, aucune inscription, `STUDIO_IDENTITY_MODE=elsatia` (preflight de build).

## 7. Storage

| Test (backend hébergé S3, fichiers factices) | Résultat |
|---|---|
| Upload anonyme `studio-originals` | refusé (garde Studio « Aucune réservation d'import ») |
| Upload clé service sans réservation | refusé (même garde) |
| Upload rendu sans bail (`studio-renders`) | refusé (« Aucun rendu actif pour cet objet ») |
| Liste anonyme d'objets | `[]` |
| URL signée d'un objet inexistant | 404 |
| Objets créés | 0 |
| Garde Storage complète (bail, révocation, lecture seule, RGPD) | pgTAP distant ✓ |
| Upload / lecture / URL signée / suppression **par un utilisateur connecté** | `REMOTE_PROOF_REQUIRED` (connexion bloquée, §9) |

Limite : plan Free = **50 Mio par fichier** au niveau projet (les buckets déclarent 1 Gio ; passer la limite globale
exige un plan payant — la poussée de config Storage a d'ailleurs été refusée en 402 « vector buckets », aucun achat déclenché).

## 8. Vercel

| Élément | Valeur |
|---|---|
| Projet | `elsatia-studio-preview` (`prj_2gu1R7gwi903YvlE7FV2VAxZo1Kb`), Root Directory `apps/studio`, Next.js, Node 24 |
| Dépôt | GitHub `Appli_BTP` connecté ; branche de production `main` |
| **Garde-fou de construction** | Ignored Build Step : ne construit **que** si `VERCEL_ENV=preview` **et** branche = `claude/studio-preview-live-deploy-v2` ; tout le reste (dont toute construction Production et les branches des autres sessions) est annulé |
| Déploiement servi | `elsatia-studio-preview-r8j25mj8i-julien-gregurec1.vercel.app` — **target preview**, commit `9acf6f5f` |
| Preflight de build Vercel | `cible preview : mode enforce` → **GO** ; `verify-identity-mode` OK |
| Alias stable | `studio-preview-elsatia.vercel.app` (choisi plutôt que `elsatia-studio-preview.vercel.app`, qui est le domaine **Production** automatique du projet) |
| Domaine | `studio-preview.elsatia.fr` rattaché avec `gitBranch` = la branche (servi par les Preview de la branche) — DNS à poser |
| Protection | Vercel Authentication **désactivée sur ce seul projet** (Hobby : pas d'exception par domaine ; elle bloquait téléphone et POST inter-sites du pont). Studio reste protégé par l'auth ELSATIA ; les autres projets sont inchangés |
| Variables (Preview uniquement, 17) | `NEXT_PUBLIC_STUDIO_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (config) ; `STUDIO_AUTH_SERVICE_KEY` = `STUDIO_STORAGE_SERVICE_KEY`, `STUDIO_CRON_SECRET` (secrets serveur) ; `STUDIO_ENABLED=1`, `STUDIO_SIGNUP_MODE=closed`, `STUDIO_LEGAL_PUBLISHED=1`, `STUDIO_AI_ANALYSIS=0`, `STUDIO_IDENTITY_MODE=elsatia`, `ELSATIA_APPLICATION_ENV=preview`, `ELSATIA_IDENTITY_ISSUER`, `ELSATIA_IDENTITY_HANDOFF_URL`, `ELSATIA_IDENTITY_JWKS_URL`, `STUDIO_IDENTITY_REVALIDATE_S`, `STUDIO_IDENTITY_MAX_SESSION_S`. Aucune valeur dans ce rapport. Aucune variable Production. |
| Bundle client | 0 `sb_secret_`, 0 clé de service, 0 secret cron (build local en conditions Preview) |

## 9. Identité B + I1 — pont GP Preview : BLOQUÉ

Constat :
1. `elsatia-preview.vercel.app` (URL stable de la GP Preview = déploiement *production* du projet Vercel `elsatia-preview`)
   sert un build du **2026-08-23** (`feat/remises-clients-v1` @ `cf490f5d`) **sans** `src/app/identity/*` ni JWKS ; il répond **500 sur toutes les routes** (base en pause).
2. Base GP Preview `pgvvpqyjziyapbbkydmc` **en pause** ; la restaurer ferait 3 projets actifs → refusé sur Free.
3. Les Preview GP construites depuis les branches V7 (y compris celle-ci) **échouent au preflight GP** :
   `NEXT_PUBLIC_TOOLS_BILLING_API_URL : absente` (état préexistant, commun aux autres sessions).

Aucune variable GP Preview n'a été modifiée (sans base restaurée rien n'est testable, et ces variables touchent les
constructions des autres sessions) : choix conservateur. Côté Studio tout est prêt et prouvé anonymement :
départ handoff → identité centrale hors Production, échange sans état → `NONCE_MISMATCH` sans cookie, lifecycle forgé → 400,
reconcile/erasure → 401. Les tests jti/rejeu/expiration/révocation/bannissement/logout restent prouvés **localement**
(V1 : identité 70/70, Playwright 23/23) et `REMOTE_PROOF_REQUIRED`.

Mise en service du pont (après décision §15-D1), dans l'ordre :
1. Restaurer `elsatia-preview` (dashboard Supabase) ; **backup** (`supabase db dump`) avant toute migration.
2. Appliquer le train GP V7 (359 migrations, dont `20260927100000_elsatia_identity_broker`) sur la GP Preview uniquement.
3. Variables **Preview** du projet Vercel `elsatia-preview` : `ELSATIA_IDENTITY_ISSUER=https://<GP>/identity`,
   `ELSATIA_IDENTITY_SIGNING_KEYS` (ES256 privée, secret), `ELSATIA_STUDIO_EXCHANGE_URL=https://studio-preview-elsatia.vercel.app/auth/elsatia/exchange`
   (ou le domaine), `ELSATIA_STUDIO_LIFECYCLE_URL=…/api/elsatia/lifecycle`, `STUDIO_ACCESS_MODE=allowlist`,
   `STUDIO_ACCESS_ALLOWLIST=<comptes de recette>`, + `NEXT_PUBLIC_TOOLS_BILLING_API_URL` (preflight).
4. `<GP>` = l'alias de branche Preview GP (`elsatia-preview-git-claude-studio-previ-ef0b50-julien-gregurec1.vercel.app`) ou
   un alias stable dédié — **pas** un déploiement production du projet `elsatia-preview` sans décision (règle « aucun --prod »).
5. Côté Studio : aligner `ELSATIA_IDENTITY_ISSUER/HANDOFF_URL/JWKS_URL` sur `<GP>` (garde : même hôte), pousser la branche,
   réaliaser, puis jouer §9 du guide (jeton valide, rejeu, expiré, révoqué, banni, logout).

## 10. E-mail

Aucun fournisseur configuré (`STUDIO_MAIL_PROVIDER` vide) : **aucun e-mail envoyé**, invitations par **lien affiché à copier**.
Correctif V1 conservé (`EMAIL_PREVIEW_ALLOWLIST` obligatoire hors Production avérée, garde SP-EMAIL).

## 11. Redis / worker

Recherche : aucune variable Redis/queue/worker dans les projets Vercel ELSATIA, aucune intégration Marketplace, aucun
CLI d'hébergeur (Fly, Railway…). Le web Studio n'utilise pas Redis. **`WORKER_PREVIEW_PENDING`** : rendu/export vidéo
indisponibles en Preview ; l'UI reste testable. Aucun fournisseur provisionné automatiquement.

## 12. Incident maîtrisé — cible Production imposée par Vercel

Sur un projet **neuf** (sans déploiement), l'API Vercel classe le **premier** déploiement en `production`, même sans
`--prod` et même avec `--target=preview` (la CLI 62 traduit `preview` en cible omise). Constaté deux fois en CLI :
1. `b9oxilq8n` : build **en erreur** (root directory), jamais servi → supprimé ;
2. `bsj2g6gvt` : READY quelques secondes sur `elsatia-studio-preview.vercel.app` (domaine du projet dédié, derrière la
   protection Vercel, variables Production **vides**, aucun domaine ELSATIA) → **supprimé immédiatement** ; domaine → 404.
Puis, après connexion Git, le premier déploiement (notre commit) a encore été classé `production` et **annulé par le
garde-fou** (aucun build). Les suivants sont `preview`. Aucune autre Production (GP, Studio `studio.elsatia.fr`) n'a été touchée.
Durcissements : `studio-preview-deploy.sh` force `--target=preview`, refuse un arbre non propre, déploie un `git archive`
de HEAD (aucun fichier local ignoré envoyé) ; garde-fou Ignored Build Step côté Vercel.

Autres défauts corrigés pendant la mission : `studio-preview-deploy.sh` (tableau vide sous bash 3.2 macOS + `set -u`) ;
**garde** : `supabase projects api-keys` sans `--reveal` renvoie une clé secrète **masquée** que la garde laissait passer
(401 « Invalid API key ») → nouveau contrôle `SP-KEY-FORME` (+ test) ; domaine du script paramétrable
(`STUDIO_PREVIEW_DOMAIN`, seuls `studio-preview.elsatia.fr` et `*.vercel.app` admis).

Effet de bord connu (préexistant) : chaque push de branche déclenche aussi des Preview des projets `elsatia-preview`,
`elsatia-production` (Preview), Tools, Colors via leur intégration Git — aucune n'est une Production.

## 13. Tests

| Porte | Résultat |
|---|---|
| Studio typecheck / typecheck e2e / lint | OK / OK / OK |
| Studio Vitest | **345/345** |
| Studio `next build` en conditions Vercel Preview (local) + build Vercel réel | OK / OK (preflight enforce GO) |
| pgTAP local hébergé-équivalent / distant | **836/836** / **836/836** |
| Garde de cible + smoke (tests purs) | **21/21** |
| Garde de cible sur l'environnement réel (`--check-links`) | **GO** |
| Smoke distant `studio-preview-smoke.mjs` | **GO — 37 contrôles bloquants** (+ `/api/health` 404 informatif) |
| Navigateurs réels sur l'URL déployée (Playwright 1.63) | Chromium 1440×900, **mobile 390×844**, **tablette 820×1180**, **WebKit iPhone 14**, WebKit desktop : page protégée → `/login`, bouton ELSATIA, aucun champ mot de passe, aucun débordement, 0 erreur JS ; handoff → GP Preview **500** |
| Safari réel (application) | non automatisé (safaridriver non autorisé) — WebKit couvre le moteur ; à faire à la main |
| Playwright dédié 23/23 (pile locale complète) | non rejoué (V1 : 23/23) — inchangé fonctionnellement ; parcours connectés bloqués à distance |
| Liens publics (valide/expiré/révoqué/propriétaire coupé/inter-tenant) | anonyme : lien inventé « indisponible », `/s/…/media` 404 ; complets : pgTAP distant ✓ ; navigateur : `REMOTE_PROOF_REQUIRED` |
| RGPD | mécanismes existants seulement (pgTAP distant ✓, mode `off`, aucune durée activée) |
| Health | `/api/health` absent de cette branche (404) — non porté, conformément à la mission |

## 14. Rollback

| Niveau | Commande | Testé |
|---|---|---|
| Alias → déploiement précédent | `STUDIO_PREVIEW_DOMAIN=studio-preview-elsatia.vercel.app scripts/preview/studio-preview-deploy.sh rollback <url-précédente>` | **oui** (aller-retour `r8j25mj8i` ↔ `7wd3smvu2`) |
| Coupe-circuit Studio (503) | `… studio-preview-deploy.sh disable` (STUDIO_ENABLED=0 + redéploiement Preview) | non (couperait la Preview) |
| Retrait alias / domaine | `npx vercel alias rm studio-preview-elsatia.vercel.app` ; domaine : `npx vercel domains rm studio-preview.elsatia.fr` (projet) | non |
| Protection Vercel | `npx vercel project protection enable elsatia-studio-preview --sso` | — |
| Base | backups dans `~/elsatia-studio-preview/backups` (`… backup`) ; base actuelle vide de données métier | — |
| Credentials Preview | régénérer la clé secrète Supabase du projet Studio (dashboard › API keys), `STUDIO_CRON_SECRET` neuf, `… env`, redéploiement | — |
| Tout supprimer | projet Vercel `elsatia-studio-preview` et projet Supabase `sknyngppqcyndofshwfv` (dédiés, aucune autre dépendance) | — |

## 15. Décisions requises

| # | Décision | Choix conservateur appliqué | Action humaine minimale |
|---|---|---|---|
| D1 | **`BLOCKED_SUPABASE_PROJECT_LIMIT` (GP Preview)** — Free = 2 projets actifs ; Production + Studio Preview occupent les 2 places | GP Preview laissée en pause ; aucun upgrade | Passer l'organisation Supabase en **Pro** (payant), puis restaurer `elsatia-preview` ; alternative non retenue : mettre Studio Preview en pause pendant les tests GP |
| D2 | DNS `studio-preview.elsatia.fr` | alias `.vercel.app` | Squarespace › DNS `elsatia.fr` : **CNAME `studio-preview` → `0bb61110fdabc9c0.vercel-dns-017.com`** ; puis `NEXT_PUBLIC_STUDIO_URL` = le domaine + push de la branche |
| D3 | GP Preview V7 + variables du pont | rien modifié côté GP | voir §9 étapes 1–5 |
| D4 | `HOSTING-PROVIDER-STUDIO-WORKER` + Redis Preview | `WORKER_PREVIEW_PENDING` | choisir l'hébergeur du worker et un Redis `rediss://` dédié |
| D5 | `STUDIO-PREVIEW-DEPLOYMENT-PROTECTION` | protection Vercel off sur le seul projet dédié | confirmer ou réactiver (`… protection enable --sso`) |
| D6 | Limite 1 Gio/fichier | 50 Mio (Free) | plan payant si besoin |
| D7 | `STUDIO-MAIL-SUBPROCESSOR`, `STUDIO-SHARED-CONTENT-ERASURE`, durées RGPD | aucun e-mail ; mode `off` | inchangé |

## 16. Commits

`6b897275` garde d'écriture hébergée (bind_path) · `23334035` déploiement toujours Preview depuis un export propre ·
`9acf6f5f` garde : clé masquée refusée · suivant : domaine paramétrable + ce rapport + guide V2.
