#!/usr/bin/env bash
# ELSATIA — Baseline performance V1 : mesure HTTP des parcours Colors (nuancier, recherche, filtres,
# routes principales). Prérequis : base préparée (tests/e2e/colors-pile-locale/preparer-base.sh +
# colors_charge.sql), pile de mesure sur cette base, Colors compilé et lancé sur :3010 avec
# COLORS_NUANCIER_FICHIER (nuancier de recette, ou generer-nuancier.mjs pour 5 000 teintes).
# Usage : ENV_PERF=/tmp/perf/env.sh MDP_RECETTE=… mesurer-colors.sh <étiquette> [users] [iterations]
set -euo pipefail
ETIQ="${1:?étiquette}"; USERS="${2:-1}"; ITER="${3:-10}"
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SORTIE="${SORTIE_PERF:-/tmp/perf/resultats}"; mkdir -p "$SORTIE"
source "${ENV_PERF:?ENV_PERF requis}"
EMP=d0000000-0000-4000-8000-000000000103
PATHS="/dashboard,/inventaire,/inventaire?q=velours,/inventaire?q=PERF-02999,/inventaire?etat=ouvert&emplacement=$EMP,/inventaire?faible=1&tri=nom,/nuanciers,/nuanciers?hex=%232E5B8A,/mouvements,/activite,/depots"
node "$ICI/bench-http.mjs" --app http://localhost:3010 --supabase "$NEXT_PUBLIC_SUPABASE_URL" --anon "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
  --users "$USERS" --email 'colors-admin@recette.invalid' --password "${MDP_RECETTE:?MDP_RECETTE requis}" --iterations "$ITER" --warmup 1 \
  --paths "$PATHS" --out "$SORTIE/colors_${ETIQ}_u${USERS}.json"
