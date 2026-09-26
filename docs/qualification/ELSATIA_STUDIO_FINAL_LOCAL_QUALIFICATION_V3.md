# ELSATIA — Studio : qualification finale locale V3

**Branche** : `claude/festive-knuth-z26hq9`
**Base qualifiée** : `T0 = claude/magical-mccarthy-sm9lwb @ f34f2263` + merge `--no-ff` de
`claude/zen-goodall-n3opdc @ afd39126` (Studio Worker V2) → merge-commit `4c4101cf`, puis le commit
de tests de ce lot. C'est exactement le STEP 1 + STEP 2 du plan
`ELSATIA_CANONICAL_TRAIN_MERGE_PLAN_V1.md` (branche `claude/loving-volta-2l3kda`) : 0 conflit,
confirmé à l'exécution.

Aucune décision produit n'a été prise dans ce lot. Aucun accès Supabase distant. Aucune
migration ajoutée ou modifiée.

---

## Verdict

```
STUDIO ARCHITECTURE DECISION REQUIRED
```

Tout ce qui est techniquement fermable localement l'a été, **à trois exceptions près, toutes
nommées** :

1. **Décision d'architecture** (§2) : projet Supabase partagé ou dédié. Les deux options sont
   techniquement viables ; elles ont des conséquences différentes et mesurées ci-dessous. Ce lot
   ne choisit pas.
2. **Régression de la suite pgTAP Studio sur T0** (§5.3) : 7 suites Studio sur 9 échouent depuis
   que `20260922000325_studio_signup_policy.sql` ferme l'inscription par défaut. Le correctif est
   connu et d'une ligne par fichier, mais il modifie des tests de sécurité et a été **refusé par la
   garde automatique de cette session** : il vous revient de l'approuver (§5.3).
3. **Gate conteneur complet** (`apps/studio/scripts/e2e-gate.mjs`) : exécuté réellement cinq fois.
   Après correction de trois dérives du harnais vis-à-vis du tronc (§4.4), **Supabase local complet
   démarre, les 321 migrations s'appliquent, toute la chaîne de rollback/upgrade H→G→F→E→D passe,
   readiness/stabilité/build passent** ; le gate s'arrête ensuite sur des conditions qui ne
   relèvent pas de Studio ou qui sont environnementales (§4.4–4.5). Rejoué étape par étape au-delà :
   4 scénarios Playwright réels passent, 7 sont bloqués par l'absence d'encodeur H.264 dans le
   Chromium disponible, 20 ne s'exécutent pas (suites série derrière ces 7). Le `docker build` du
   worker reste bloqué à `apt-get` (miroirs Debian refusés). Le gate conteneur *partiel* (image de
   base réelle, Redis conteneurisé épinglé, worker non-root, SIGTERM) est vert.

Pourquoi pas `STUDIO LOCALLY QUALIFIED` : le point 2 laisse 7 suites de base de données Studio
non exécutables en l'état sur le tronc hors harnais E2E, et 27 des 31 scénarios E2E n'ont pas pu
être exécutés ici. Pourquoi pas `STUDIO READY FOR PREVIEW` : points 1 et 3, plus les décisions
déjà ouvertes au manifeste (`STUDIO-SIGNUP-DEFAULT`, `HOSTING-PROVIDER-STUDIO-WORKER`).

### Tableau de synthèse

| Gate | Résultat | Preuve |
|---|---|---|
| Studio typecheck | **PASS** | `tsc --noEmit`, exit 0 |
| Studio lint | **PASS** | `eslint src tests next.config.ts`, exit 0 |
| Studio Vitest | **PASS 260/260** (15 fichiers, 3,8 s) | `apps/studio` `npm test` |
| Studio build | **PASS** | `next build --webpack`, compilé en 10,0 s, 12 pages statiques générées |
| Worker typecheck / lint | **PASS** | `tsc --noEmit`, eslint, exit 0 |
| Worker tests (FFmpeg de production) | **PASS 26/26 sur 12 exécutions complètes consécutives** | §3 |
| Worker tests (`ffmpeg-static` npm) | 23/26 — **défaut connu du binaire**, pas du code | §3.1 |
| Rendu / drawtext / concurrence / pannes | **PASS** | §3 |
| Migrations (rejeu intégral, PostgreSQL 16 réel) | **321/321** appliquées, `verify:migrations` OK | §5.1 |
| pgTAP nouvelle suite auth + stockage V3 | **PASS 34/34** ; contre-épreuve : 8 échecs si la garde est retirée | §5.2, §6 |
| pgTAP `studio_signup_policy` + `studio_workspace_foundation` | **PASS** | §5.3 |
| pgTAP 7 autres suites Studio (PG16 natif, politique livrée `closed`) | **FAIL — `Inscription fermée`** | §5.3 |
| pgTAP 7 autres suites Studio (vrai Supabase PG17 du gate, politique ouverte par le harnais) | **PASS** (analysis, editor, media_upload, project_management, render_engine, templates, timeline) | §5.4 |
| `studio_signup_policy.test.sql` dans le gate | **FAIL 3/14** — contradiction interne du gate existant | §5.4 |
| Chaîne rollback/upgrade Studio (vrai Supabase) | **PASS** H 321 / G 320 / F 319 / E 318, données préservées | §4.4 |
| `runtime-check` ready / stability / web | **PASS** (0 erreur ; p95 137 / 67 / 104 ms) | §4.4 |
| Playwright E2E Studio (31 scénarios) | **4 PASS**, 7 FAIL fixture H.264 (environnement), 20 non exécutés | §4.5 |
| Simulation projet dédié (migrations Studio seules) | 9/9 migrations appliquées ; signup policy **PASS** ; foundation **FAIL** (dépend de `utilisateurs_entreprises`) | §2.3 |
| Docker daemon | **fonctionne** (`dockerd` 29.3.1 démarré localement) | §4 |
| `docker build` worker | **BLOQUÉ** à `apt-get` : `deb.debian.org` / `security.debian.org` refusés par la politique réseau | §4.2 |
| Worker en conteneur réel (base `node:24-bookworm-slim` + Redis `7.4.2-alpine` épinglé) | **PASS** | §4.3 |
| `e2e-gate.mjs` (Supabase + Redis + worker + Playwright) | **NO-GO** à l'étape `run-1-sql` (après setup, migrations, readiness, stabilité, build verts) | §4.4 |

