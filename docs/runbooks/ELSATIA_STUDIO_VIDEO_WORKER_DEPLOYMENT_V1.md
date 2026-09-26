# ELSATIA — Déploiement du worker `workers/studio-video` (V1)

Ferme le blocker P0 « `workers/studio-video` n'a aucun modèle de déploiement Preview/Production
documenté et n'est pas déployable tel quel sur Vercel serverless » (audit de préparation Preview,
§1.6, §7 P0-3). Ce document décrit le composant tel qu'il existe réellement dans ce train (lecture
de code, pas de supposition) puis le modèle de déploiement livré (`Dockerfile`,
`src/healthcheck.ts`). **Aucun déploiement réel n'a été exécuté pour produire ce document.**

## 1. Ce que ce composant est réellement

- **Pas une app Next.js, pas de script `build`.** `package.json` ne déclare que `start`
  (`tsx src/worker.ts`) et `start:analysis` (`tsx src/analysis-worker.ts`) : le code TypeScript est
  exécuté directement, transpilé à la volée. **C'est un fait structurel, pas un oubli** — le
  Dockerfile livré respecte ce choix (`npm ci` sans `--omit=dev`, pas de second système de build).
- **Processus long, pas une fonction.** Le worker tourne indéfiniment (`setInterval` de dispatch
  toutes les 2s, `Worker` BullMQ en écoute continue), incompatible avec un runtime serverless à
  courte durée de vie (Vercel Functions, Lambda classique) : c'est la raison technique exacte pour
  laquelle Vercel est exclu, pas une préférence arbitraire.
- **Dépendance interne non publiée.** Importe directement les sources TypeScript de
  `packages/studio-domain/` (`file:../../packages/studio-domain`, aucun `dist/`) — le contexte de
  build doit donc inclure la racine du dépôt, pas seulement `workers/studio-video/` (détaillé dans
  le `Dockerfile`).
- **Runtime** : Node 24 (`workers/studio-video/README.md`), TypeScript exécuté via `tsx`.
- **FFmpeg/FFprobe** : requis pour `render.ts`/`text-layout.ts`. En développement local,
  `ffmpeg-static`/`ffprobe-static` (binaires précompilés, `devDependencies`) sont utilisés par
  défaut, avec repli possible sur des binaires choisis via `STUDIO_FFMPEG_PATH`/
  `STUDIO_FFPROBE_PATH`. **Constat vérifié dans ce sandbox** (pas seulement rapporté) : le binaire
  `ffmpeg-static` qualifié ici ne fournit pas le filtre `drawtext` (`tests/templates.test.ts` échoue
  avec `No such filter: 'drawtext'`), requis par le Lot F (templates texte). C'est documenté comme
  une limitation d'environnement de développement, pas un défaut de code — mais cela signifie qu'un
  déploiement réel **ne doit pas** supposer que `ffmpeg-static` convient : le modèle de déploiement
  livré installe le paquet `ffmpeg` de Debian (compilé avec `libfreetype`/`fontconfig`) et vérifie
  `drawtext`/`drawbox`/`overlay` **au moment du build de l'image**, pas au premier job en
  production.
- **File d'attente** : BullMQ sur Redis (`STUDIO_REDIS_URL`, Redis 7 requis par le README). Le
  README le dit explicitement : *« Redis est un transport reconstructible »* — la source de vérité
  du travail à faire est l'outbox PostgreSQL (`studio_render_dispatch()` RPC, interrogée toutes les
  2s), pas Redis. **Conséquence pour le déploiement** : Redis n'a besoin d'aucune persistance ni
  d'aucune haute disponibilité particulière ; une instance Redis minimale (managée ou conteneur
  dédié) suffit, redémarrable sans perte fonctionnelle.
- **Stockage** : lit `studio-originals` (privé) et écrit `studio-renders` (privé) via l'API REST
  Storage de Supabase, authentifié par `STUDIO_STORAGE_SERVICE_KEY` (clé de service — jamais
  publique). Aucun SDK Storage, appels `fetch` directs avec `AbortSignal` et limites de taille
  strictes (5 Go téléchargés cumulés, 1 Go de sortie, 10 Go de scratch disque par job).
