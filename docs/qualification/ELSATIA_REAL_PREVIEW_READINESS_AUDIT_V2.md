# ELSATIA — Audit de préparation à une vraie Preview (V2)

Mission : audit autonome, nocturne, sans disponibilité humaine. **Aucun déploiement. Aucune
écriture Supabase. Aucune migration distante. Aucune modification Stripe. Aucune action
Production.** Tout ce document est produit par lecture de dépôt (git, fichiers versionnés) et par
relecture croisée des rapports de qualification déjà présents dans ce dépôt. Aucun accès
Vercel/Supabase/Stripe réel n'a existé à aucun moment de cet audit.

## 0. Correction de périmètre et méthode

**Correction reçue en cours de mission (à consigner, pas à cacher)** : cet audit a démarré sur
`origin/integration/gp-external-pilot-closure-v1` comme branche de référence. Une correction
explicite a établi que cette branche est un ancien lot **mono-application** (Gestion Pro
uniquement — aucun répertoire `apps/`, `package.json` nommé `elsatia-gestion-pro` sans
`workspaces`), antérieur à l'éclatement multi-app, et qu'elle ne représente pas l'état actuel de
l'écosystème. Vérifié indépendamment (git plumbing, sans supposition) : `gp-external-pilot-closure-v1`
n'est ancêtre d'aucune des deux branches proposées comme référence réelle.

**Référence retenue pour cet audit** : `origin/claude/ecstatic-gauss-xrxf98`
(HEAD `389f7f7`, 2026-09-21 21:17 UTC), qui descend de `origin/claude/compassionate-euler-5j6avr`
(HEAD `f5a9e44`, 2026-09-21 18:12 UTC). Toutes les affirmations de ce rapport portent sur cette
référence sauf mention contraire explicite. Les anciens trains (`gp-external-pilot-closure-v1`,
`integration/elsatia-ecosystem-train-v3-*`, etc.) ne sont cités que comme sources historiques.