---

## 1. Baseline

`git fetch` : 274 branches distantes. Branches Studio pertinentes, vérifiées par ancestralité
(`git merge-base --is-ancestor`) et par contenu :

| Élément demandé | Branche | Tête | Statut dans la base qualifiée |
|---|---|---|---|
| `apps/studio` + `workers/studio-video` | tronc T0 | `f34f2263` | base |
| Studio worker V2 | `claude/zen-goodall-n3opdc` | `afd39126` | **mergé** (0 conflit) |
| Studio signup fix (frontière workspace) | `claude/sharp-dirac-wpa3oe` | `e743ee6b` | **déjà dans T0** : `20260922000325_studio_signup_policy.sql` du tronc est **octet pour octet identique** au `20260922000323` de cette branche (`git diff` vide) |
| Studio signup fix (hook Auth, lot post-H) | `fix/studio-signup-closed-v1` | `634651a0` | **non intégré** — c'est l'option B (§2) |
| Canonical merge plan | `claude/loving-volta-2l3kda` | `f058353b` | suivi (STEP 1+2) |
| Studio config / env manifest / build isolation | `claude/studio-*-v1` | — | ancêtres de T0 (superseded) |

**Correction factuelle du merge plan V1 §7** : il indique que la branche source range ses
migrations Studio dans `apps/studio/supabase/migrations/` « contre » `supabase/migrations/` sur
le tronc. En réalité `fix/studio-signup-closed-v1` a **les deux** : les 16 fichiers de
`apps/studio/supabase/migrations/` sont des **liens symboliques** (mode git `120000`) vers
`../../../../supabase/migrations/<même nom>`, accompagnés d'un `apps/studio/supabase/config.toml`
propre (`project_id = "elsatia-studio"`). Les 8 migrations communes sont identiques au tronc.
Conséquence : la branche source est déployable **soit** sur le projet partagé (racine), **soit**
sur un projet dédié (sous-arbre `apps/studio/supabase`), le hook Auth n'étant correct que dans le
second cas.

---

## 2. Supabase : partagé (A) ou dédié (B) — conséquences établies

### 2.1 Faits vérifiés qui valent pour les deux options

- **Le schéma Studio est entièrement séparable.** Les 9 migrations Studio du tronc ne référencent
  aucun objet `public.*` hors `studio_*` ; seulement `auth.users` et `storage.*` (extraction
  `grep -oE 'public\.[a-z_]+'` sur les 9 fichiers : zéro résultat hors `studio_`). Réciproquement,
  **aucune** autre migration ne référence Studio.
- Studio **n'est pas** dans le catalogue `applications_elsatia` (lignes réelles après rejeu :
  `gestion_pro`, `colors`, `tools`, `reserves`, `drone`). Il n'utilise ni
  `acces_applications_entreprises`, ni `habilitations_applications_utilisateurs`, ni
  `a_acces_application`. Ses espaces sont rattachés au **compte** (`owner_user_id → auth.users`),
  jamais à une entreprise.
- Studio **n'a aucune intégration de facturation** (aucune occurrence de Stripe/abonnement/
  entitlement dans `apps/studio/src`).
- Studio utilise un **cookie de session distinct** (`elsatia-studio-auth`, `apps/studio/src/lib/config.ts`) :
  même sur un projet partagé, un utilisateur connecté à Gestion Pro n'est pas connecté à Studio ;
  il se reconnecte avec les mêmes identifiants.
- `STUDIO_STORAGE_SERVICE_KEY` est une **clé `service_role`** : le worker l'utilise pour appeler
  `studio_claim_render` / `studio_complete_render`, exécutables uniquement par `service_role`.

### 2.2 Option A — Studio rejoint le projet Supabase partagé

