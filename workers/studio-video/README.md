# ELSATIA Studio video worker — Lot E

Worker TypeScript séparé de Next.js. Node 24, FFmpeg, ffprobe, Redis 7 et la migration `20260913010000_studio_render_engine.sql` sont nécessaires. Le client Web n'importe jamais ce package. Contrat : [rendu v1](../../ELSATIA-STUDIO-RENDER-CONTRACT.md).

## Installation locale

```sh
npm ci --prefix apps/studio
npm ci --prefix workers/studio-video
```

Copier `.env.example` dans un fichier privé, renseigner les credentials **locaux** et l'adresse du Redis dédié. Les binaires npm servent à la qualification locale ; `STUDIO_FFMPEG_PATH` et `STUDIO_FFPROBE_PATH` permettent de choisir des binaires maintenus, qualifiés sur l'hôte cible. Le lint réutilise uniquement les règles TypeScript installées dans `apps/studio`.

```sh
cd workers/studio-video
node --env-file=.env.local --import=tsx src/worker.ts
```

Le worker et le dispatcher tournent dans ce processus, avec une concurrence de 1. L'outbox PostgreSQL réalimente la queue toutes les 2 secondes ; Redis est un transport reconstructible. Une interruption de plus de 60 secondes fait échouer les leases actives. Une relance manuelle crée une nouvelle tentative. Arrêt SIGTERM/SIGINT : annulation des encodeurs actifs, nettoyage, fermeture de la queue.

## Vérifications

```sh
npm run lint
npm run typecheck
npm test
STUDIO_RENDER_EVIDENCE=/tmp/studio-render-qualification npm exec -- tsx tests/qualify.ts
```

Les tests unitaires incluent de vrais rendus courts, pixels de transition, AAC silencieux, MOV avec trim/volume et interruption. `qualify.ts` génère ses fixtures et huit MP4 ; aucun média lourd n'est versionné. La recette complète est `node apps/studio/scripts/e2e-gate.mjs` depuis la racine, après installation des dépendances racine/app/worker et du navigateur Playwright. Elle crée et supprime uniquement ses propres runtimes Supabase et Redis. Ne pas lancer plusieurs gates sur les mêmes ports.

## Réconciliation manuelle locale

```sh
node --env-file=.env.local --import=tsx src/reconcile.ts
node --env-file=.env.local --import=tsx src/reconcile.ts --apply
```

L'origine doit être `127.0.0.1` et `STUDIO_RENDER_TMP` un chemin absolu dédié. Dry run par défaut. Dossiers temporaires de leases inactives et objets sans output conservé : délai minimum d'une heure. Les sorties publiées et leases actives sont conservées. Refus si fenêtre de 1 000 jobs/outputs ou 20 000 objets dépassée : prévoir alors une pagination supervisée. Les historiques failed/cancelled restent en base ; seuls leurs déchets physiques sont nettoyés. Aucun cron ou déploiement Production installé.

## Templates et texte — Lot F

Appliquer également `20260913020000_studio_templates.sql` dans l'environnement local de test. Le worker utilise les primitives du snapshot et ne consulte pas le catalogue métier. Déployer son dossier `fonts/` avec le code : Noto Sans/Serif regular/bold, licence OFL et hashes dans `provenance.json`. Aucun fetch de fontes au runtime. FFmpeg doit fournir `drawtext`, `drawbox` et `overlay` en plus des filtres E. Fontkit est verrouillé dans le lockfile. Les glyphes européens courants sont qualifiés ; un glyphe absent provoque un échec de rendu.

Depuis le dossier worker, pour les preuves F locales :

```sh
node --import tsx tests/compare-templates.ts
node --import tsx tests/qualify-templates.ts
node --import tsx tests/qualify-text.ts
```

Le premier script compare les six styles avec les mêmes médias et 60 secondes. Le deuxième génère neuf MP4 et les frames dans `/tmp/elsatia-studio-lot-f/qualification`. Le troisième utilise sa fixture image pour quatre vidéos de texte long. `qualify-templates.ts --previews` régénère les petits aperçus publics dans `apps/studio/public/template-previews/` : ces fichiers sont des démonstrations synthétiques, pas des médias utilisateur. Ne pas exécuter ces commandes simultanément avec un autre gate sur une machine contrainte.
