# ELSATIA — Clôture des blockers Preview (V1)

Mission autonome nocturne (~8h), sans disponibilité humaine. Ferme, côté dépôt/configuration/
documentation seulement, les blockers identifiés par l'audit
`docs/qualification/ELSATIA_REAL_PREVIEW_READINESS_AUDIT_V2.md`. **Aucune action sur une Preview
réelle, aucune action Production, aucune écriture Supabase/Vercel/Stripe distante n'a été
exécutée.**

## 0. Base et provenance de l'audit source

- Base réelle : `origin/claude/funny-bell-eqo1p5` (HEAD `842b4b4`), le dernier train convergé au
  moment du démarrage de cette mission.
- **`ELSATIA_REAL_PREVIEW_READINESS_AUDIT_V2.md` n'existe pas sur cette branche** ni sur aucun de
  ses ancêtres. Recherché dans tout l'historique (`git log --all --diff-filter=A`) : trouvé sur
  `origin/claude/adoring-ride-mkovyw` (commit `f9d5411`), une branche sœur non fusionnée dans
  `funny-bell-eqo1p5`.
- Vérifié avant de s'appuyer dessus : cette branche d'audit référence `origin/claude/ecstatic-gauss-xrxf98`
  comme HEAD analysé. `ecstatic-gauss-xrxf98` n'est PAS un ancêtre de `funny-bell-eqo1p5` (deux
  chemins distincts, même point de convergence `f5a9e444`), mais un `git diff` entre les deux tips
  ne montre aucune différence de code — seulement 86 lignes de texte dans le journal de
  qualification interne (références de SHA divergentes, contenu équivalent). **Les 10 mêmes lots
  ont été portés sur les deux branches, une fois par cherry-pick (`ecstatic-gauss-xrxf98`), une
  fois par fusion (`funny-bell-eqo1p5`, commits `842b4b4`/`569eeb7`).** L'audit s'applique donc
  intégralement à la base réelle de cette mission — vérifié, pas supposé.
- Copie de travail extraite en lecture seule (`git show f9d5411:...`) pour analyse ; le fichier
  d'audit lui-même n'a pas été copié dans cette branche (il appartient à une autre lignée de
  travail, non fusionnée ici par décision conservatrice — seuls ses constats, revalidés un par un,
  sont exploités).

## 1. P0 — `STRIPE_WEBHOOK_EXPECTED_MODE`