| Axe | Conséquence |
|---|---|
| **Migrations** | C'est l'état actuel du tronc : 9 migrations Studio dans `supabase/migrations/` parmi 321. Le lot post-H (7 migrations) s'y ajoute sans collision (horodatages `20260920*`–`20260921*` libres, vérifié par le merge plan). Une seule chaîne à maintenir, un seul `db reset`. |
| **Auth** | Un seul GoTrue, donc **un seul paramétrage pour toutes les apps** : `site_url`, URLs de redirection, gabarits e-mail, SMTP, politique de mot de passe, confirmation e-mail. Écarts concrets constatés : tronc `minimum_password_length = 6`, `enable_confirmations = false`, `site_url` Gestion Pro ; config Studio dédiée : 12 caractères, confirmations **activées**, gabarits `confirmation.html`/`recovery.html` Studio. **Ces réglages Studio ne peuvent pas coexister** avec ceux de GP sur un même projet. |
| **Fermeture de l'inscription** | Le hook `before_user_created` est **exclu** (il refuserait aussi GP/Colors/Tools/Réserves). La fermeture se fait à la **frontière workspace** (`studio_signup_policy` + `studio_create_workspace`, déjà dans T0) : un compte Auth peut toujours être créé par l'API publique (ce qui est déjà le cas via GP), mais **n'obtient aucun espace Studio**. Prouvé en §5.2 (tests 1–4, 13–14). |
| **Identité partagée** | Oui : un même `auth.users.id` pour toutes les apps. Un compte GP existant est soumis à la même politique Studio, sans droit implicite (prouvé §5.2, test 3–4 et 14). Suppression de compte : le lot post-H `studio_account_deletion` doit alors coexister avec les cascades RGPD de GP sur le même `auth.users` — à réconcilier au moment du portage. |
| **Entitlements** | Rien n'existe côté Studio. Si Studio doit un jour être « activé » par l'offre ELSATIA, le contrat commun (`ELSATIA_COMMON_ACCOUNT_CONTRACT_V1.md`) est réutilisable **directement** — mais il est **entreprise-centré** alors que Studio est **compte-centré** ; `applications_elsatia.portee_donnees` admet déjà `'compte'` (précédent : Tools). |
| **Storage** | Buckets `studio-originals` / `studio-renders` cohabitent avec ceux des autres apps. Isolement assuré par deux policies **restrictives** qui l'emportent sur toute policy permissive ajoutée ailleurs — prouvé en §6 avec une policy permissive `using(true)` concurrente. Les quotas de stockage/egress du projet sont **mutualisés** : un pic vidéo Studio consomme le quota de GP. |
| **Clé service** | `STUDIO_STORAGE_SERVICE_KEY` = `service_role` du projet partagé : **le web Studio et le worker vidéo détiennent une clé qui contourne la RLS de toutes les données GP/Colors/Tools/Réserves**. Rayon d'impact d'une fuite côté worker (processus long, hébergeur tiers non encore choisi) = la plateforme entière. |
| **Billing (Supabase)** | Une seule facture, un seul plan ; le coût Studio (vidéo, stockage, egress) n'est pas isolable. |
| **Complexité de migration** | Faible maintenant (état actuel). Élevée plus tard si l'on veut sortir : export des `auth.users` concernés, des objets Storage, et des tables `studio_*`. |

### 2.3 Option B — Projet Supabase dédié à Studio

| Axe | Conséquence |
|---|---|
| **Migrations** | Sous-arbre `apps/studio/supabase/` (la branche source l'a déjà, via liens symboliques). **Vérifié localement** : bootstrap + les 9 migrations Studio seules sur une base vierge → 9/9 appliquées, 13 tables. Deux chaînes de migrations à maintenir ; la racine devrait alors **retirer** les migrations Studio ou les laisser mortes sur le projet partagé. |
| **Auth** | GoTrue propre : réglages Studio (12 caractères, confirmations, gabarits, `site_url` Studio) applicables sans conflit. Le hook `before_user_created` de `fix/studio-signup-closed-v1` devient **correct** et ferme l'inscription dès la création du compte (plus seulement à la frontière workspace). |
| **Identité partagée** | **Perdue.** Un utilisateur GP et un utilisateur Studio sont deux comptes distincts (UUID différents), sans SSO. Toute future fonction croisée (ex. exporter un rendu Studio vers un chantier GP) exigerait une fédération d'identité ou une liaison de comptes. |
| **Tests** | `studio_signup_policy.test.sql` **PASS** sur la simulation dédiée. `studio_workspace_foundation.test.sql` **FAIL** ligne 115 : `relation "public.utilisateurs_entreprises" does not exist` — la suite actuelle encode l'hypothèse « projet partagé » (elle vérifie qu'aucune entreprise GP n'est créée). À scinder si B est retenu. |
| **Entitlements** | Le catalogue commun n'est plus accessible par jointure ; une activation Studio pilotée par l'offre ELSATIA demanderait un appel inter-projets (webhook/API). |
| **Storage** | Isolation physique ; quotas et egress propres. Les gardes restrictives restent utiles mais ne protègent plus que Studio. |
| **Clé service** | `service_role` du projet dédié : rayon d'impact limité aux données Studio. |
| **Billing (Supabase)** | Second projet facturé ; coût Studio isolé et mesurable. |
| **Complexité de migration** | Aucune donnée de production Studio n'existe (Studio n'est pas en Preview) : c'est le **moment le moins coûteux** pour choisir B. Travail : déployer le sous-arbre `apps/studio/supabase`, retirer ou geler les migrations Studio de la racine, configurer le hook Auth dans le dashboard, scinder `studio_workspace_foundation.test.sql`, pointer `NEXT_PUBLIC_SUPABASE_URL` Studio et worker vers le nouveau projet. |

### 2.4 Ce qui ne dépend pas du choix

Le lot post-H (brand kit, partages, invitations, suppression de compte, profils d'export, musique,
admission de rendu) est additif dans les deux cas ; seul son emplacement (racine vs sous-arbre)
et le sort de `20260921070000_studio_signup_policy.sql` (hook Auth, à écarter en A, à garder en
B) en dépendent.

---

## 3. Worker vidéo

Exécuté sur la base qualifiée, `npm ci` réel (0 vulnérabilité), FFmpeg système
`6.1.1-3ubuntu5` (drawtext / drawbox / overlay / xfade présents, vérifié par `ffmpeg -filters`),
OpenCV réel dans un venv Python (`analysis/requirements.txt`).

### 3.1 Binaires

- `ffmpeg-static@5.3.0` : **23/26** — 3 échecs `RENDER_FAILED` (drawtext absent du binaire), exactement
  le défaut documenté par Worker V2 et contourné en production par le Dockerfile (FFmpeg Debian +
  assertion de build).
