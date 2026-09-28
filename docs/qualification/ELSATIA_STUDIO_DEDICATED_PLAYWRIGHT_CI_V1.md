# ELSATIA Studio — banc Playwright & CI dédiés (V1)

Date : 2026-09-28 · Branche : `claude/jolly-volta-doejq2` · Base : `claude/modest-pasteur-izfaqm` @ `b91084fc`
(STUDIO POST-H LOCALLY QUALIFIED). Aucun Supabase distant, aucun Vercel, aucune Production.

## Verdict

**STUDIO DEDICATED E2E LOCALLY QUALIFIED**

La limite du rapport post-H (« les tests Playwright Studio ne sont pas rejoués sur la chaîne Studio
dédiée, le banc historique reconstruit le train partagé GP ») est **supprimée** : un banc dédié démarre
réellement le projet Supabase Studio **seul** (PostgreSQL 16 + GoTrue + PostgREST + **storage-api
réel** + Redis + worker de rendu + Studio `next build`/`next start`) avec **uniquement** les
21 migrations `apps/studio/supabase/migrations`, et une identité centrale ELSATIA **sans aucune
table GP**. Une suite Playwright séparée (21 scénarios, navigateur Chromium réel) y couvre auth,
post-H, lecture seule, liens publics, invitations, RGPD, Storage et worker : **21/21**, rejouée
de zéro (`run.sh`, pile recréée) **4 fois : 21/21 × 4** (dont 2 en utilisateur non-root, comme le runner CI). Un job CI dédié enchaîne dedicated-db-check, pgTAP Studio,
identité et Playwright ; des canaris prouvent qu'il échoue sur migration GP, migration oubliée,
RPC non classée, table GP.

Le banc a trouvé **une régression réelle** du portage post-H (messages d'identité et de lecture
seule filtrés par la liste blanche `Notice` : refus silencieux) — **corrigée** (§8, F1). Quatre
observations d'interface, sans impact de sécurité, sont documentées (§8, O1–O4).

---

## 1. Base

| Élément | Valeur |
|---|---|
| Base demandée | `origin/claude/modest-pasteur-izfaqm` @ `b91084fc` (pas le train GP) |
| Branche de travail | `claude/jolly-volta-doejq2`, repartie de `b91084fc` (`git checkout -B`) |
| Commits | `cb9904f` banc + auth/espaces · `7b48147` médias/rendu/liens/invitations · `03eab19` **correctif F1** + lecture seule · `42ec323` RGPD/worker/chaîne · `a7a72c9` CI + canaris · dernier : robustesse du banc + ce rapport |

## 2. Banc dédié (`apps/studio/e2e-dedicated/`)

| Composant | Réel ? | Détail |
|---|---|---|
| PostgreSQL 16 — projet **Studio** | oui | cluster jetable `:56433`, plateforme Supabase minimale (rôles, `extensions.pgcrypto`, privilèges par défaut du schéma `public` **comme un projet hébergé** : les migrations doivent retirer elles-mêmes les droits) |
| GoTrue — projet Studio | oui | `supabase/auth` **v2.192.0** compilé (`go build`), `:56999`, **inscription fermée** |
| PostgREST — projet Studio | oui | v12.2.3 (binaire officiel), `:56997` |
| **Storage** | **oui** | `supabase/storage` **v1.79.22** compilé depuis la source (`node dist/start/server.js`), backend fichier, ses **74 migrations** du schéma `storage` jouées avant la chaîne Studio (ordre d'un projet hébergé), tus, URL signées, garde Storage Studio active |
| Passerelle | substitut de Kong | `gateway.mjs` `:56321` : `/auth/v1`, `/rest/v1`, `/storage/v1` (+ `X-Forwarded-Prefix` pour tus, CORS) |
| Redis | oui | `redis-server` `:56379` (BullMQ) |
| Worker | oui | `workers/studio-video/src/worker.ts` (tsx), FFmpeg 6.1.1 système (`drawtext`) |
| Studio | oui | `next build --webpack` puis `next start` `:3030`, `STUDIO_IDENTITY_MODE=elsatia`, `ELSATIA_APPLICATION_ENV=local` |
| Identité centrale ELSATIA | oui, **sans GP** | cluster `:56432` + GoTrue `:56998` + PostgREST `:56996` ; **une seule** migration : `20260927100000_elsatia_identity_broker` ; `central-identity.ts` sert `/identity/studio/handoff`, `/api/elsatia-identity/jwks`, `/api/cron/elsatia-identity` en appelant **les mêmes fonctions `@elsatia/identity`** que les routes GP (`issuePlatformHandoff`, `preparePlatformHandoff`, `dispatchOutbox`) ; connexion ELSATIA = vraie session GoTrue centrale vérifiée en ligne |
| Secrets | jetables | secrets JWT, clés anon/service, trousseau ES256, `STUDIO_CRON_SECRET` générés à chaque `start` (`$E2E_DIR/env.sh`, hors dépôt) |

Robustesse : chaque service tourne dans son propre groupe de processus (`setsid`) ; `stop` arrête
d'abord l'application, le worker et l'identité centrale, puis les services (SIGTERM, SIGKILL du groupe
après 10 s) ; `start` refuse de démarrer si un port du banc est occupé (un worker orphelin d'un run
précédent aurait pu consommer les rendus du suivant).