- **Callback / notification de complétion** : pas de webhook HTTP sortant. La complétion est
  publiée par écriture dans PostgreSQL via RPC (`studio_complete_render`, `studio_render_progress`)
  — l'app Studio (Next.js) lit cet état directement en base. Rien à configurer côté réseau entrant
  pour ce composant : **aucun port HTTP n'est nécessaire pour le fonctionnement normal**.
- **Retry** : chaque job BullMQ est ajouté avec `attempts: 1` (`worker.ts:64`) — **BullMQ ne
  retente jamais un job automatiquement**. Le mécanisme de reprise réel est au niveau applicatif :
  un bail (`lease`) expire après 60s d'interruption (README) et le prochain cycle de dispatch (2s)
  relance un nouveau bail sur le même job via l'outbox. Une « relance manuelle » (mentionnée dans le
  README) recrée une tentative. **Ne pas configurer de retry BullMQ supplémentaire** : ce serait un
  second mécanisme de reprise en doublon de celui déjà écrit, source d'incohérence.
- **Timeout** : `STUDIO_RENDER_TIMEOUT_SECONDS`, borné entre 30s et 3600s (`worker.ts:108-114`),
  30 minutes par défaut absent → 600s (10 min) via `.env.example`.
- **Concurrency** : codée en dur à `1` (`worker.ts:299`, `{ concurrency: 1 }`) — un seul rendu à la
  fois par instance de processus. **Le passage à l'échelle se fait horizontalement** (plusieurs
  instances du même conteneur), pas en augmentant ce paramètre : chaque instance revendique un job
  via `studio_claim_render` (bail atomique côté Postgres), donc plusieurs instances peuvent tourner
  en parallèle sans collision. Ne pas modifier `concurrency` sans revoir aussi la logique de
  bail/disque scratch qui suppose un seul rendu actif par processus.
- **Observabilité** : logs JSON structurés sur `stdout`/`stderr` uniquement (`event: "completed"`,
  `"failed"`, `"dispatch_unavailable"`, `"queue_unavailable"`) — pas de Sentry, pas de métriques
  exportées dans ce composant à ce jour. Un hébergeur de conteneurs qui collecte `stdout`/`stderr`
  (systemd journal, Docker logging driver, CloudWatch Logs, etc.) suffit ; aucune configuration
  supplémentaire n'est requise pour obtenir ces événements.

## 2. Ce qui est livré ici

| Fichier | Rôle |
|---|---|
| `workers/studio-video/Dockerfile` | Image déterministe : Node 24, FFmpeg Debian (vérifié `drawtext`/`drawbox`/`overlay` au build), utilisateur non-root, healthcheck câblé, `STOPSIGNAL SIGTERM`. |
| `workers/studio-video/Dockerfile.dockerignore` | Exclut `node_modules`, tests, fixtures d'analyse du contexte de build. |
| `workers/studio-video/src/healthcheck.ts` | Liveness check : vérifie que Redis répond (`PING`). Ne vérifie **pas** Supabase, le disque ou FFmpeg — ces défaillances remontent déjà comme échecs de job (`event: "failed"`), pas comme processus mort ; un healthcheck qui les couvrirait redémarrerait un worker au milieu d'un rendu en cours pour une cause déjà gérée ailleurs. |
| `workers/studio-video/tests/healthcheck.test.ts` | Couvre succès, réponse inattendue, échec de connexion, et libération systématique de la connexion Redis. |

**Non livré, volontairement** : un `docker-compose.yml` de démonstration n'a pas été ajouté — le
README local documente déjà une exécution `node --env-file=.env.local --import=tsx src/worker.ts`
directe (plus simple que Docker pour la qualification locale), et un compose de référence pour
Redis local existe déjà implicitement via les fixtures de test. Ajouter un compose superflu aurait
dupliqué ce chemin sans le remplacer.

## 3. Modèle de déploiement (générique, sans fournisseur imposé)