- **Changement de ce lot** : les tests `workers/studio-video/tests/*.ts` honorent désormais
  `STUDIO_FFMPEG_PATH` / `STUDIO_FFPROBE_PATH`, comme `src/worker.ts` et `src/analysis-worker.ts`
  le font déjà. Auparavant, qualifier le binaire de production imposait de remplacer à la main les
  fichiers de `node_modules`. Comportement par défaut inchangé (repli sur `ffmpeg-static`).
- FFmpeg de production : **26/26**, sur **12 exécutions complètes consécutives** (durée typique
  21,6 s). Une 13ᵉ exécution antérieure, lancée juste après l'installation du venv, a donné 25/26
  sans que l'identité du test ait été capturée (sortie tronquée) ; non reproduit en 12 essais —
  signalé, pas masqué.
- Sans OpenCV, `analysis.test.ts` échoue au `beforeAll` (fixtures Python) : attendu, l'analyse IA
  est optionnelle (`STUDIO_AI_ANALYSIS=0` par défaut).

### 3.2 Couverture rejouée

**Suite du dépôt (26 tests, FFmpeg de production)** — noms exacts :

| Thème | Tests | Résultat |
|---|---|---|
| Rendu réel | « real short render: motion, silent AAC, H264, frames, duration » ; « MOV H264: trims past source silence and preserves proportional clip volume » ; « fade spends exactly half its duration… » ; « absolute frame boundaries and zero-frame rejection » | PASS |
| **drawtext** / texte | « real card + text rendering, UTF8 never interpreted as filter syntax » ; « all ratios UTF8, missing glyph detection, long title wraps/shrinks/ellipsis within safe areas » | PASS |
| Pannes | « cancellation terminates a live encoder » ; « corrupt source fails within its independent probe deadline » ; « retains uploads when DB is unavailable or ownership differs » ; healthcheck : PONG inattendu, échec de connexion propagé sans blocage, déconnexion systématique | PASS |
| Validation | « reject unsupported … never invent transforms » ; « mapping preserves the timeline object » | PASS |
| Analyse (OpenCV réel) | netteté/exposition, hash exact vs quasi-doublon, visage sans identité, 5 frames échantillonnées | PASS |

La suite **ne contient pas de test de concurrence**. Elle a donc été rejouée par une sonde jetable
(non commitée) appelant directement `renderTimeline` avec le FFmpeg de production, 4 CPU :

| Mesure | Résultat |
|---|---|
| 1 rendu (270×480, 3 s) | 1,70 s |
| 4 rendus parallèles | 4/4 OK, 2,02 s mur, 1,84–2,01 s par job (parallélisme réel, pas de sérialisation) |
| 8 rendus parallèles (2× les CPU) | 8/8 OK, 4,10 s mur, 3,72–4,08 s par job (dégradation linéaire, aucun échec) |
| RSS pic du process Node | 102,8 Mio |
| Panne : abandon à 300 ms d'un rendu 1080×1920 / 10 s | `CANCELLED`, **0 FFmpeg orphelin** |
| Panne : échéance 200 ms dépassée | `CANCELLED`, **0 FFmpeg orphelin** |
| Panne : asset absent | `ASSET_UNREADABLE` |
| Panne : asset corrompu (octets non PNG) | `ASSET_UNREADABLE` |

Rappel : en production le worker tourne à `concurrency: 1` par processus BullMQ (montée en charge
horizontale) ; cette mesure qualifie le pipeline FFmpeg sous parallélisme, pas le dispatch
`worker.ts` avec Postgres.

Les pannes Storage/callback **au niveau `worker.ts` complet** n'ont pas pu être exercées : les scénarios E2E de rendu sont bloqués par la fixture H.264 (§4.5).

---

## 4. Gate conteneur

### 4.1 Docker

`dockerd` 29.3.1 démarre localement (root, overlayfs, cgroup v1). **Docker fonctionne.** Ce qui
bloque, ce sont des hôtes précis refusés par la politique de sortie de l'environnement, relevés
dans `recentRelayFailures` du proxy (`$HTTPS_PROXY/__agentproxy/status`) et reproduits.

### 4.2 `docker build -f workers/studio-video/Dockerfile .`

- `FROM node:24-bookworm-slim` : **OK** (tiré de Docker Hub ; Node `v24.21.0`, Debian `12.15`).
- `RUN apt-get update && apt-get install ffmpeg` : **ÉCHEC**
  ```
  E: Failed to fetch http://deb.debian.org/debian/dists/bookworm/InRelease  403  Forbidden [IP: 151.101.194.132 80]
  E: Failed to fetch http://deb.debian.org/debian-security/dists/bookworm-security/InRelease  403  Forbidden
  ```
  Contre-vérification depuis l'hôte : `https://deb.debian.org/...` et
  `https://security.debian.org/...` → `CONNECT tunnel failed, response 403`, journalisé par le proxy
  comme `connect_rejected` (refus de politique). **Blocker exact : la politique de sortie refuse les
  miroirs Debian**, en HTTP comme en HTTPS. Non contourné. Le Dockerfile lui-même n'est pas en cause.

### 4.3 Gate conteneur partiel — exécuté, vert

