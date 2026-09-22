# ELSATIA — Studio video render worker (Lot E/F)
#
# Ferme le blocker P0 « aucun modèle de déploiement Preview/Production documenté pour
# workers/studio-video » (audit préparation Preview). Ce n'est pas une app Next.js : c'est un
# processus long (BullMQ + outbox Postgres), sans script `build`, exécuté directement via `tsx`
# (voir package.json). Ce Dockerfile ne présuppose aucun fournisseur cloud — il produit une image
# OCI standard déployable sur n'importe quel hébergeur de conteneurs à processus long (pas de
# runtime serverless Vercel : timeouts trop courts, pas de disque scratch persistant par requête).
#
# IMPORTANT — le contexte de build DOIT être la racine du dépôt, pas workers/studio-video/, car
# le worker importe directement des sources TypeScript non compilées de packages/studio-domain
# (dépendance `file:../../packages/studio-domain`, aucun `dist/`). Construire avec :
#
#   docker build -f workers/studio-video/Dockerfile -t elsatia-studio-video .
#
# (exécuté depuis la racine du dépôt). Un build lancé avec workers/studio-video/ comme contexte
# échouera à la copie de packages/studio-domain.

FROM node:24-bookworm-slim AS base

# ffmpeg (paquet Debian, pas ffmpeg-static) : le binaire préconstruit ffmpeg-static utilisé en
# développement local s'est révélé incomplet dans au moins un bac à sable de qualification
# (filtre `drawtext` absent — voir docs/qualification, §1.6 de l'audit source). Le paquet Debian
# est compilé avec libfreetype/fontconfig et fournit drawtext/drawbox/overlay, requis par
# workers/studio-video/README.md (Lot F, templates texte). Vérifié au build (étape plus bas), pas
# seulement supposé.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN ffmpeg -hide_banner -filters 2>/dev/null | grep -q ' drawtext ' \
  && ffmpeg -hide_banner -filters 2>/dev/null | grep -q ' drawbox ' \
  && ffmpeg -hide_banner -filters 2>/dev/null | grep -q ' overlay ' \
  || (echo "ffmpeg installé sans drawtext/drawbox/overlay — image impropre au rendu Studio" >&2 && exit 1)

ENV STUDIO_FFMPEG_PATH=/usr/bin/ffmpeg \
    STUDIO_FFPROBE_PATH=/usr/bin/ffprobe \
    STUDIO_RENDER_TMP=/var/lib/studio-video/renders \
    NODE_ENV=production

WORKDIR /srv/elsatia

# Dépendance interne pure TypeScript, sans dépendances propres (packages/studio-domain/package.json
# ne déclare ni `dependencies` ni script `build`) : copiée telle quelle, jamais compilée.
COPY packages/studio-domain/ ./packages/studio-domain/

COPY workers/studio-video/package.json workers/studio-video/package-lock.json ./workers/studio-video/
WORKDIR /srv/elsatia/workers/studio-video
# `npm ci` (pas `--omit=dev`) : tsx et typescript sont des devDependencies mais le point d'entrée
# de production (`npm start`) exécute `tsx src/worker.ts` directement — aucun `dist/` n'existe
# dans ce train (cf. audit source, §1.1 : « aucun script build »). Reproduit la même install que
# le développement local, pas une seconde chaîne de build non éprouvée.
RUN npm ci

COPY workers/studio-video/src/ ./src/
COPY workers/studio-video/fonts/ ./fonts/
COPY workers/studio-video/tsconfig.json ./

RUN mkdir -p /var/lib/studio-video/renders \
  && groupadd --system studio && useradd --system --gid studio --home /srv/elsatia studio \
  && chown -R studio:studio /srv/elsatia /var/lib/studio-video
USER studio

# Aucun port HTTP : ce process ne sert aucune requête entrante (dispatcher + consommateur de
# queue). Le healthcheck vérifie la seule dépendance externe obligatoire à l'exécution (Redis) ;
# voir src/healthcheck.ts pour ce qu'il couvre et ne couvre pas.
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node --import tsx src/healthcheck.ts || exit 1

# Signal d'arrêt propre : worker.ts gère SIGTERM/SIGINT (annulation des rendus actifs, fermeture
# BullMQ/Redis). Laisser le temps à un rendu en cours de s'annuler proprement avant un SIGKILL —
# configurer `stop_grace_period`/équivalent hébergeur à au moins 15s.
STOPSIGNAL SIGTERM

# Commande par défaut : worker de rendu vidéo. Pour le worker d'analyse optionnel
# (STUDIO_AI_ANALYSIS=1, nécessite aussi un environnement Python — voir DEPLOYMENT.md), déployer
# une seconde instance de cette même image avec la commande :
#   npm run start:analysis
CMD ["npm", "start"]