**Découverte méthodologique majeure** : ce dépôt contient déjà, à la même référence, un journal de
qualification interne très détaillé et honnête —
`docs/qualification/ELSATIA_GP_CONVERGENCE_TRAIN_V1_REPORT.md` (2472 lignes, §0 à §25, produit par
plusieurs sessions successives sur la même branche), plus
`docs/qualification/ELSATIA_SECURITY_BLOCKERS_REMEDIATION_V1.md` et
`docs/qualification/ELSATIA_ENV_MANIFEST_AND_CI_V1.md`. Ce travail utilise déjà les conventions
`DECISION_REQUIRED` et `NOT_PROVEN_REMOTE` et conclut, à son dernier point de qualification exacte
(SHA `d4b9c79`, §24.11) : **`PREVIEW DEPLOYMENT CANDIDATE`**, explicitement jamais
`PREVIEW QUALIFIED`, faute d'environnement Preview réel atteint. Le présent audit **ne refait pas
ce travail** (répliquer 2500 lignes de preuves locales serait un doublon coûteux et moins fiable
qu'une relecture) : il le vérifie par sondage, le complète là où il s'arrête (portage effectif du
tip `ecstatic-gauss-xrxf98`, angle "Preview" spécifiquement plutôt que "correction du train"), et
en tire les blockers P0/P1 et la checklist demandés par la mission.

**État du portage au HEAD réel** (§25 du rapport interne, vérifié indépendamment par git
plumbing — `git merge-base --is-ancestor`) : `ecstatic-gauss-xrxf98` = `compassionate-euler-5j6avr`
+ 10 commits cherry-pickés sans conflit (chaîne unique portant les 5 lots
`studio-env-manifest-fix-v1` → `studio-runtime-config-wiring-v1` → `studio-build-isolation-v1` →
`tools-reserves-postcss-isolation-v1` → `reserves-turbopack-sentry-isolation-v1`) + 1 commit de
documentation (§25 lui-même). **Le rapport interne le dit lui-même explicitement : la vérification
post-convergence de ce portage (§25.5) est marquée « à compléter », non exécutée au HEAD actuel.**
C'est un point d'attention repris en §7 ci-dessous — confirmé indépendamment par un audit
dédié : le contenu des 5 lots (isolation PostCSS Studio/Tools/Reserves, câblage `STUDIO_ENABLED`,
correctif du manifeste ENV Studio) est bien présent fichier par fichier sur ce HEAD, mais
`git merge-base --is-ancestor <branche-source> ecstatic-gauss-xrxf98` retourne `NOT_MERGED` pour
plusieurs d'entre elles (portage par cherry-pick, pas par fusion — attendu, pas un défaut).

---

## 1. Configurations Preview réellement présentes

### 1.1 Architecture — 5 applications indépendantes, pas un monorepo à outillage partagé

| App | Emplacement | Package | Port dev | `vercel.json` en dépôt | Build |
|---|---|---|---|---|---|
| Gestion Pro | racine du dépôt | `elsatia-gestion-pro` | défaut | ✅ (`regions: fra1`, 2 crons) | Turbopack (défaut Next 16) |
| Colors | `apps/colors` | `elsatia-colors` | 3010 | ❌ absent | webpack |
| Reserves | `apps/reserves` | `elsatia-reserves` | 3020 | ✅ (`regions: fra1`, 1 cron) | webpack |
| Tools | `apps/tools` | `elsatia-tools` | 3020 (collision avec Reserves, jamais lancés ensemble) | ❌ absent | `--webpack` explicite + service worker + wrapper natif Capacitor (`android/`, `ios/`) |
| Studio | `apps/studio` | `elsatia-studio` | 3030 | ❌ absent | `--webpack` explicite |
| Worker vidéo | `workers/studio-video` | (aucun, pas une app Next) | — | — | aucun script `build` (seulement `start`/`start:analysis`) |

- Aucun `workspaces` dans le `package.json` racine, aucun `turbo.json`, aucun
  `pnpm-workspace.yaml`. Chaque app a son propre `package-lock.json`/`node_modules` isolé,
  orchestrée depuis la racine via `npm --prefix apps/<app> run <script>` (ex. `verify` root enchaîne
  GP + Tools + Reserves + Colors — **Studio est explicitement exclu du pipeline racine**, doté de
  ses propres workflows CI dédiés `studio-foundation.yml`/`studio-render.yml`).
- Aucune passerelle multi-zone/rewrites en dépôt (`next.config.ts` racine : aucun `rewrites()`,
  `basePath` ni `assetPrefix` ; `vercel.json` racine ne fait que régions+crons ; `src/proxy.ts`
  racine ne gère que la session/CSP de GP). **Conséquence directe pour la Preview : il n'existe
  pas une Preview unique qui couvre les 5 apps — il en faut 5 distinctes**, chacune avec son
  propre projet Vercel (répertoire racine, domaine, variables d'environnement).
- `packages/` (`application-access`, `client-contracts`, `email`, `platform-support-comms`,
  `studio-domain`) : bibliothèques internes partagées via dépendances `file:`, non publiées.

### 1.2 Supabase

- **Un seul projet Supabase partagé** (répertoire `supabase/` unique, à la racine) sert GP,
  Colors, Tools et Reserves. `project_id = "btp-platform"` dans `supabase/config.toml` est un nom
  de dev local, **aucune référence de projet distant réel n'est versionnée nulle part**.
- **Studio n'a aucun répertoire `supabase/` propre dans ce train.** Une architecture à projet
  Supabase dédié pour Studio existe sur une branche non portée (`fix/studio-signup-closed-v1`,
  voir §1.5) — décision d'architecture non tranchée.
- **Auth (config.toml)** : `site_url = "http://127.0.0.1:3000"`,
  `additional_redirect_urls = ["https://127.0.0.1:3000"]` — **exclusivement localhost**. Aucun
  domaine Preview ou Production n'est autorisé dans un fichier versionné ; c'est une étape 100 %
  manuelle (tableau de bord Supabase) pour toute vraie Preview.
- **Hooks Auth** : `before_user_created` et `custom_access_token` commentés/désactivés dans la
  config partagée. Le hook de fermeture des inscriptions Studio (`studio_hook_before_user_created`)
  n'existe que sur la branche non portée, et son propre commentaire de code précise que même une
  fois mergé, il **doit être activé manuellement** (Dashboard > Authentication > Hooks) — il ne
  s'auto-applique jamais sur un projet hébergé.
- **MFA/AAL2** : `enroll_enabled = false` dans `config.toml`, mais la logique métier AAL2 existe en
  base et est testée (`platform_aal2_role_integrity_v1` : 80/80 après remédiation sécurité) — léger
  écart config/code à réconcilier avant de compter sur un vrai flux MFA en Preview.
- **Migrations** : 313 fichiers au HEAD `d4b9c79` (parent de la référence, aucune migration
  ajoutée depuis par les 10 commits portés). Fresh rejoué à plusieurs reprises, toujours
  **0 erreur SQL**. pgTAP : ~93-94 fichiers, ~2277-2493 assertions selon le point de mesure ; **5
  fichiers restent en échec de façon persistante et documentée** (bugs de fixture de test ou
  dépendance `pgsodium` indisponible en local), **aucun n'est une régression liée à un lot récent**
  — vérifié à plusieurs reprises par diff exact de la liste des échecs.
- **RLS** : confirmée active sur 100 % des tables `public` (232/232 au dernier comptage).
- **Storage** : ~13 buckets créés par migration ; un seul public (`entreprise-assets`), tous les
  autres privés ; privilèges `anon` révoqués sur `storage.buckets` par une migration dédiée.
- **Seed** : désactivé par choix (`db.seed.enabled = false`, aucun `seed.sql`). Les scripts de
  données pilote (`supabase/production/seed_entreprise_pilote_btp.sql` +
  `cleanup_entreprise_pilote_btp.sql`) sont explicitement manuels/hors pipeline. Une révision QA
  indépendante de ce fixture (branche `qa/pilot-fixture-independent-review-v1`, 7 défauts réels
  trouvés et corrigés par exécution réelle plutôt que lecture) n'est pas fusionnée dans la
  référence ; le fichier n'a pas été retrouvé au chemin attendu sur `ecstatic-gauss-xrxf98` —
  **NOT_PROVEN_REMOTE / à vérifier** si cette QA doit être reportée ou est déjà couverte ailleurs.
- **Fonctions Edge** : aucune (`supabase/functions/` absent). Le rendu vidéo Studio passe par un
  worker externe (§1.6), pas par une Edge Function.

### 1.3 Vercel

- **Aucun pipeline de déploiement versionné.** `.github/workflows/` ne contient que des gates de
  vérification (`ci.yml`, `studio-foundation.yml` déclenché sur PR, `studio-render.yml` en
  `workflow_dispatch`) — zéro `vercel deploy`, zéro action Vercel. Le déploiement dépend
  entièrement de l'intégration Git native de Vercel (tableau de bord), **hors du dépôt, donc hors
  de portée de cet audit**.
- Seuls GP (racine) et Reserves ont un `vercel.json` versionné. Colors/Tools/Studio n'en ont aucun
  — leur configuration de projet Vercel (répertoire racine, domaine) n'existe, si elle existe, que
  côté tableau de bord.
- CSP/HSTS (GP) sont pilotés par `NODE_ENV`, pas par `VERCEL_ENV` — une Preview Vercel (buildée
  avec `NODE_ENV=production`) reçoit donc le même niveau de sécurité qu'une Production. Ni bug ni
  gain, juste une absence de mode « preview assoupli ».

### 1.4 Variables d'environnement

- Système de manifeste canonique **déjà construit et opérationnel** :
  `config/env-manifest.json` (187 variables, 10 unités : `gestion_pro`, `platform`, `colors`,
  `tools`, `reserves`, `studio`, `studio_worker`, `ops_scripts`, `e2e`, `ci`) + schéma +
  `scripts/check-env-manifest.mjs`, exécuté en CI (`verify:env-manifest`/`test:env-manifest`) et au
  `prebuild` de GP/Reserves/Colors.
- **`preflight_enforcement = "report"`** — confirmé inchangé à chaque point de contrôle relu
  (jusqu'au dernier). Ce mode **ne bloque jamais un build**, il journalise seulement. Le script qui
  permettrait un mode strict au moment du cutover (`scripts/cutover/preflight-check.mjs`) n'existe
  pas dans cette lignée ; un patch de référence existe mais n'a jamais été appliqué.
- Seul le GP (racine) a un `.env.preview.example` dédié. **Colors, Tools, Studio et Reserves n'ont
  chacun qu'un `.env.example` générique (gabarit de dev), aucun gabarit dédié Preview** — un vrai
  provisioning manuel des 4 projets Vercel correspondants n'a aucun gabarit fiable à suivre.
- Le manifeste porte **7 `DECISION_REQUIRED` identifiés par ID**, tous « owner: Julien » :
  `STRIPE-MODULE-PRICE-MODEL`, `STRIPE-SUPPLEMENTARY-ACCOUNTS`, `STRIPE-IA-OPTIONS`,
  `STRIPE-LEGACY-GENERATIONS`, `STRIPE-STORAGE-BLOCK` (5 choix commerciaux Stripe, aucun ne bloque
  la Preview techniquement), **`FLAG-CRONS-FAIL-OPEN`** (les crons s'activent par défaut si la
  variable n'est pas positionnée — à trancher avant toute Preview avec crons réellement actifs) et
  **`STUDIO-SIGNUP-DEFAULT`** (inscription Studio ouverte par défaut, aucune porte — voir §1.5).
- Studio échoue le contrôleur de manifeste avec **37 erreurs**, mais c'est un état **documenté et
  expliqué**, pas une régression silencieuse : le manifeste a été construit en scannant une lignée
  qui inclut une continuation non portée (§1.5) ; les variables manquantes
  (`STUDIO_LEGAL_PUBLISHED`, `RESEND_API_KEY`, etc.) appartiennent à du code qui n'est
  délibérément pas dans ce train.

### 1.5 Le point le plus sensible : inscription Studio et hook Auth

- Le code réellement porté (`apps/studio/src/app/signup/page.tsx`, `actions.ts`) appelle
  `client.auth.signUp()` **sans aucune porte** — pas de code d'invitation, pas de liste blanche,
  pas d'approbation. N'importe qui peut créer un compte Studio et obtenir un espace personnel
  immédiatement.
- Un correctif complet existe déjà (`origin/fix/studio-signup-closed-v1`) : table
  `studio_signup_policy` (fermée par défaut) + fonction `studio_signup_permitted()` + hook Auth
  `before_user_created` + garde applicative en profondeur. **Volontairement non porté**, pour une
  raison d'architecture documentée : ce correctif présuppose que Studio bascule sur **son propre
  projet Supabase dédié** (sa migration vit hors de l'arbre partagé), ce qui est une décision
  d'architecture (mono- vs multi-projet Supabase) laissée à Julien, pas tranchée unilatéralement.
- Deux `DECISION_REQUIRED` documentés à ce sujet dans le rapport interne :
  `DECISION_REQUIRED:STUDIO-SIGNUP-DEFAULT` (ouvert/fermé) et
  `DECISION_REQUIRED:STUDIO-DEDICATED-SUPABASE-AND-CONTINUATION` (projet Supabase séparé ou
  adaptation à l'instance partagée, et sort des lots associés — invitations, RGPD, pages légales).
- **Une autre branche (`claude/studio-runtime-config-wiring-v1`, déjà portée) câble une garde
  applicative partielle** (`STUDIO_SIGNUP_MODE`/`STUDIO_SIGNUP_ALLOWLIST` lus côté serveur) — mais
  cette garde reste contournable par un appel direct `POST /auth/v1/signup` avec la clé publique,
  exactement le trou que `fix/studio-signup-closed-v1` ferme. **Les deux approches sont
  incompatibles telles quelles** (l'une garde les variables d'env, l'autre les supprime au profit
  d'une politique en base) et devront être réconciliées, pas simplement fusionnées.

### 1.6 Jobs / cron / workers

- **Crons** : GP — `abonnements` (03:15) et `notifications-push` (03:45), protégés par
  `CRON_SECRET` ; Reserves — `notifications` (04:30). Tous gérés par `vercel.json` (déclenchement
  plateforme Vercel). `FEATURE_CRONS_ENABLED=false` par défaut dans le gabarit Preview de GP.
  **NOT_PROVEN_REMOTE** : comportement réel des crons Vercel sur un projet Preview (déclenchement
  ou non par défaut) non vérifiable depuis ce bac à sable.
- **Worker vidéo Studio** (`workers/studio-video`) : rendu vidéo via `ffmpeg-static`/`fontkit`/
  `bullmq`/`ioredis`. **Aucun script `build`, uniquement `start`/`start:analysis`** — ce n'est pas
  une app Next.js déployable sur Vercel serverless. **Aucun modèle d'hébergement Preview/Production
  n'est documenté nulle part dans ce dépôt pour ce composant.** C'est une lacune réelle si Studio
  (et son rendu vidéo) doit entrer dans le périmètre d'une première Preview — voir §7.
  Tests locaux : 15 réussis / 3 échoués / 4 ignorés, échecs dus à un binaire `ffmpeg-static`
  incomplet du bac à sable (filtre `drawtext` absent), reproduits identiquement par deux sessions
  de qualification indépendantes — limitation d'environnement, pas un défaut de code.

### 1.7 Stripe (mode TEST)

- Convention : mêmes noms de variables en test/preview et en live/production (pas de préfixe
  dédié) — règle documentée « jamais de clé ou Price ID live hors Production ».
- **Gap opérationnel réel** : `STRIPE_WEBHOOK_EXPECTED_MODE` (`test`/`live`), lu par
  `resoudreModeStripeWebhook()` et appliqué en fail-closed par les webhooks abonnement et boutique
  (503 si absent), **n'est déclarée dans aucun fichier `.env*.example` commité**. Elle doit être
  positionnée à la main (`=test`) sur chaque déploiement Preview concerné — documenté dans
  `docs/exploitation/STRIPE_V2_C_CLOISONNEMENT_WEBHOOKS.md`, mais absente du gabarit qu'un
  opérateur suivrait naturellement.
- 3 routes webhook distinctes (abonnement, boutique, Connect) ; seules abonnement et boutique
  appliquent ce garde-fou de mode ; Connect ne l'applique pas (risque faible, Connect désactivé
  par défaut en Preview).
- Aucun Price ID en dur dans le code — résolution runtime par variable d'environnement, séparation
  test/live propre par la valeur, pas par le code.
- `docs/organisation/STRIPE_LIVE_CHECKLIST.md` confirme : 100 % Test aujourd'hui, aucune clé
  `sk_live_`, aucun produit Live créé, plan de bascule Test→Live en 14 étapes documenté mais non
  entamé.
- `verify:stripe-prices` échoue/est ignoré en CI par simple absence de `STRIPE_SECRET_KEY` dans le
  bac à sable — attendu, **NOT_PROVEN_REMOTE**.

---

## 2. Ce qui peut être attesté depuis cet environnement

| Catégorie | Preuve locale disponible | Statut |
|---|---|---|
| Migrations SQL (Fresh) | Rejouées à plusieurs reprises sur Postgres local, 0 erreur | ✅ Attesté localement |
| Tests pgTAP | ~93 fichiers / ~2400+ assertions, 5 échecs persistants documentés | ✅ Attesté localement (avec réserve documentée) |
| RLS activée sur toutes les tables `public` | Requête directe sur instance locale | ✅ Attesté localement |
| ACL des fonctions `SECURITY DEFINER` critiques | Inspection directe (`owner`, `search_path`, `EXECUTE`) | ✅ Attesté localement |
| Isolation multi-tenant | Suites pgTAP dédiées, 100 % vertes après remédiation sécurité | ✅ Attesté localement |
| CVE Next.js/sharp | Versions vérifiées dans les 5 `package.json`, `npm audit` exécuté | ✅ Attesté localement |
| typecheck/lint/test/build par app | Exécutés localement, résultats consignés (5/5 apps PASS au dernier point de contrôle exact) | ✅ Attesté localement |
| `verify:migrations` / `verify:secrets` | Scripts exécutés localement | ✅ Attesté localement |
| Contenu des gabarits `.env*.example` et `config/env-manifest.json` | Lecture directe | ✅ Attesté localement |
| Auth réellement configurée (Site URL, redirect URLs, hooks) sur un projet réel | — | ❌ **NOT_PROVEN_REMOTE** |
| Existence/état d'un projet Supabase Preview réel | — | ❌ **NOT_PROVEN_REMOTE** |
| Domaines/alias Vercel réellement assignés par app | — | ❌ **NOT_PROVEN_REMOTE** |
| Variables d'environnement réellement positionnées sur Vercel (Preview) | — | ❌ **NOT_PROVEN_REMOTE** |
| Endpoint(s) webhook Stripe Test réellement enregistrés | — | ❌ **NOT_PROVEN_REMOTE** |
| Comportement réel des crons Vercel sur un projet Preview | — | ❌ **NOT_PROVEN_REMOTE** |
| Upgrade réel d'une base Preview existante (vs simulation locale) | — | ❌ **NOT_PROVEN_REMOTE** |
| Attestation Stripe Ed25519 réelle (signature) | Stub `pgsodium` local ne peut pas produire de vraie signature | ❌ **NOT_PROVEN_REMOTE** |
| Émission MFA/AAL2 réelle par Supabase Auth (GoTrue) | Simulée localement uniquement | ❌ **NOT_PROVEN_REMOTE** |
| Modèle d'hébergement du worker `studio-video` | Aucune preuve, aucune doc trouvée | ❌ **NOT_PROVEN_REMOTE** (et probablement **absent**, pas seulement non prouvé) |

**Principe appliqué dans tout ce rapport** : une absence de credentials n'est jamais traduite en
défaillance produit. Chaque ligne ci-dessus marquée `NOT_PROVEN_REMOTE` est une limite de
l'environnement d'audit, pas une affirmation que la chose ne fonctionne pas.

---

## 3. Comparaison attentes du repo vs Preview disponible, par application

**Aucune Preview réelle n'est accessible depuis ce bac à sable — aucun identifiant Vercel, Supabase
ou Stripe n'existe dans cette session, à aucun moment.** Le tableau ci-dessous compare donc ce que
le dépôt *attend* d'une Preview (déduit des gabarits, config, CI) à ce qui est *vérifiable
statiquement* — la case « Preview réelle » est `NOT_PROVEN_REMOTE` partout, sans exception.

| Application | Project ref attendu | Gabarit ENV Preview dédié | Migrations attendues | Auth redirect URLs | Storage buckets | Stripe TEST | Webhook | Domaine | Preview réelle |
|---|---|---|---|---|---|---|---|---|---|
| Gestion Pro | Non versionné (placeholder `nom-stable-preview.vercel.app`) | ✅ `.env.preview.example` | 313 migrations partagées | ❌ non configuré (localhost only dans le repo) | ~13 buckets partagés | ✅ vars déclarées, ⚠️ `STRIPE_WEBHOOK_EXPECTED_MODE` absente du gabarit | `/api/stripe/abonnement/webhook`, `/api/stripe/boutique/webhook`, `/api/stripe/webhook` (Connect) | `app.elsatia.fr` en Production ; alias Preview non versionné | `NOT_PROVEN_REMOTE` |
| Colors | Non versionné | ❌ absent (seul `.env.example`) | Partagées (même projet) | idem (partagé) | idem (partagé) | N/A (pas de facturation propre connue) | N/A | Non versionné | `NOT_PROVEN_REMOTE` |
| Tools | Non versionné | ❌ absent | Partagées (même projet) | idem (partagé) | idem (partagé) | N/A | N/A | Non versionné | `NOT_PROVEN_REMOTE` |
| Reserves | Non versionné | ❌ absent | Partagées (même projet) | idem (partagé) | idem (partagé) | N/A | N/A | Non versionné, `vercel.json` propre existe (régions+cron) | `NOT_PROVEN_REMOTE` |
| Studio | Non versionné | ❌ absent | **Aucun `supabase/` propre dans ce train** — dépend de `DECISION_REQUIRED:STUDIO-DEDICATED-SUPABASE-AND-CONTINUATION` | ❌ non configuré, hook Auth de fermeture non porté | Non déterminé (aucun `supabase/` propre trouvé) | N/A | N/A | Non versionné | `NOT_PROVEN_REMOTE` |
| Worker `studio-video` | N/A (pas un projet Vercel) | — | — | — | Lit/écrit probablement dans le Storage Supabase partagé (non vérifié en détail) | N/A | N/A | Aucun modèle d'hébergement documenté | `NOT_PROVEN_REMOTE` |

---

## 4. Preview existante : ALIGNED / DRIFTED / UNKNOWN

**`UNKNOWN`.**

Aucune Preview réelle n'a été atteinte, interrogée ou même référencée par un identifiant concret
(URL, project ref) dans ce dépôt à la référence auditée. Le rapport de qualification interne
lui-même conclut, à son point le plus avancé, que le train est un
**`PREVIEW DEPLOYMENT CANDIDATE`** et non un `PREVIEW QUALIFIED` — précisément parce qu'aucun
environnement Preview réel n'a jamais été atteint dans les sessions précédentes non plus. Il ne
s'agit donc pas d'un cas `DRIFTED` (qui supposerait une Preview existante mesurablement en
décalage) ni `ALIGNED` (qui supposerait une Preview existante et vérifiée conforme) : c'est
`UNKNOWN` par absence totale d'objet à comparer.

`DECISION_REQUIRED:PREVIEW-PROJECT-INVENTORY` — personne dans ce sandbox ne peut confirmer si un
ou plusieurs projets Vercel/Supabase « Preview » existent déjà côté plateformes réelles. Si c'est
le cas, la première étape de toute qualification réelle est de les inventorier (project refs,
domaines, variables déjà positionnées) avant de suivre l'ordre du §6 — ne pas supposer un départ
de zéro sans vérifier.

---

## 5. Procédures de rollback disponibles avant tout déploiement

| Axe | État documenté | Portée réelle |
|---|---|---|
| Backup DB avant migration | `pg_dump` custom format, SHA-256, volume DR chiffré, rétention 7j/4sem/12mois — **décrit en détail** (`docs/runbooks/ELSATIA_PRODUCTION_ROLLBACK_V1.md`) | **Production uniquement**, jamais exécuté (le document le dit lui-même) |
| Migrations — retour arrière | 3 stratégies : forward-fix (préféré), restauration snapshot/PITR + rollback app coordonné, bundle GRANT/REVOKE pré-écrit. **Aucune down-migration automatisée** pour la migration ACL à 1220 REVOKE | Décrit, non testé en conditions réelles |
| Vercel rollback | Rollback instantané / promotion d'un déploiement antérieur — **explicitement jugé insuffisant seul** dès qu'une migration ACL est appliquée (doit être couplé à un rollback DB) | Mécanisme Vercel natif ; jamais exercé dans ce dépôt |
| Env var rollback | Tableau de présence/état documenté **au niveau Production** ; une dérive connue est signalée (`STRIPE_PRICE_*_ANNUEL` encore sur l'ancien tarif) | Pas de procédure équivalente documentée pour un environnement Preview |
| Auth/MFA rollback | Distingue garde applicative (rollback avec le code) vs données Auth (restauration snapshot uniquement, jamais d'édition manuelle) vs récupération admin (flux Supabase Auth, jamais de code TOTP demandé) | Décrit, non testé |
| Supabase PITR | **Non activé par défaut** (Supabase Pro, rétention 7 jours) — décision opérationnelle non prise | — |
| Retour arrière — `PRODUCTION_CHECKLIST.md` | Section explicitement un stub : « ne s'applique pas encore, sera réécrite une fois la Production réellement provisionnée » | — |

**Constat clé pour la mission** : toute la procédure de rollback existante est pensée pour la
**Production**, jamais pour une **Preview**. Or une Preview (base éphémère ou dédiée, jetable par
nature) a des besoins différents : la question n'est généralement pas « comment revenir en arrière
sur des données précieuses » mais « comment re-provisionner proprement depuis zéro si quelque
chose casse ». **Aucune procédure de ce type (recréation propre d'un projet Supabase/Vercel Preview
depuis zéro) n'a été trouvée dans ce dépôt.** Le runbook de production lui-même se déclare non
prouvé : la preuve Fresh/Restore est déléguée à un lot séparé (`ELSATIA-PREPROD-DB-E2E-ROLLBACK-V1`),
requis vert avant que le runbook soit « applicable ».

`DECISION_REQUIRED:PREVIEW-ROLLBACK-RUNBOOK` — un runbook dédié « Preview » (probablement plus
simple qu'un runbook Production : accepter la perte de données Preview, documenter juste la
re-création propre) n'existe pas et devrait être écrit avant une première vraie tentative,
séparément du runbook Production existant.

---

## 6. Ordre exact recommandé pour une vraie qualification Preview (NON EXÉCUTÉ)

Strictement une checklist — rien ci-dessous n'a été exécuté par cet audit.

1. **Inventaire préalable** — confirmer si des projets Vercel/Supabase « Preview » existent déjà
   (`DECISION_REQUIRED:PREVIEW-PROJECT-INVENTORY`, §4). Ne rien supposer.
2. **Trancher les `DECISION_REQUIRED` qui conditionnent le périmètre** : au minimum
   `STUDIO-SIGNUP-DEFAULT` et `STUDIO-DEDICATED-SUPABASE-AND-CONTINUATION` si Studio entre dans le
   périmètre de cette première Preview ; `FLAG-CRONS-FAIL-OPEN` si les crons doivent être actifs ;
   décider si le worker `studio-video` entre dans le périmètre (voir point 7).
3. **Provisionner le(s) projet(s) Supabase Preview** — un projet partagé GP/Colors/Tools/Reserves
   au minimum ; un second projet dédié si la décision Studio va dans ce sens. Ne jamais réutiliser
   un projet partagé avec la Production.
4. **Appliquer les 313 migrations (Fresh) sur ce projet réel** et rejouer les suites pgTAP dessus —
   la preuve Fresh/pgTAP actuelle est locale (Postgres du bac à sable), jamais exécutée sur un
   vrai GoTrue/PostgREST Supabase.
5. **Configurer Auth manuellement** (Site URL + Additional Redirect URLs vers le(s) domaine(s)
   Preview réel(s), hooks Auth si Studio dédié) — absent de tout fichier versionné, entièrement
   manuel côté tableau de bord.
6. **Provisionner les projets Vercel** — un par app entrant dans le périmètre (racine=GP,
   `apps/colors`, `apps/reserves`, `apps/tools`, `apps/studio` selon décision du point 2), avec le
   bon répertoire racine et domaine/alias.
7. **Écrire les gabarits `.env.preview.example` manquants** pour Colors/Tools/Studio/Reserves
   (aucun n'existe aujourd'hui) à partir de `config/env-manifest.json`, puis renseigner les
   variables réelles dans Vercel — ne pas improviser pendant le déploiement.
8. **Positionner explicitement `STRIPE_WEBHOOK_EXPECTED_MODE=test`** sur chaque déploiement Preview
   exposant les routes abonnement/boutique — sans quoi ces webhooks échouent systématiquement
   (503).
9. **Enregistrer les endpoints webhook Stripe TEST** pointant vers les URLs Preview réelles (hors
   dépôt, tableau de bord Stripe).
10. **Décider et exécuter l'hébergement du worker `studio-video`** si Studio/rendu vidéo est dans
    le périmètre — ce composant n'est pas déployable sur Vercel serverless en l'état
    (`DECISION_REQUIRED`, aucun modèle documenté).
11. **Déployer** chaque app retenue vers son projet Vercel Preview.
12. **Rejouer sur la vraie Preview** : upgrade réel (vs simulation locale), smoke tests Auth
    (signup/login/reset par app), isolation multi-tenant en conditions réelles, Storage
    (upload/lecture par bucket), un cycle Stripe TEST complet de bout en bout (checkout →
    webhook → état abonnement), déclenchement manuel des crons, et lever un par un les items listés
    `NOT_PROVEN_REMOTE` au §2.
13. **Écrire le runbook de rollback Preview** (§5) avant, pas après, toute donnée réelle injectée.
14. Seulement si tout ce qui précède est vert : élever le statut du train de
    `PREVIEW DEPLOYMENT CANDIDATE` à `PREVIEW QUALIFIED` (terminologie déjà en usage dans ce
    dépôt). Ne pas avancer vers Production avant cette étape.

---

## 7. Blockers P0 / P1 (pas de backlog cosmétique)

### P0 — bloquent une vraie Preview fonctionnelle, pas seulement « non prouvés »

1. **`STRIPE_WEBHOOK_EXPECTED_MODE` absente de tout gabarit `.env*.example` committé**, alors que
   les webhooks abonnement et boutique la lisent en fail-closed (503 systématique si absente). Sans
   action manuelle documentée mais non gabarisée, toute Preview exposant la facturation cassera
   silencieusement sur chaque événement Stripe. *(§1.7)*
2. **Aucune URL Preview réelle n'est — ni ne peut être — autorisée dans Supabase Auth depuis le
   dépôt** (`site_url`/`additional_redirect_urls` localhost uniquement, versionnés). Tout flux Auth
   (confirmation d'email, réinitialisation de mot de passe) échouera tant que cette étape 100 %
   manuelle n'est pas faite, et rien dans le dépôt ne le rappelle au moment du déploiement. *(§1.2)*
3. **`workers/studio-video` n'a aucun modèle de déploiement Preview/Production documenté** et n'est
   pas déployable tel quel sur Vercel serverless (pas de script `build`, dépendances FFmpeg/queue
   longue durée). Si le rendu vidéo Studio est dans le périmètre de la première Preview, ce point
   bloque, sans contournement documenté. *(§1.6)*

### P1 — gaps réels à fermer avant une qualification Preview complète, non bloquants immédiatement

4. **4 des 5 apps (Colors, Tools, Studio, Reserves) n'ont aucun `.env.preview.example` dédié** —
   seul GP en a un. Risque concret d'oubli de variable lors du provisioning manuel des 4 projets
   Vercel correspondants. *(§1.4)*
5. **Inscription Studio ouverte par défaut, sans aucune porte** (`DECISION_REQUIRED:STUDIO-SIGNUP-DEFAULT`
   non tranché) ; le correctif existant est volontairement non porté car il dépend d'une décision
   d'architecture non tranchée (projet Supabase dédié). À trancher avant d'inclure Studio dans une
   Preview accessible publiquement/à des pilotes externes. *(§1.5)*
6. **3 des 5 apps (Colors, Tools, Studio) n'ont aucun `vercel.json` en dépôt** — leur configuration
   de déploiement (répertoire racine, domaine) est entièrement hors dépôt, non versionnée, non
   revue par aucune gate CI. *(§1.3)*
7. **5 fichiers pgTAP restent en échec de façon persistante** (bugs de fixtures de test connus, 1
   bloqué par `pgsodium` indisponible en local) — à assainir ou documenter formellement comme
   hors-périmètre avant de déclarer une suite de sécurité « 100 % verte » sur une vraie Preview.
   Aucune régression fonctionnelle identifiée derrière ces échecs à ce jour. *(§1.2, §2)*
8. **Aucun pipeline de déploiement Preview versionné** (ni GitHub Actions, ni script) — repose
   entièrement sur la configuration du tableau de bord Vercel, non auditable et non reproductible
   depuis le dépôt. *(§1.3)*
9. **`preflight_enforcement` du manifeste ENV reste en mode `report`** (jamais bloquant) — assumé
   et documenté par le dépôt lui-même comme dans l'attente d'une vraie Preview qualifiée pour
   justifier le passage à `enforce`. Pas une régression, mais un vrai garde-fou qui n'existe pas
   encore en pratique. *(§1.4)*
10. **Aucune procédure de rollback n'existe pour un environnement Preview** — celle qui existe est
    explicitement à portée Production et elle-même non exécutée/non prouvée. *(§5)*
11. **La vérification post-portage du HEAD actuel (`ecstatic-gauss-xrxf98`) est elle-même
    incomplète** — le rapport interne marque son §25.5 (typecheck/lint/test/build par app après le
    dernier portage de 10 commits) comme « à compléter », jamais exécuté à ce jour sur ce HEAD
    exact. Avant de considérer ce HEAD comme base de départ pour une vraie Preview, cette
    vérification devrait être terminée. *(§0)*

### Explicitement écarté du backlog P0/P1 (choix commercial, pas défaut technique)

Les 5 `DECISION_REQUIRED` de tarification Stripe (`STRIPE-MODULE-PRICE-MODEL`,
`STRIPE-SUPPLEMENTARY-ACCOUNTS`, `STRIPE-IA-OPTIONS`, `STRIPE-LEGACY-GENERATIONS`,
`STRIPE-STORAGE-BLOCK`), la dérive de documentation `BREVO_API_KEY` entre gabarits, et les
avertissements de lint pré-existants ne sont **pas** retenus comme blockers P0/P1 — ce sont des
décisions produit ou des irritants mineurs, pas des obstacles à une qualification Preview
technique.

---

## 8. Verdicts finaux

```
PREVIEW_ENVIRONMENT = PARTIALLY_READY
```

Justification : la couche code/infrastructure a été extensivement auto-qualifiée en local à
travers plusieurs sessions successives et documentées avec une rigueur inhabituelle (Fresh,
pgTAP, sécurité cross-tenant, CVE, ACL — voir le journal interne cité en §0), atteignant de
l'aveu même du dépôt le statut `PREVIEW DEPLOYMENT CANDIDATE`. Mais un vrai déploiement Preview
bute aujourd'hui sur des trous concrets, pas seulement sur l'absence de preuve : un garde-fou
Stripe absent de tout gabarit (P0), aucune URL Preview configurable pour Auth depuis le dépôt
(P0), et un composant (`workers/studio-video`) sans modèle de déploiement du tout (P0) si Studio
est dans le périmètre. Ce n'est ni `READY` (les P0 ci-dessus empêcheraient un déploiement propre
au premier essai) ni `BLOCKED_ENVIRONMENT` (rien n'indique un blocage architectural profond — tous
les gaps identifiés ont un chemin de résolution clair et documenté au §6).

```
REMOTE_EVIDENCE = NOT_PROVEN_REMOTE
```

Justification : aucun identifiant Vercel, Supabase ou Stripe n'a existé à un seul instant de cet
audit ni des sessions de qualification internes qu'il relit. Chaque affirmation concernant un état
réellement déployé, hébergé ou configuré côté plateforme est héritée telle quelle des
`NOT_PROVEN_REMOTE` déjà posés par le dépôt lui-même, jamais vérifiée indépendamment contre un
environnement vivant par cet audit. Aucune Preview existante n'a pu être comparée (§4 = `UNKNOWN`).

---

*Audit en lecture seule. Aucun fichier de code modifié, aucune commande d'écriture Supabase,
aucune migration distante, aucune modification Stripe, aucune action Production exécutée par
cette mission.*