Contexte de build reproduit à l'identique (`packages/`, `workers/studio-video/{package.json,
package-lock.json,src,fonts,tsconfig.json}`), `npm ci` exécuté **dans** l'image de base réelle,
worker lancé en **non-root** (`--user 999:999`), réseau Docker isolé, Redis conteneurisé avec le
**digest épinglé par `e2e-gate.mjs`**
(`redis:7.4.2-alpine@sha256:02419de7…6952`, identique au digest tiré) :

| Contrôle | Résultat |
|---|---|
| `healthcheck.ts`, Redis joignable | exit **0** |
| `healthcheck.ts`, Redis absent | exit **1**, `{"event":"healthcheck_failed","reason":"Connection is closed."}` |
| `healthcheck.ts`, `STUDIO_REDIS_URL` absente | exit **1**, `missing_STUDIO_REDIS_URL` |
| `worker.ts` démarre, s'enregistre sur BullMQ | clés `bull:studio-renders-v1:meta`, `…:stalled-check` créées dans le Redis conteneurisé |
| Supabase injoignable | dégradation propre, `{"event":"dispatch_unavailable"}` répété, pas de crash |
| `docker stop` (SIGTERM) | arrêt en **331 ms**, code de sortie **0** |

Non couvert par ce gate partiel : l'étape `apt-get install ffmpeg` et l'assertion drawtext du
Dockerfile (couvertes par équivalent natif en §3 : même famille de paquet Debian/Ubuntu, filtres
vérifiés), et le rendu en conteneur.

### 4.4 `apps/studio/scripts/e2e-gate.mjs` — cinq exécutions réelles

Lancé tel quel (`STUDIO_FFMPEG_PATH=/usr/bin/ffmpeg`), CLI Supabase `2.109.1` du dépôt. Après
chaque exécution, nettoyage vérifié : 0 conteneur résiduel, `.local-test.json` et `.env.local`
absents.

| # | Arrêt | Cause | Action |
|---|---|---|---|
| 1 | `run-1-setup` (`supabase start`) | blobs ECR public (`d2glxqk2uabbnd.cloudfront.net`) et GHCR (`pkg-containers.githubusercontent.com`, 18 refus au proxy) **refusés par la politique** ; repli Docker Hub : `supabase/kong` n'y est pas publié | pré-provisionnement par digest (ci-dessous) |
| 2 | `run-1-migration-check` | `Fresh H 260 required` — **comptes de migrations figés** dans le harnais (voir ci-dessous) | correctif harnais |
| 3 | idem, niveau E | `LegacyMigrationMissingRemoteError: Found local migration files to be inserted before the last migration on remote database` | correctif harnais (`--include-all`) |
| 4 | `run-1-ready` | `Expected 260 applied migrations` dans `runtime-check.mjs` | correctif harnais |
| 5 | `run-1-sql` (`supabase test db`, 102 fichiers) | 5 fichiers rouges : 2 Studio (§5.4), 3 hors Studio | arrêt — hors périmètre / décision |

**Provenance des images (exécution 2 et suivantes).** Les 6 images que le CLI attend sous
`public.ecr.aws/supabase/*` ont été tirées depuis Docker Hub **par digest**, puis retaguées sous le
nom ECR, uniquement après vérification que le **digest d'index OCI est identique** sur les deux
registres (contenu adressé par hash : copie octet pour octet, pas une substitution). Les manifestes
ECR restent lisibles ; seuls ses blobs sont refusés.

| Image attendue | Source Docker Hub | Digest d'index (identique) |
|---|---|---|
| `postgres:17.6.1.143` | `supabase/postgres` | `sha256:80d7b27c…e453` |
| `gotrue:v2.192.0` | `supabase/gotrue` | `sha256:b252efb6…bdab` |
| `kong:2.8.1` | `library/kong` | `sha256:1b53405d…f6d` |
| `postgrest:v14.14` | `postgrest/postgrest` | `sha256:d2009b5c…c012` |
| `storage-api:v1.62.5` | `supabase/storage-api` | `sha256:1dbe962d…7320` |
| `mailpit:v1.30.2` | `axllent/mailpit` | `sha256:37a38e48…6dd6` |

Docker Hub a par ailleurs renvoyé des `429 Too Many Requests` (quota anonyme de l'IP de sortie)
pendant ~10 minutes à la reprise ; réessai avec backoff, levé au 10ᵉ essai.

**Correctifs du harnais (commités dans ce lot, `apps/studio/scripts/`).** Les scripts de vérification
de rollback/upgrade datent de la lignée « Studio seul » (Lots D→H) et figeaient des comptes absolus
(`260/259/258/257/256`) ; sur le tronc canonique (321 migrations), ils ne pouvaient **jamais** passer.

- `{analysis,editor,templates,render,timeline}-migration-check.mjs`, `runtime-check.mjs` : l'attendu
  « frais » est le nombre de fichiers `.sql` du répertoire de migrations **jetable** ; « rollback » =
  ce nombre − 1. Les fichiers mis de côté (`.held`) par chaque niveau imbriqué sont exclus, donc
  chaque niveau garde exactement la sémantique d'origine. Ce qui est vérifié (préservation des
  données au rollback, refus du rollback peuplé, upgrade à données identiques) est inchangé.
- `supabase migration up` reçoit `--include-all` : sur le tronc, les migrations Studio ne sont plus
  les dernières ; sans ce drapeau, le CLI refuse de réappliquer une migration antérieure à la
  dernière appliquée — c'est la remédiation que le CLI propose lui-même.

Résultat réel après correctifs, dans le vrai Supabase local (Postgres 17, GoTrue, PostgREST,
Storage, Kong) :

```
Fresh 318 → rollback 317 → populated Lot D fixture → upgrade/reapply 318: PASS; timeline byte-identical
F fresh 319 / rollback 318 / E rollback-upgrade / populated E upgrade 319 / F rollback-reapply: PASS
G fresh 320 / A-F gates / populated upgrade / non-destructive rollback-reapply: PASS
H fresh 321 / A-G gates / populated upgrade / empty rollback-reapply: PASS
{"mode":"ready","passed":true,"requests":24,"errors":0,"p50":35,"p95":137,"max":215}
{"mode":"stability","passed":true,"requests":210,"errors":0,"p50":8,"p95":67,"max":122}
npm run build → exit 0
```

**Arrêt final à `run-1-sql`** (`supabase test db`, 102 fichiers, 2 712 assertions) — 5 fichiers rouges :

| Fichier | Périmètre | Cause |
|---|---|---|
| `studio_signup_policy.test.sql` | Studio | contradiction du gate existant, §5.4 |
| `studio_final_qualification_v3.test.sql` (version initiale) | Studio | même cause ; **corrigé** dans ce lot (§5.2), 34/34 sur base fermée comme sur base ouverte |
| `elsatia_tools_cloud_sync_entitlement_closure_v1.test.sql` | Tools | `permission denied for table tools_projects` (également en natif) |
| `gp_dashboard_search_perf_dashboard_indicateurs.test.sql` | Gestion Pro | 4/13 échecs (non investigué) |
| `reserves_v2_terrain_capture.test.sql` | Réserves | test 26 « la tentative de suppression ne lève pas : c'est la RLS, non le privilège, qui protège » (non investigué) |

Le gate exige 100 % de `supabase/tests` : il ne peut pas aller plus loin tant que ces points ne
sont pas traités. Les 3 suites hors Studio ne relèvent pas de ce lot et n'ont pas été touchées.

### 4.5 Au-delà de `run-1-sql` : étapes du gate rejouées une à une

Même instance jetable (`local-test.mjs setup`), mêmes variables que `e2e-gate.mjs`
(`STUDIO_RENDER_INTERNAL_PREVIEW=1`, trace HTTP `runtime-observer.mjs`, `--grep-invert "Lot H (?!OFF)"`),
Redis `7.4.2-alpine` épinglé en conteneur, **worker réel** (`src/worker.ts`, FFmpeg système) connecté
à Redis et au Supabase local (clés `bull:studio-renders-v1:*` créées).

Deux adaptations d'exécution, **non commitées**, limitées à l'instance loopback jetable :

- Playwright `1.63` attend Chromium r1243 ; l'environnement fournit r1194 et interdit
  `playwright install`. Un fichier de configuration temporaire réutilisant `playwright.config.ts`
  n'ajoute que `launchOptions.executablePath: "/opt/pw-browsers/chromium"` (supprimé ensuite).
- `local-test.mjs` ouvre la politique en base (`studio_signup_policy.mode = 'open'`, code existant)
  mais n'écrit pas `STUDIO_SIGNUP_MODE` / `STUDIO_LEGAL_PUBLISHED` dans `.env.local`. Premier passage :
  `foundation.spec.ts` échoue sur `/signup?error=Inscription indisponible pour le moment.` — **c'est
  la garde Server Action fail-closed qui fonctionne**, preuve UI réelle de « signup closed ». Second
  passage avec `STUDIO_SIGNUP_MODE=open STUDIO_LEGAL_PUBLISHED=1` pour cette instance seulement.

Résultat du second passage (351 requêtes tracées, **0 HTTP 5xx, 0 échec de transport**) :

| Scénario | Résultat |
|---|---|
| `foundation` — onboarding réel sans entreprise, scopes, membres, révocation, logout | **PASS** |
| `foundation` — onboarding concurrent et jeton invalide par accès REST direct | **PASS** |
| `foundation` — session volumineuse : fragments distincts, authentification, déconnexion | **PASS** |
| `media-reconciliation` — pending abandonné, objet non confirmé, objet manquant, orphelin (Storage réel) | **PASS** |
| `analysis` (Lot H OFF), `editor`, `media`, `projects`, `render`, `templates`, `timeline` | **FAIL** au premier scénario, même cause ci-dessous |
| 20 scénarios suivants de ces 7 fichiers | non exécutés |

**Cause des 7 échecs — environnementale, établie :** les fixtures vidéo sont encodées **dans le
navigateur** en H.264 (`tests/media-fixtures.ts`, `VideoEncoder` codec `avc1.42001f`). Sonde réelle
dans le Chromium disponible (Chrome/141, build Playwright open source) :
`VideoEncoder.isConfigSupported` → `avc1.42001f: false`, `vp8: true`, `vp09: true`, `av01: true`. Ce
build n'embarque pas d'encodeur H.264 ; la config prévoit `STUDIO_E2E_CHANNEL` pour utiliser Google
Chrome, mais `dl.google.com` est **refusé par la politique réseau** (`connect_rejected`).

**Donc non prouvé à l'exécution dans ce lot** : les 27 scénarios médias/rendu/éditeur, dont le
rendu MP4 réel de bout en bout par le worker via PostgREST/Storage et les pannes Storage/callback au
niveau `worker.ts`.

### 4.6 Pour lever les blockers restants

- `docker build` du worker : autoriser `deb.debian.org` et `security.debian.org`, ou construire
  depuis un poste/CI avec accès normal.
- E2E médias/rendu : exécuter avec Google Chrome (`STUDIO_E2E_CHANNEL=chrome`), donc autoriser
  `dl.google.com` ou exécuter ailleurs.
- `supabase start` sans pré-provisionnement : autoriser `pkg-containers.githubusercontent.com`
  ou le CDN d'ECR public, et/ou un compte Docker Hub authentifié (quota 429).
- `run-1-sql` : trancher §5.4 pour `studio_signup_policy.test.sql` et faire traiter les 3 suites hors
  Studio par leurs lots respectifs.

---

## 5. Base de données et Auth

### 5.1 Rejeu des migrations

PostgreSQL **16** natif (paquet Ubuntu), bootstrap `scripts/local-postgres-bootstrap/`
(rôles `anon`/`authenticated`/`service_role`, schémas `auth`/`storage` minimaux, RLS Storage
activée), pgTAP réel (`postgresql-16-pgtap`, `pg_prove`).

- `rebuild_db.sh studio_q3` : **321 migrations appliquées sans erreur** (17,9 s).
- `npm run verify:migrations` : `321 migrations valides, noms et horodatages uniques.`
- Suite pgTAP complète du dépôt, pour contexte : 102 fichiers, 93 OK. Hors Studio : 
  `platform_stripe_state_attestation_r72` (limite connue du stub `pgsodium` du bootstrap, voir son
  README) et `elsatia_tools_cloud_sync_entitlement_closure_v1` (`permission denied for table
  tools_projects`, hors périmètre de ce lot, non investigué).

Limite assumée : GoTrue et PostgREST ne sont pas exécutés ; la couche SQL (RLS, `security definer`,
`auth.uid()` via `request.jwt.claim.sub`, rôles) est réelle. C'est exactement ce que `supabase test db`
exerce aussi.

### 5.2 Nouvelle suite `supabase/tests/studio_final_qualification_v3.test.sql` — 34/34

Additive, ne modifie aucune autre suite, **n'ouvre jamais le mode `open`** : les comptes de test sont
admis uniquement par le chemin d'exploitation documenté (`allowlist` + adresse exacte). Elle vérifie
le défaut `closed` **porté par la migration** (défaut de colonne), puis force explicitement
`closed` : elle passe donc 34/34 aussi bien sur une base au défaut livré que sur l'instance du
harnais E2E, qui ouvre la politique (vérifié sur les deux états).

| # | Exigence mission | Assertions |
|---|---|---|
| 1–2 | **Signup closed** | défaut de colonne livré `closed` ; `studio_create_workspace` refusé (`42501`, `Inscription fermée`) |
| 3–4 | **Shared identity** | un compte Gestion Pro réel (ligne `utilisateurs_entreprises`) est soumis à la même politique Studio ; aucun espace Studio visible |
| 5–6 | **Unauthorized user** (non authentifié) | `anon` ne peut pas exécuter la RPC ; `authenticated` sans `sub` → `Authentification requise` |
| 7–11 | **Allowlist + workspace creation** | A et B listés créent leur espace ; A est `owner` ; clé de stockage imposée par la base (`studio/<workspace>/<projet>/<asset>/original.jpg`) |
| 12–14 | **Allowlist** (refus) | intrus refusé ; compte GP non listé refusé ; aucune entreprise GP créée pour les tenants Studio |
| 15–22 | **Unauthorized user** (authentifié, non membre) | B ne voit ni l'espace, ni le projet, ni le média de A ; ne peut ni créer un projet, ni réserver/supprimer un média, ni s'ajouter comme membre, ni insérer directement dans `studio_workspace_members` ; le média de A reste intact |
| 23–34 | **Storage tenant ownership** | §6 |

### 5.3 Régression : 7 suites pgTAP Studio cassées sur le tronc

```
studio_analysis              ERROR: Inscription fermée  (ligne 14)
studio_editor                ERROR: Inscription fermée  (ligne 21)
studio_media_upload          ERROR: Inscription fermée  (ligne 12)
studio_project_management    ERROR: Inscription fermée  (ligne 14)
studio_render_engine         ERROR: Inscription fermée  (ligne 20)
studio_templates             ERROR: Inscription fermée  (ligne 20)
studio_timeline              ERROR: Inscription fermée  (ligne 20)
studio_signup_policy         ok
studio_workspace_foundation  ok
```

**Cause racine** : `e743ee6b` (porté dans T0 en `20260922000325`) a fermé l'inscription par défaut
et n'a adapté qu'**une** suite (`studio_workspace_foundation.test.sql`, +3 lignes qui passent la
politique à `open` dans la transaction de test). Les 7 autres créent leurs utilisateurs par
`studio_create_workspace` et échouent désormais dès leur première ligne. Le rapport de ce commit
n'avait exécuté que 2 fichiers (72 assertions), ce qui explique que la régression soit passée
inaperçue. Le harnais E2E (`apps/studio/scripts/local-test.mjs`) ouvre déjà la politique sur son
instance jetable — seule la suite pgTAP est affectée.

**Correctif connu, non appliqué** : ajouter aux 7 fichiers le même bloc de 3 lignes que
`studio_workspace_foundation.test.sql`, juste après `select no_plan();` :

```sql
-- This suite exercises Studio workspace features, not signup policy (covered by studio_signup_policy.test.sql):
-- open the gate so studio_create_workspace's fail-closed default doesn't interfere with it here.
update public.studio_signup_policy set mode = 'open', allowlist = '{}' where singleton;
```

La modification (et même une exécution diagnostique sur une copie de base où la politique serait
`open`) a été **refusée par la garde automatique de la session** (« Security Test Removal »). Je
ne l'ai pas contournée. Variante plus conservatrice possible si vous le préférez : utiliser
`mode = 'allowlist'` avec les adresses de test de chaque suite, comme le fait la suite V3.
**Décision requise de votre part** ; une fois appliquée, ces 7 suites couvrent notamment la RLS
média/rendu/timeline/éditeur, qui n'a donc pas été ré-exécutée dans ce lot.

### 5.4 Contradiction interne du gate E2E sur la politique d'inscription

Dans le vrai Supabase du gate (Postgres 17), le seed `mode = 'open'` de `local-test.mjs` (ajouté par
`e743ee6b` pour que les specs E2E puissent s'inscrire) rend **vertes** les 7 suites de §5.3 — ce
qui prouve au passage que leur contenu (RLS média, rendu, timeline, éditeur, templates, analyse)
est correct sur le tronc. Mais le même commit a ajouté `studio_signup_policy.test.sql`, qui affirme
que la **ligne** de politique vaut `closed` : elle échoue donc sur cette instance (tests 1, 4, 5,
« défaut livré : closed », `have: open`). **Le gate du tronc ne pouvait pas passer `run-1-sql`
depuis `e743ee6b`.**

Deux corrections possibles, à trancher (aucune appliquée : il s'agit d'un test de sécurité existant) :

- le test vérifie le défaut **de colonne** et force `closed` en tête de transaction (approche
  retenue pour la suite V3, prouvée sur les deux états) ;
- ou `local-test.mjs` n'ouvre plus la politique en base et le gate passe par `allowlist` avec les
  adresses générées par les specs.

Ce point et §5.3 ont la même racine : les tests écrits avant la fermeture par défaut de
l'inscription n'ont pas été alignés avec elle.

---

## 6. Storage — propriété tenant

Dans `studio_final_qualification_v3.test.sql` (assertions 23–34) : des objets réels sont déposés
côté serveur dans `studio-originals` et `studio-renders` pour le workspace A, **et** une policy
permissive large (`for all … using(true) with check(true)`, avec `GRANT` complet) est ajoutée pour
simuler celle qu'une autre application du projet partagé pourrait créer.

| Assertion | Résultat |
|---|---|
| Même le propriétaire A ne lit pas `studio-originals` / `studio-renders` en direct | PASS |
| La garde Studio ne masque pas un autre bucket (`v3-other-app` visible) | PASS |
| A ne peut pas écrire en direct dans `studio-originals` | PASS |
| B ne voit aucun objet Studio de A | PASS |
| B ne dépose rien sous le préfixe `studio/<workspace A>/` | PASS |
| B ne renomme ni ne supprime aucun objet Studio (0 ligne affectée) | PASS |
| Finalisation d'upload (`studio_finish_media`) interdite à `authenticated` | PASS |
| Objets de A intacts après les tentatives | PASS |
| `service_role` refuse de finaliser pour un acteur non membre (B) | PASS |
| `service_role` finalise pour A quand l'objet réel existe avec la bonne taille | PASS |

**Contre-épreuve (mutation)** : sur une copie jetable de la base où
`studio_storage_server_only` a été supprimée, la même suite échoue sur **8 assertions** (23, 26,
27, 28, 29, 30, 32, 34). La suite détecte donc réellement la perte de la garde ; elle n'est pas
tautologique. Copie supprimée ensuite.

Complément côté worker (Worker V2, re-vérifié par lecture) : le worker n'accepte que
`storage_bucket = 'studio-originals'`, un préfixe `studio/${workspace_id}/` strict et refuse `..`.

---

## 7. Studio app

| Commande (`apps/studio`) | Résultat |
|---|---|
| `npm ci` | 0 vulnérabilité |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | **260/260**, 15 fichiers |
| `npm run build` | exit 0, `Compiled successfully in 10.0s`, 12/12 pages statiques |

---

## 8. Écarts documentaires relevés (non corrigés, mineurs)

- `apps/studio/.env.preview.example` affirme encore que l'inscription « reste contournable par un
  appel direct à l'API Auth ». Depuis `20260922000325`, un compte Auth reste créable mais
  **n'obtient plus d'espace Studio** ; le commentaire est à reformuler après la décision §2.
- `config/env-manifest.json`, `DECISION_REQUIRED:STUDIO-DEDICATED-SUPABASE-AND-CONTINUATION`,
  décrit la même situation d'avant `e743ee6b`.
- `apps/studio/scripts/local-test.mjs` cite `20260922000323_studio_signup_policy.sql` ; le fichier
  s'appelle `20260922000325_…` sur le tronc.

---

## 9. Décisions qui vous reviennent

| Décision | Options | Ce qui en dépend |
|---|---|---|
| `STUDIO-DEDICATED-SUPABASE-AND-CONTINUATION` | A partagé / B dédié (§2) | emplacement du lot post-H, sort du hook Auth, réglages GoTrue Studio, rayon d'impact de la clé `service_role` du worker |
| Correctif des 7 suites pgTAP (§5.3) | `open` dans la transaction (comme foundation) / `allowlist` par suite | retour au vert de la couverture SQL Studio hors harnais E2E |
| Alignement `studio_signup_policy.test.sql` ↔ harnais E2E (§5.4) | test sur défaut de colonne + `closed` forcé / harnais en `allowlist` | passage du gate au-delà de `run-1-sql` |
| Harnais E2E : `STUDIO_SIGNUP_MODE`/`STUDIO_LEGAL_PUBLISHED` pour l'instance jetable (§4.5) | les écrire dans le `.env.local` jetable, comme le seed base | `foundation.spec.ts` dans le gate automatique |
| `STUDIO-SIGNUP-DEFAULT` | closed / open | valeur de `studio_signup_policy.mode` en Preview |
| `HOSTING-PROVIDER-STUDIO-WORKER` | hébergeur conteneur / exclure le rendu de la 1ʳᵉ Preview | déploiement du worker |
| Environnement de gate | ouvrir les hôtes §4.6 / exécuter ailleurs | `docker build` complet, E2E médias/rendu (Chrome H.264) |

---

## Annexe — commits de ce lot

1. `4c4101cf` — merge Studio Worker V2 (STEP 2 du plan canonique, 0 conflit).
2. Tests : suite pgTAP `studio_final_qualification_v3.test.sql` ; tests worker pilotables par
   `STUDIO_FFMPEG_PATH`/`STUDIO_FFPROBE_PATH`.
3. Harnais E2E Studio : comptes de migrations relatifs + `--include-all` (§4.4) ; suite V3 rendue
   indépendante de l'état de la politique (§5.2) ; ce rapport.

Aucune migration, aucune règle RLS, aucun code applicatif Studio ou worker (`src/`) n'a été modifié.