Scripts : `install-infra.sh` (binaires, idempotent) · `stack.sh start|stop|reset|status|rebuild-app` ·
`verify-dedicated-chain.mjs` (garde bloquante) · `verify-dedicated-chain.canary.mjs` (preuve d'échec) ·
`run.sh` (tout l'enchaînement, arrêt garanti) · `playwright.config.ts` + `specs/` (suite séparée).

Aucun train partagé : ni `scripts/local-test.mjs`, ni CLI Supabase, ni `supabase/migrations` (hors la
seule migration d'identité centrale sur le cluster central), ni `globalSetup` historique.

## 3. Migrations (chaîne dédiée) — mission §3

`stack.sh` applique `apps/studio/supabase/migrations/*.sql` dans l'ordre lexical et les inscrit dans
`supabase_migrations.schema_migrations` (comme `db push`), puis `verify-dedicated-chain.mjs` **bloque** :

| Contrôle | Résultat |
|---|---|
| C1 ciblage statique (T1–T8 de `verify-migration-targets.mjs`) | OK |
| C2 **nombre** : appliquées = fichiers | **21 / 21** |
| C2 **ordre** : registre = ordre des fichiers, horodatages strictement croissants | OK (`20260912120000` … `20260929160000`) |
| C3 **aucune migration GP** : toutes `…_studio_…` et classées (9 copies gelées + 12 dédiées) | OK |
| C4 **aucune table GP** : `public` = 18 tables, toutes `studio_*` ; aucune table GP connue dans aucun schéma ; schémas applicatifs = `studio_*` seulement | OK |
| C5 **RPC classées** : 75 fonctions exposées, toutes dans `apps/studio/supabase/rpc-classification.json` (9 classes) ; appelant conforme à la classe ; **0** fonction exécutable par `anon` | OK |

Canaris (`verify-dedicated-chain.canary.mjs`, rejoués à chaque `run.sh` et en CI) :

| Défaut injecté | Détecté |
|---|---|
| K1 migration GP copiée dans la chaîne dédiée | oui (C1/C3) |
| K2 migration Studio présente mais non appliquée | oui (C2) |
| K3 RPC `studio_*` non classée ouverte à `authenticated` | oui (C5) |
| K4 table `public.entreprises` | oui (C4) |
| K5 RPC de pont (`service_role`) ouverte à `authenticated` | oui (C5) |

Base restaurée et reconforme après chaque canari.

## 4. Scénarios Playwright (navigateur réel) — mission §4 à §12

| Spec | Scénario | Mission |
|---|---|---|
| `00-dedicated-chain` | garde de chaîne rejouée dans la suite ; Storage réel (74 migrations, 2 buckets Studio) | §3 |
| `01-auth` | « Continuer avec mon compte ELSATIA » : aucun champ mot de passe, `/signup` → `/login`, GoTrue dédié `POST /signup` **422** ; session liée (lien + session enregistrée), cookies httpOnly | §4 |
| `01-auth` | **exchange signé** : `aud=studio`, `iss` attendu, durée ≤ 60 s ; **jti one-time** : rejeu exact (même jeton, même cookie d'état restauré) → **`REPLAY`**, jti consommé une seule fois ; état d'un autre départ → `NONCE_MISMATCH` ; sans cookie → `NONCE_MISMATCH` ; signature altérée → refus | §4 |
| `01-auth` | **session existante** : second passage sans ressaisie (session centrale) ; **logout** Studio → sessions GoTrue Studio supprimées, pages protégées refusées | §4 |
| `01-auth` | **révocation** : ban central → événement signé → session Studio déjà ouverte fermée ; reconnexion refusée avec « Votre compte ELSATIA est désactivé. » ; réactivation → admis | §4 |
| `01-auth` | **réconciliation** : webhook perdu → session vivante → cron centrale de secours → fermée ; `/api/elsatia/reconcile` 401 sans/mauvais secret, 200 `failed: []`, ban GoTrue confirmé ; rejeu d'événement idempotent | §4 |
| `02-workspace-project-members` | espace personnel (idempotent), renommage, espace professionnel, projet créé par le formulaire ; isolation (404 / « inaccessible » / API refusée) | §5 |
| `02-…` | membres : ajout par identifiant, rôle lecteur (lecture OK, écriture refusée, pas de gestion), retrait → accès perdu | §5 |
| `03-media-storage` | **upload tus → storage-api réel** (JPEG, PNG, MP4 H.264), objets en base Storage, métadonnées vidéo ; **URL signée** (lecture 200, jeton altéré refusé, accès direct refusé), vignette privée ; autre compte refusé ; **delete** + purge réelle (`storage-reconcile.mjs --apply`) → objet supprimé de storage-api ; objet référencé non supprimable même avec la clé service | §5, §10 |
| `04-brand-render-shares` | **brand/settings** (Brand Kit + logo) ; **rendu réel** par le worker → `completed`, sortie dans `studio-renders`, journal d'usage `export` + `render_seconds`, scratch nettoyé ; **exports** : lecture signée (MP4 `ftyp`), téléchargement signé | §5, §11 |
| `04-…` | **liens publics** : lien valide (visiteur anonyme), secret jamais stocké ; **révocation** → « Lien indisponible », `/media` 404 ; **URL déjà émise : ≤ 60 s** (`exp − iat ≤ 60`), refusée par storage-api après échéance (attendu réellement) ; **compte propriétaire désactivé** → coupé immédiatement, réactivé → servi ; **expiration** → indisponible ; jeton inventé → indisponible | §7 |
| `05-invitations` | **création** (lien affiché une fois, sans fournisseur e-mail) ; page publique → compte ELSATIA, aucune inscription ; **mauvaise adresse** (autre compte ELSATIA) refusée ; **acceptation** par le bon compte (connexion ELSATIA depuis l'invitation), rôle appliqué ; **invitation close** (réutilisation refusée) | §8 |
| `05-…` | **révocation**, **expiration** ; **compte non ELSATIA** (utilisateur GoTrue Studio créé hors pont) : RPC d'acceptation refusée par la base, lien magique brut → aucune session ; casse de l'e-mail indifférente | §8 |
| `06-read-only` | **session déjà ouverte** → **activation read-only** (droit retiré par événement signé `entitlement_changed`) → **lecture OK** (pages, API, URL signée, `access: read_only`) → rendu déjà accepté **terminé** → **écritures bloquées** : application (projet 403, rendu, réservation média, renommage et Brand Kit avec message « Accès Studio en lecture seule… ») **et base** (RPC avec le jeton réel de la session via PostgREST → 403 `STUDIO_READ_ONLY`) → révocation de lien **admise** → **restauration** des droits → écritures de nouveau admises | §6 |
| `06-…` | interrupteur opérateur global `read_only` puis retour `read_write` | §6 |
| `07-rgpd` | **account deleted** → **session invalidée** (sessions GoTrue supprimées) → **erasure request créée** (même transaction) ; mode `off` : rien exécuté ; `execute` impossible sans décision écrite ni délai (contrainte) ; route protégée | §9 |
| `07-…` | **DECISION_REQUIRED** : contenu créé chez autrui → `awaiting_decision`, contenu intact, compte Auth conservé, clôture bloquée ; cas décidés (espace dont la personne est seule membre) effacés ; rejeu identique | §9 |
| `07-…` | effacement complet : base, **objets storage-api** (originaux, rendus), lien public coupé dès la suppression, utilisateur GoTrue Studio supprimé, journal sans donnée personnelle ; **replay idempotent** (cycle + événement signé rejoués : aucun changement, aucune erreur) | §9, §10 |
| `08-worker` | **job accepté** (bail, scratch) puis **annulé en cours de rendu** → arrêt (`CANCELLED`), scratch supprimé, rien publié | §11 |
| `08-…` | **révocation du compte pendant le job** : session fermée ; le rendu déjà accepté va à son terme (chemin système `render_worker`), aucune nouvelle admission | §11 |
| `08-…` | **publication refusée après effacement** : compte supprimé + effacement pendant le rendu → job effacé, worker arrêté, aucun objet publié ; `POST` Storage avec la clé service sur le chemin du rendu → refusé (garde Storage : aucun bail vivant) | §11 |

**Durée légale** : aucune n'est choisie. La politique produit reste `off` / décision NULL / délai NULL.
Le banc pose, sur sa base **jetable** seulement, `execute` + référence fictive `E2E-TEST-ONLY` + délai
`0` pour exécuter la mécanique, puis restaure `off`/NULL. Les délais techniques (corbeille média
`+30 h`, expiration de lien/invitation) sont avancés par mise à jour SQL sur la base jetable ; les
opérations elles-mêmes (purge, refus) sont réelles.

## 5. Limites restantes (dont Storage, mission §10)

storage-api **réel** (pas de mock) : upload tus signé, `info`, URL signées, suppression, garde Storage
Studio, file d'effacement. Limites restantes : backend **fichier** local (pas S3 : durabilité,
latence, multipart S3 non exercés) ; transformation d'image **désactivée** (non utilisée par Studio,
vignettes calculées par `sharp`) ; `storage-api` v1.79.22 construit sous Node 22 avec
`--engine-strict=false` localement (le dépôt demande Node 24, utilisé en CI).

Autres limites (non bloquantes, documentées) :

| Limite | Portée |
|---|---|
| Routes Next **GP** `/identity/studio/handoff`, `/api/elsatia-identity/jwks`, `/api/cron/elsatia-identity` non servies : l'application GP exige toute la base GP, exclue par la mission. `central-identity.ts` appelle les **mêmes** fonctions `@elsatia/identity` sur la vraie migration d'identité centrale ; les routes GP gardent leurs tests unitaires. | pont côté plateforme |
| Kong remplacé par `gateway.mjs` (préfixes, CORS, `X-Forwarded-Prefix`) | routage HTTP |
| Fournisseur d'e-mail (Resend) non exercé : invitation par lien affiché (comportement sans fournisseur, `DECISION_REQUIRED:STUDIO-MAIL-SUBPROCESSOR`) | e-mail |
| Worker d'**analyse** IA non lancé en E2E (`STUDIO_AI_ANALYSIS=0`, défaut produit) ; couvert par les tests worker (Python + OpenCV réels) | analyse |
| Workflow CI validé localement (root et non-root) mais **pas encore exécuté sur GitHub** | CI |

## 6. CI — `.github/workflows/studio-dedicated-e2e.yml` (mission §13)

Job `studio-dedicated` (ubuntu-24.04, Node 24, Go 1.24, aucun secret de dépôt, aucun service distant) :

1. **dedicated-db-check** : ciblage statique (`verify-migrations`, `verify-migration-targets` + test) ;
   `dedicated-db-check.sh` sur un cluster jetable (nouveau mode sans root `DEDICATED_PSQL_ARGS`) ;
2. **pgTAP Studio** : 19 suites de la chaîne dédiée (829 assertions) ;
3. Studio typecheck + typecheck e2e + lint + **Vitest** (dont `read-only-policy` : toute RPC appelée
   par l'application est classée) ;
4. **identity** : `local-stack.sh` (GoTrue/PostgREST réels, deux projets) + `vitest packages/elsatia-identity`
   + contrôle post-H GoTrue/PostgREST ;
5. **Playwright Studio** : `run.sh` = pile réelle + garde de chaîne (C1–C5) + canaris (K1–K5) + 21 scénarios ;
   artefacts (traces, journaux) en cas d'échec.

Échoue si : une migration GP apparaît (C1/C3, K1), une migration Studio est oubliée (C2, K2 ; T1 statique),
une RPC non classée apparaît (C5, K3 ; Vitest `read-only-policy`), une table GP apparaît (C4, K4),
un scénario Playwright échoue (tous critiques, `retries: 0`).

Exécution : validée localement de bout en bout, y compris **en utilisateur non-root** (chemin du
runner : `initdb`/`pg_ctl` sans `su`, copie du dépôt appartenant à l'utilisateur) — utilisateur uid 1001, Node 22 : pile, garde, 5 canaris et **21/21**, code de sortie 0, ×2. Le
workflow n'a pas encore tourné sur GitHub (déclenché par une pull request ou `workflow_dispatch`).

## 7. Non-régression (mission §14)

| Suite | Résultat |
|---|---|
| **Playwright Studio dédié** (`run.sh`, pile recréée à chaque fois) | **21/21 × 4** (root ×2, non-root ×2) ; garde C1–C5 OK ; canaris K1–K5 détectés ; ≈ 5 min 30 par run |
| **pgTAP chaîne dédiée** `dedicated-db-check.sh` | 21 migrations ; **829 ok, 0 échec** (19 suites) — mode `su` et mode CI `DEDICATED_PSQL_ARGS` |
| **Studio Vitest** | **339/339** (base 338 : +1 test F1) |
| Studio typecheck / lint (src, tests, e2e-dedicated) / typecheck e2e | OK / 0 problème / OK |
| **Worker** `vitest` / `tsc` / `eslint` | **42/42** (FFmpeg 6.1.1 système, Python + OpenCV d'analysis/requirements.txt) / OK / OK |
| **Identité B + I1** (`local-stack.sh` : GoTrue v2.192.0 + PostgREST 12.2.3 réels, deux projets) | **73/73 × 3** avec l'application Studio réelle (`next build` + `next start`, 3 e2e) ; contrôle post-H GoTrue/PostgREST **24/24** |
| **GP régression minimale** | `npx vitest run` **1898 passed**, 36 ignorés, 0 échec (= baseline) ; `tsc` racine 0 erreur ; `eslint` 0 erreur (15 avertissements préexistants) ; `verify-migrations` 341 OK ; `verify-migration-targets` OK + 7/7 ; aucun fichier `src/` GP modifié. (Typecheck des applications `apps/tools|reserves|colors` non rejoué : dépendances non installées ici, hors périmètre.) |

## 8. Constats

| # | Constat | Sort |
|---|---|---|
| **F1** | **Régression du portage post-H** : `Notice` n'affiche que la liste fermée `src/lib/notices.ts`, qui omettait `READ_ONLY_MESSAGE` et tous les messages d'identité (`ACCOUNT_DISABLED`, `REPLAY`, `NOT_ENTITLED`…). Écritures bien bloquées, mais **refus silencieux** (renommage, Brand Kit, invitations en lecture seule ; connexion refusée sans explication). | **Corrigé** (`03eab19`) : `IDENTITY_NOTICES` (source unique dans `identity-policy.ts`) ajoutée à la liste ; test Vitest ; assertions E2E (`01-auth`, `06-read-only`). |
| O1 | Session fermée par l'événement signé : la navigation suivante arrive sur `/login` **sans** code d'erreur (la session GoTrue est déjà supprimée, le proxy redirige avant le contrôle d'identité). Le motif s'affiche à la tentative de reconnexion. | Documenté (UX), non bloquant |
| O2 | Lecture seule : la base admet la révocation de lien et d'invitation (chemin `exposure_revocation`), l'API de lien aussi (prouvé), mais l'interface masque « Révoquer ce lien » et l'action serveur `revokeInvitation` exige `canWrite`. | Documenté ; alignement = décision produit (`DECISION_REQUIRED:STUDIO-SHARE-READONLY`) |
| O3 | Lecture seule : la page projet affiche encore la zone d'import (droit calculé sur le rôle) ; l'import est refusé côté serveur et base. | Documenté (UX) |
| O4 | `/dashboard?workspace=<espace d'autrui>` répond **200** avec la page « Page ou espace inaccessible » (rendu progressif `loading.tsx`) ; aucune donnée exposée. | Documenté |

## 9. Reproduire

```bash
apps/studio/e2e-dedicated/install-infra.sh                 # GoTrue, PostgREST, storage-api → $E2E_BIN
npm ci --ignore-scripts && npm ci --prefix apps/studio && npm ci --prefix workers/studio-video
apps/studio/e2e-dedicated/run.sh                           # pile + garde + canaris + 21 scénarios (+ arrêt)
# itératif :
apps/studio/e2e-dedicated/stack.sh start && source /var/tmp/elsatia-studio-e2e/env.sh
(cd apps/studio && npx playwright test -c e2e-dedicated/playwright.config.ts specs/04-brand-render-shares.spec.ts)
apps/studio/e2e-dedicated/stack.sh rebuild-app             # après modification du code Studio
apps/studio/e2e-dedicated/stack.sh stop
apps/studio/scripts/dedicated-db-check.sh                  # pgTAP (root) ; CI : DEDICATED_PSQL_ARGS="-h … -p … -U postgres"
```

Prérequis hôte : PostgreSQL 16 + `postgresql-16-pgtap`, `redis-server`, FFmpeg avec `drawtext`, Go ≥ 1.24,
Node ≥ 22 (24 en CI), Chromium Playwright.

## 10. Aucun déploiement (mission §16)

Aucun Supabase distant, aucun Vercel, aucune Production : tout sur `127.0.0.1`, secrets jetables.

## 11. Décisions requises (reprises, aucune valeur inventée)

`DECISION_REQUIRED:STUDIO-INVITATION-RETENTION`, `DECISION_REQUIRED:STUDIO-MAIL-SUBPROCESSOR`,
`DECISION_REQUIRED:STUDIO-SHARED-CONTENT-ERASURE`, `DECISION_REQUIRED:STUDIO-SHARE-READONLY` (voir O2),
durée légale d'effacement RGPD (politique `off`), `LEGAL REVIEW REQUIRED` (textes `/legal/*`).
