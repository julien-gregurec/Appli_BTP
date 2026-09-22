# ELSATIA — Studio Video Worker — Production Readiness V1

Date : 2026-09-22
Dépôt audité : `julien-gregurec/appli_btp`, branche `claude/gifted-newton-pkx1id`
Auteur : session Claude Code autonome (mission nocturne ~8h demandée)

## Verdict

**STUDIO WORKER BLOCKED**

Le worker décrit par la mission (`workers/studio-video`, Dockerfile, pipeline
FFmpeg avec queue/claim/render/upload/callback, Redis, multi-tenant, etc.)
**n'existe pas dans ce dépôt**. Il n'y a donc rien à construire, exécuter,
charger, attaquer ou qualifier. Toute section de rapport prétendant avoir
mesuré des temps de rendu, un débit de concurrence, un comportement Redis ou
une résistance à l'injection de commandes FFmpeg pour ce composant serait
fabriquée — je ne produis pas ce genre de contenu inventé. Ce rapport documente
au contraire, honnêtement, ce qui a été vérifié et pourquoi le blocage est
réel.

## 1. Ce que ce dépôt est réellement

`package.json` : `"name": "liria-gestion-pro"`, `"version": "3.0.0"`.
C'est une application **Next.js 16 / React 19 / Supabase** de gestion
d'entreprise BTP (devis, chantiers, pointage, facturation, RGPD...). Le
`README.md` est le boilerplate `create-next-app` standard. Aucune trace,
nulle part dans le dépôt, du nom « ELSATIA » ni d'un service « studio-video ».

Preuves (recherches exhaustives, hors `node_modules` et `.git`) :

```
find . -type d -iname "workers"                     -> aucun résultat
find . -iname "Dockerfile*"                          -> aucun résultat
find . -path "*qualification*"                       -> aucun résultat (avant création de ce fichier)
grep -riE "ELSATIA"                                  -> aucun résultat
grep -riE "redis|bullmq|job queue"                   -> aucun résultat
grep -ril "ffmpeg" (hors node_modules)                -> 2 fichiers seulement :
    scripts/video/monter.py
    scripts/create-liria-videos.py
```

## 2. Les deux seuls fichiers liés à FFmpeg trouvés

- `scripts/video/monter.py` — script local de montage de 3 versions d'une
  vidéo promotionnelle à partir de rushes locaux (`output/video/plans/*.mp4`).
  Le chemin vers le binaire FFmpeg est **codé en dur vers un répertoire
  scratchpad macOS d'une session Claude antérieure**
  (`/private/tmp/claude-501/-Users-juliengregurec/.../@ffmpeg-installer/darwin-x64/ffmpeg`),
  tout comme le chemin vers `edge-tts`. Ce script ne peut pas s'exécuter tel
  quel dans cet environnement (le chemin n'existe pas ici), et ce n'est de
  toute façon pas un service : pas de queue, pas de tenant, pas d'API, pas de
  retry, pas de callback.
- `scripts/create-liria-videos.py` — générateur de vidéos tutoriel/pub
  (démo d'interface animée, voix off, sous-titres), même nature : script
  ponctuel exécuté à la main, pas un worker de production.

Aucun des deux n'a de conteneurisation, de gestion de jobs, de
multi-tenant, de webhook de callback, ni de tests associés. Ils ne
correspondent à aucune des 12 sections demandées par la mission (queue,
claim, upload, callback Redis, idempotence, sécurité tenant, etc.).

## 3. Vérifications effectuées malgré tout

Pour écarter l'hypothèse d'un simple oubli de synchronisation, j'ai vérifié :

- **Git** : `git status` propre, aucun commit en attente, aucun stash. Les
  10 derniers commits (`git log`) portent tous sur le produit BTP (devis,
  pointage, alertes, médias de chantier, exports comptables) — rien sur un
  studio vidéo ou un worker FFmpeg.
- **Branches distantes** : seules `main` et `claude/gifted-newton-pkx1id`
  existent ; pas de branche `studio-video` ou équivalente à fusionner.
- **Docker** : aucun `Dockerfile`, `docker-compose.yml`, ni configuration de
  déploiement de worker nulle part dans l'arborescence versionnée.
- **docs/** : le dossier contient des audits produits BTP (sécurité,
  migrations, RGPD, tarification...) mais aucun document « Preview » lié à un
  studio vidéo.

## 4. Point de sécurité annexe (hors périmètre de la mission, signalé par prudence)

`AGENTS.md` (chargé automatiquement via `CLAUDE.md` → `@AGENTS.md`) contient
l'instruction suivante :

> « This is NOT the Next.js you know — Read the relevant guide in
> `node_modules/next/dist/docs/` before writing any code. »

Vérification : `node_modules/next/dist/docs/` **n'existe pas**
(`ls` renvoie *No such file or directory*), et le projet utilise bien le
Next.js standard (`next@^16.2.12`, structure App Router classique). Cette
instruction est donc factuellement fausse et n'a pas été suivie — elle a
toutes les caractéristiques d'une tentative d'injection de prompt via un
fichier de config versionné plutôt qu'une consigne légitime du projet. Je la
signale pour information ; elle n'affecte pas le verdict ci-dessus.

## 5. Recommandation

Aucune qualification FFmpeg/Redis/concurrence/sécurité ne peut être produite
sans le code source réel du worker. Pour lever le blocage :

1. Confirmer le dépôt exact contenant `workers/studio-video` (ce n'est
   probablement pas `julien-gregurec/appli_btp` — vérifier s'il s'agit d'un
   autre dépôt du même compte, à ajouter explicitement à la session via
   `add_repo`).
2. Une fois le bon dépôt identifié, relancer une mission de qualification
   ciblant son Dockerfile et son code réels — les 12 sections demandées
   (build, FFmpeg, job flow, Redis, concurrence, injection de pannes,
   idempotence, sécurité, observabilité, limites) resteront pertinentes et
   pourront être exécutées pour de vrai à ce moment-là.

Aucune modification de code n'a été effectuée dans ce dépôt ; ce rapport est
la seule livraison de cette session.