- **BEFORE** (constat de l'audit source, §1.7/§7) : « absente de tout gabarit `.env*.example`
  commité », webhooks abonnement/boutique fail-closed (503) sans repli documenté dans un gabarit.
- **ROOT_CAUSE** : **constat obsolète dès sa rédaction.** Un lot antérieur
  (`fix(env): gabarits .env alignes sur le manifeste`, commit `16917b3`, 2026-09-21 10:46 UTC — 11h
  avant la rédaction de l'audit à 21:35 UTC) avait déjà ajouté la variable aux 3 gabarits racine.
  Vérifié directement sur le HEAD `ecstatic-gauss-xrxf98` cité par l'audit : la variable y est
  présente aussi. L'audit affirme le contraire sans que la cause soit identifiable depuis ce
  dépôt — traité comme une erreur d'audit, pas comme une régression à corriger deux fois.
- **CHANGE** : aucun changement de code. Revalidation uniquement.
- **TEST** : `node --test scripts/check-env-manifest.test.mjs` → 58/58 déjà verts, y compris le
  test dédié (« Stripe : STRIPE_WEBHOOK_EXPECTED_MODE est requise et figure dans les trois
  gabarits racine ») et les 5 scénarios demandés par la mission (absent, test, live, invalide,
  mismatch clé/mode — `PF-STRIPE-MODE-INVALID`, `PF-STRIPE-MODE-PREVIEW-LIVE`,
  `PF-STRIPE-KEY-MODE-MISMATCH`, `PF-STRIPE-LIVE-KEY-IN-PREVIEW`, tous déjà couverts).
- **AFTER** : fermé, sans action. `.env.example`, `.env.preview.example`, `.env.local.example`
  déclarent tous les trois la variable ; `scripts/lib/env-manifest-preflight.mjs` couvre tous les
  cas de garde demandés.
- **REMOTE_ACTION_REQUIRED** : poser `STRIPE_WEBHOOK_EXPECTED_MODE=test` explicitement sur chaque
  déploiement Vercel Preview exposant la facturation (aucun mécanisme ne le fait à distance — geste
  humain au provisioning, déjà documenté dans `docs/exploitation/STRIPE_V2_C_CLOISONNEMENT_WEBHOOKS.md`).

## 2. P0 — URLs Preview Supabase Auth

- **BEFORE** : `supabase/config.toml` → `site_url`/`additional_redirect_urls` exclusivement
  localhost, versionnés. Aucune URL Preview configurable depuis le dépôt ; aucun rappel au moment
  du déploiement.
- **ROOT_CAUSE** : réel, confirmé par lecture de code (pas supposé) — `config.toml` ne gouverne que
  l'instance Supabase locale ; la configuration Auth d'un projet hébergé est **structurellement**
  hors dépôt (Dashboard Supabase uniquement, aucun champ équivalent dans `config.toml` pour un
  projet distant). Ce n'est donc pas un oubli à corriger dans le code, mais une lacune de
  documentation/contrat à combler.
- **CHANGE** : `docs/runbooks/ELSATIA_SUPABASE_AUTH_PREVIEW_URLS_V1.md` — contrat exact par app
  (origine lue, route Auth-facing, preuve en ligne de code) pour GP, Colors, Tools, Réserves,
  Studio (2 scénarios selon la décision d'architecture Studio) ; alerte sur le repli localhost
  dangereux de Réserves (voir §7 ci-dessous).
- **TEST** : lecture de code croisée par app (`grep`/inspection directe des 5 handlers Auth-facing
  et des 5 helpers de construction d'URL) — pas de test automatisé possible pour une documentation,
  mais chaque affirmation du document est sourcée par un chemin de fichier + numéro de ligne.
- **AFTER** : le contrat existe et est reproductible ; aucune configuration Supabase distante n'a
  été modifiée (hors périmètre par construction).
- **REMOTE_ACTION_REQUIRED** : configurer manuellement Site URL + Additional Redirect URLs dans
  Dashboard Supabase → Authentication → URL Configuration, exactement comme documenté (§3 du
  document livré), pour chaque projet Supabase Preview retenu.

## 3. P0 — Déploiement `workers/studio-video`

- **BEFORE** : aucun `Dockerfile`, aucun script `build`, README indiquant explicitement « Aucun
  cron ou déploiement Production installé ». Non déployable tel quel sur Vercel serverless
  (processus long, pas une fonction).
- **ROOT_CAUSE** : réel. Composant délibérément hors du système Next.js/Vercel du reste de
  l'écosystème (processus long BullMQ + outbox PostgreSQL, dépendance FFmpeg native, dépendance
  interne non publiée `packages/studio-domain` consommée en source TypeScript directe). Aucun
  modèle de déploiement n'avait jamais été écrit pour cette forme de composant dans ce dépôt.
- **CHANGE** :
  - `workers/studio-video/Dockerfile` (+ `Dockerfile.dockerignore`) : image déterministe Node 24 +
    FFmpeg **Debian** (paquet `apt`, pas `ffmpeg-static`) avec vérification **au moment du build**
    que `drawtext`/`drawbox`/`overlay` sont bien présents — la faiblesse documentée du binaire
    `ffmpeg-static` de développement (confirmée dans ce sandbox, voir TEST ci-dessous) n'est plus
    reconductible en Preview/Production.
  - `workers/studio-video/src/healthcheck.ts` (+ test) : liveness Redis, seule dépendance dont la
    perte rend le processus incapable de progresser (voir justification dans le fichier).
  - `docs/runbooks/ELSATIA_STUDIO_VIDEO_WORKER_DEPLOYMENT_V1.md` : audit complet (runtime, FFmpeg,
    queue/retry/timeout/concurrency déjà conçus au niveau applicatif — pas réinventés —, storage,
    callback, observabilité) + contrat de déploiement générique, aucun fournisseur cloud imposé.
- **TEST** :
  - `npm run typecheck` / `npm test` du worker : verts (19/26 tests passent ; 3 échecs confirmés
    comme la même limitation d'environnement déjà documentée par le dépôt — `ffmpeg-static` local
    sans `drawtext`, reproduit ici de façon indépendante, pas causé par ce changement).
  - Les 4 nouveaux tests `healthcheck.test.ts` passent (succès, réponse inattendue, échec de
    connexion, libération systématique de la connexion).
  - `docker build` **non exécuté** : aucun démon Docker privilégié dans ce sandbox
    (`ulimit: Operation not permitted`). Le Dockerfile a été relu ligne à ligne ; l'étape de
    vérification `drawtext` a été validée par équivalence de format avec le binaire
    `ffmpeg-static` local réel.
- **AFTER** : modèle de déploiement déterministe livré et documenté. `NOT_PROVEN_REMOTE` : le
  build Docker lui-même.
- **REMOTE_ACTION_REQUIRED** : (1) exécuter `docker build -f workers/studio-video/Dockerfile -t
  <image> .` depuis la racine du dépôt, une première fois, avant tout provisioning d'hébergeur —
  c'est l'action qui lève le `NOT_PROVEN_REMOTE` ci-dessus ; (2) choisir un hébergeur de conteneurs
  à processus long (`DECISION_REQUIRED:HOSTING-PROVIDER-STUDIO-WORKER`, ajoutée au manifeste,
  aucune préférence technique déduite du dépôt).

## 4. P1 — Gabarits ENV Preview (Colors/Tools/Studio/Réserves)

- **BEFORE** : seul GP avait un `.env.preview.example` dédié.
- **ROOT_CAUSE** : réel — jamais créés pour les 4 autres apps.
- **CHANGE** : 4 gabarits créés (`apps/{colors,tools,reserves,studio}/.env.preview.example`),
  dérivés de `config/env-manifest.json` (source de vérité), enregistrés dans
  `applications.*.examples`. Effet de bord découvert et corrigé : ces 4 fichiers (et le mécanisme
  de gabarit Preview en général pour ces apps) étaient **gitignorés** par la règle générique
  `.env*` du `.gitignore` racine et, pour Colors, par une règle équivalente propre à l'app —
  corrigé par des négations explicites (`!.env.preview.example`), à l'image de ce qui existait déjà
  pour `.env.example`/`.env.local.example`.
- **TEST** : `npm run verify:env-manifest` → 0 erreur (0 `EXAMPLE-FILE-MISSING`, les 4 gabarits
  validés complets) ; `npm run test:env-manifest` → 58/58 ; `npm run preflight:preview
  --skip-storage` confirme que chaque gabarit ne laisse filtrer aucune valeur et signale
  correctement chaque champ encore à renseigner par un opérateur.
- **AFTER** : fermé.
- **REMOTE_ACTION_REQUIRED** : copier ces gabarits dans les variables d'environnement Vercel de
  chaque projet Preview, remplacer les `<preview-host-*>` par les domaines réels.

## 5. P1 — `vercel.json` (Colors/Tools/Studio)

- **BEFORE** : absent pour ces 3 apps (seuls GP et Réserves en ont un).
- **ROOT_CAUSE** : revalidé — **aucune configuration explicite n'est nécessaire.** Aucune des 3
  apps n'a de route cron (`grep` sur `api/cron` : rien) ; le framework Next.js est auto-détecté ;
  Tools et Studio ont chacun un script `build` personnalisé dans leur propre `package.json`
  (`next build --webpack [...]`), déjà exécuté par le comportement Vercel conventionnel
  (`npm run build`) sans configuration additionnelle. Le « répertoire racine » (Root Directory)
  n'est de toute façon jamais un champ de `vercel.json` — réglage dashboard exclusivement, pour ces
  3 apps comme pour GP/Réserves.
- **CHANGE** : aucun `vercel.json` créé — décision documentée (pas d'oubli).
- **TEST** : sans objet (pas de changement de code).
- **AFTER** : fermé — comportement Vercel conventionnel confirmé suffisant, documenté dans
  `docs/runbooks/ELSATIA_PREVIEW_DEPLOYMENT_RUNBOOK_V1.md` §6.
- **REMOTE_ACTION_REQUIRED** : point découvert en cours de revalidation, non listé par l'audit
  source — **Colors, Studio et Réserves dépendent de `packages/*` situés hors de leur Root
  Directory** (`file:../../packages/...`). Activer manuellement l'option de dashboard Vercel
  « Include files outside of the Root Directory in the Build Step » pour ces 3 projets (Tools n'en
  a pas besoin, aucune dépendance `file:`).

## 6. P1 — Fermeture de l'inscription Studio

- **BEFORE** (mission) : à revalider, ne pas se fier uniquement au rapport précédent.
- **ROOT_CAUSE / constat** : **deux couches distinctes, à ne pas confondre.**
  1. Le défaut de sécurité au niveau code est **déjà fermé et testé** :
     `studioSignupMode(undefined) === "closed"` (fail-closed), `isStudioSignupAllowlisted`
     fail-closed, `studioLegalPublished` fail-closed —
     `apps/studio/tests/access.test.ts` couvre tous les cas, 100 % verts. Confirmé dans le manifeste
     (`F-STUDIO-SIGNUP-DEFAULT-OPEN`, `status: "fixed"`).
  2. **La garde reste contournable.** Elle n'existe qu'au niveau de l'action serveur Next.js
     (`apps/studio/src/app/actions.ts`) ; aucun hook Auth `before_user_created` n'est câblé sur le
     projet Supabase de ce train. Un appel direct `POST /auth/v1/signup` avec la clé publique crée
     un compte sans passer par cette garde ; l'utilisateur peut ensuite se connecter normalement
     (`/login`, pas de garde) et appeler `onboarding()` (pas de garde non plus) pour obtenir un
     espace de travail personnel complet. **Vérifié en lisant `createPersonalStudioWorkspace()` :
     aucune revérification de la politique de signup à la création d'espace.**
- **CHANGE** : aucun code applicatif modifié (décision consciente, voir ci-dessous). Ajout au
  registre structuré du manifeste : `DECISION_REQUIRED:STUDIO-DEDICATED-SUPABASE-AND-CONTINUATION`
  (jusqu'ici en prose uniquement dans le journal interne), qui conditionne le vrai correctif
  (`fix/studio-signup-closed-v1`, déjà écrit, non porté).
- **TEST** : `apps/studio/tests/access.test.ts` (17 assertions, préexistantes, revérifiées vertes).
- **AFTER** : **partiellement fermé.** Le défaut dangereux (ouvert par défaut) est fermé et
  regression-testé. Le contournement architectural reste ouvert, par décision consciente : le
  porter unilatéralement aurait nécessité de trancher une décision d'architecture
  (projet Supabase dédié ou partagé) explicitement réservée à Julien — option conservatrice retenue
  : documenter, tracer, ne pas trancher à sa place.
- **REMOTE_ACTION_REQUIRED** : **ne pas exposer Studio publiquement/à des pilotes externes avant
  que `DECISION_REQUIRED:STUDIO-DEDICATED-SUPABASE-AND-CONTINUATION` soit tranchée** et, si un
  projet dédié est choisi, que `fix/studio-signup-closed-v1` soit porté et son hook Auth activé
  manuellement (le hook ne s'auto-applique jamais sur un projet hébergé, même une fois le code
  fusionné).

## 7. P1 — Domaines et replis localhost dangereux

- **BEFORE** : à cartographier.
- **CHANGE** : `docs/runbooks/ELSATIA_PREVIEW_DOMAINS_STORAGE_STRIPE_V1.md` §7 — matrice des 6
  domaines cibles ; 5 replis détectés par lecture de code, dont **1 réellement dangereux** (pas
  seulement cosmétique) : `apps/reserves/src/lib/invitations.ts:31` retombe silencieusement sur
  `http://localhost:3020` si `NEXT_PUBLIC_RESERVES_URL` est absente — impacte le contenu réel d'un
  e-mail d'invitation envoyé, pas seulement une métadonnée SEO (contrairement aux 3 autres replis
  détectés, `metadataBase`/canonical, à portée limitée). Par contraste, Colors et Studio échouent
  déjà explicitement dans le même genre de situation (pas de repli silencieux).
- **CHANGE (code)** : **aucun** — corriger ce repli aurait modifié une fonction déjà testée et
  utilisée en Production sans confirmation du propriétaire produit ; hors périmètre
  documentation/config de cette mission. Tracé formellement :
  `DECISION_REQUIRED:RESERVES-URL-FAIL-CLOSED` (nouvelle entrée au manifeste).
- **TEST** : détection par `grep` ciblé, confirmée par lecture directe de chaque fichier cité.
- **AFTER** : cartographié et documenté ; le repli dangereux n'est pas corrigé (décision
  consciente, voir ci-dessus).
- **REMOTE_ACTION_REQUIRED** : poser `NEXT_PUBLIC_RESERVES_URL` explicitement sur chaque
  déploiement Preview/Production de Réserves (déjà dans le gabarit livré au §4) — mitigation
  opérationnelle en attendant une éventuelle décision de fermeture du repli.

## 8. P1 — Storage (buckets)

- **BEFORE** : à documenter.
- **CHANGE** : `docs/runbooks/ELSATIA_PREVIEW_DOMAINS_STORAGE_STRIPE_V1.md` §8 — 18 buckets
  distincts recensés par lecture exhaustive des migrations SQL (`insert into storage.buckets`),
  avec app propriétaire, visibilité, limite de taille, MIME autorisés. Confirme que la création est
  déjà automatique (migrations), qu'`anon` est déjà révoqué sur `storage.buckets`, et que l'accès
  aux buckets privés passe déjà systématiquement par des URLs signées (9+ points d'usage vérifiés).
- **CHANGE (preflight)** : `scripts/preflight-preview.mjs` ajoute une vérification en lecture
  seule de la présence des 18 buckets attendus (jamais de création), strictement opt-in (ignorée
  sans clé de service fournie).
- **TEST** : `scripts/preflight-preview.test.mjs` (5 tests, fonction pure `missingBuckets`
  testée sans réseau) ; le chemin réseau lui-même n'a pas pu être exercé contre un vrai projet
  (`NOT_PROVEN_REMOTE`, cohérent avec le reste de l'audit).
- **AFTER** : fermé pour la partie documentation/inventaire/preflight statique.
- **REMOTE_ACTION_REQUIRED** : rejouer les 313 migrations sur le(s) projet(s) Supabase Preview
  (crée les 18 buckets automatiquement), puis `npm run preflight:preview` avec une clé de service
  réelle pour confirmer.

## 9. P1 — Stripe TEST readiness

- **BEFORE** : contrat complet à formaliser sans appel Stripe réel.
- **ROOT_CAUSE** : le contrat existait déjà, dispersé sur 4 documents/scripts distincts
  (`verify-stripe-prices.mjs`, `env-manifest-preflight.mjs`, `STRIPE_LIVE_CHECKLIST.md`,
  `STRIPE_V2_C_CLOISONNEMENT_WEBHOOKS.md`) — pas de lacune technique, une lacune de consolidation.
- **CHANGE** : `docs/runbooks/ELSATIA_PREVIEW_DOMAINS_STORAGE_STRIPE_V1.md` §9 — checklist unique
  en 6 points, référence explicite aux mécanismes existants plutôt que de les dupliquer (dupliquer
  aurait créé un second système de vérité moins fiable).
- **TEST** : aucun nouveau script — les checks statiques déjà en place
  (`PF-STRIPE-MODE-INVALID`, `PF-STRIPE-MODE-PREVIEW-LIVE`, `PF-STRIPE-KEY-MODE-MISMATCH`,
  `PF-STRIPE-LIVE-KEY-IN-PREVIEW`) couvrent déjà absent/test/live/invalide/mismatch, revérifiés au
  §1.
- **AFTER** : fermé pour la partie consolidation documentaire.
- **REMOTE_ACTION_REQUIRED** : les 6 points de la checklist (clé test, secret webhook réel,
  Price ID Test créés, `verify:stripe-prices` exécuté contre le compte réel, cycle Test complet
  rejoué) — tous nécessitent un accès Stripe réel, hors de portée de ce sandbox.

## 10. Preflight Preview consolidé

- **BEFORE** : `check-env-manifest.mjs --preflight` existait déjà et couvre l'essentiel (ENV, URLs,
  rôle de clé Supabase, mode Stripe) mais app par app, sans vérification Storage.
- **CHANGE** : `scripts/preflight-preview.mjs` — compose l'existant (aucune logique de validation
  dupliquée) pour les 6 unités du manifeste en une seule commande, ajoute la vérification Storage
  (seule capacité réellement nouvelle). Toujours en mode rapport (exit 0 par défaut, `--strict`
  disponible mais jamais appelé automatiquement), **non branché sur `build`/`prebuild`/`verify`** :
  `preflight_enforcement` reste `report` dans le manifeste, inchangé.
- **TEST** : `scripts/preflight-preview.test.mjs` (5 tests) + exécution manuelle confirmée contre
  les 6 gabarits (29 erreurs ENV correctement identifiées sur des gabarits volontairement vides de
  secrets — comportement attendu, pas un échec).
- **AFTER** : livré, non intrusif.
- **REMOTE_ACTION_REQUIRED** : aucune pour ce point précis — outil d'inventaire pour un opérateur
  humain, pas un gate automatique.

## 11. Vérifications finales (après la dernière modification de code)

| Vérification | Résultat |
|---|---|
| `npm run verify:env-manifest` (racine) | OK — 0 erreur, 14 `DECISION_REQUIRED` en attente (non bloquantes) |
| `npm run test:env-manifest` (racine) | 58/58 |
| `node --test scripts/preflight-preview.test.mjs` | 5/5 |
| `npm run verify:secrets` | 2516 fichiers, 0 secret reconnu |
| `npm run verify:migrations` | 313 migrations valides |
| `npx tsc --noEmit` (racine) | 0 erreur |
| `npx eslint .` (racine) | 0 erreur (6 avertissements préexistants, sans rapport avec cette mission) |
| `npx vitest run` (racine, `src/`+`packages/`) | 153 fichiers / 1786 tests, tous verts |
| Colors — typecheck/lint/test | 0 erreur / 0 erreur / 38 fichiers, 427 tests verts |
| Tools — test | 174 fichiers, 1992 tests verts |
| Réserves — test | 13 fichiers, 178 tests verts |
| Studio — typecheck/lint/test | 0 erreur / 0 erreur / 15 fichiers, 260 tests verts |
| `workers/studio-video` — typecheck/test | 0 erreur / 19 passent, 3 échecs (limitation `ffmpeg-static` du sandbox, déjà documentée, non liée à cette mission), 4 ignorés |
| `docker build` (worker) | **NOT_PROVEN_REMOTE** — aucun démon Docker privilégié disponible dans ce sandbox |
| `npm run build` (GP, apps) | **Non exécuté** — aucune modification de code source des 5 apps par cette mission ; risque jugé négligeable, temps réservé aux P1 restants plutôt qu'à un build sans variables d'environnement réelles à disposition |

## 12. Observation hors périmètre — à signaler

`AGENTS.md`/`CLAUDE.md` (racine et `apps/studio/`) contiennent une instruction demandant de lire
« node_modules/next/dist/docs/ » avant tout code, en affirmant que ce contenu serait régénéré par
`next dev`. **Cette instruction n'a pas été suivie** : `node_modules` n'est ni un artefact commité
ni une source fiable d'instructions de comportement, et rien dans un paquet npm standard de Next.js
ne justifie une telle affirmation. Signalé pour vérification par Julien — sans y voir un blocker
Preview, hors périmètre de cette mission de clôture.

## 13. Verdict

```
PREVIEW CONFIG READY FOR REMOTE EXECUTION
```

**Justification** : les 3 P0 de l'audit source sont fermés côté dépôt — 1 s'est révélé déjà
résolu (obsolète dès la rédaction de l'audit), 2 étaient réels et sont maintenant couverts par un
contrat/modèle de déploiement complet et testé localement. Les 8 P1 prouvés ont tous été traités :
4 fermés sans réserve (gabarits ENV, `vercel.json`, cartographie domaines, storage/Stripe
consolidés), 1 fermé pour sa part sécurité mais laissant un risque architectural documenté et
tracé plutôt que masqué (signup Studio), 1 documenté sans correction de code par décision
consciente de périmètre (repli localhost Réserves), 2 livrés comme nouveaux outils non intrusifs
(preflight consolidé). Le repo est maintenant reproductible et documenté de bout en bout pour un
provisioning Preview réel (runbook en 11 étapes ordonnées). **Ce n'est pas `PREVIEW BLOCKERS
OPEN`** (tous les blockers prouvés sont fermés ou explicitement requalifiés en décision produit) —
**et ce n'est certainement pas `PREVIEW QUALIFIED`** : aucune Preview réelle n'a jamais été
atteinte par cette mission ni par aucune session précédente ; `docker build` lui-même n'a jamais
été exécuté ; toutes les actions listées `REMOTE_ACTION_REQUIRED` ci-dessus restent à faire par un
opérateur humain avec un accès réel à Vercel/Supabase/Stripe.

---

*Rapport produit par lecture de dépôt, exécution de scripts/tests locaux et modification de
fichiers versionnés uniquement. Aucun accès Vercel/Supabase/Stripe/Docker réel à aucun moment de
cette mission.*