Le dépôt n'impose aucun fournisseur cloud (aucun `Dockerfile`, manifeste Kubernetes/ECS/Fly.io
préexistant nulle part). Le livrable est donc une image OCI standard, déployable sur **n'importe
quel hébergeur de conteneurs à processus long** (ex. Fly.io, Railway, Render, ECS/Fargate, Cloud
Run avec `min-instances=1`+`concurrency=1`, un VM avec `systemd`+`docker run`, etc.) — le choix
final reste `DECISION_REQUIRED:HOSTING-PROVIDER-STUDIO-WORKER` (owner Julien, aucune préférence
technique déduite du dépôt qui imposerait un fournisseur plutôt qu'un autre).

Contrat minimal pour n'importe quel hébergeur retenu :

1. **Process type** : long-running / worker, pas serverless-HTTP. Pas de port à exposer
   publiquement (aucun trafic entrant).
2. **Build** : `docker build -f workers/studio-video/Dockerfile -t <image> .` exécuté avec la
   **racine du dépôt comme contexte** (voir en-tête du Dockerfile).
3. **Variables d'environnement** : jeu complet déjà déclaré dans `config/env-manifest.json` sous
   l'unité `studio_worker` (17 variables, requises listées dans le gabarit
   `workers/studio-video/.env.example`) — ne pas en réinventer un second, ce gabarit est la
   source de vérité et déjà validée par `scripts/check-env-manifest.mjs` en CI.
4. **Réseau sortant requis** : Supabase (API REST + Storage), Redis (`STUDIO_REDIS_URL`). Aucune
   entrée réseau requise.
5. **Disque** : `STUDIO_RENDER_TMP` doit pointer vers un volume avec au moins 10-15 Go libres
   (marge sur la limite de 10 Go de scratch par job) et un accès en écriture pour l'utilisateur
   non-root `studio` créé par l'image.
6. **Redémarrage** : `STOPSIGNAL SIGTERM` + `HEALTHCHECK` sont câblés dans l'image ; configurer la
   politique de redémarrage de l'hébergeur sur « toujours » avec un délai de grâce d'au moins 15s
   pour laisser `worker.ts` annuler proprement un rendu en cours (voir `process.on("SIGTERM", …)`).
7. **Mise à l'échelle** : horizontale uniquement (plusieurs instances de la même image), jamais en
   augmentant `concurrency` dans le code (§1).
8. **Worker d'analyse optionnel** (`STUDIO_AI_ANALYSIS=1`) : nécessite en plus un interpréteur
   Python 3.9–3.12 avec `workers/studio-video/analysis/requirements.txt` installé
   (`opencv-python-headless`, `numpy`), désigné par `STUDIO_ANALYSIS_PYTHON`. **Non inclus dans
   l'image livrée** (fonctionnalité désactivée par défaut, `STUDIO_AI_ANALYSIS=0`) : si activée,
   construire une variante de l'image ajoutant `python3`/`pip` + `requirements.txt`, ou déployer un
   second conteneur dédié avec la commande `npm run start:analysis`. Décision non prise ici —
   `DECISION_REQUIRED:STUDIO-AI-ANALYSIS-DEPLOYMENT` si cette fonctionnalité entre dans le
   périmètre d'une Preview.

## 4. Non vérifié depuis ce bac à sable (`NOT_PROVEN_REMOTE`)

- **Le build Docker lui-même n'a pas pu être exécuté ici** : aucun démon Docker privilégié
  disponible dans ce sandbox (`docker info` échoue sur `/var/run/docker.sock`, `ulimit: Operation
  not permitted` au démarrage du service). Le `Dockerfile` a été relu ligne à ligne et son étape de
  vérification `drawtext`/`drawbox`/`overlay` testée par équivalence (même format de sortie
  `ffmpeg -filters` confirmé avec le binaire `ffmpeg-static` local), mais **`docker build` doit être
  exécuté une première fois par un opérateur avant toute utilisation réelle** — c'est la première
  étape du runbook de déploiement (§6).
- Comportement réel de l'hébergeur retenu (redémarrage, logs, secrets) : dépend du choix fait pour
  `DECISION_REQUIRED:HOSTING-PROVIDER-STUDIO-WORKER`, non tranché ici.

---

*Document produit par lecture de dépôt et exécution locale de tests unitaires uniquement. Aucun
déploiement réel, aucun accès à un hébergeur de conteneurs.*
