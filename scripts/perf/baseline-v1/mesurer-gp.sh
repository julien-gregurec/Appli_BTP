#!/usr/bin/env bash
# ELSATIA — Baseline performance V1 : mesure HTTP des parcours Gestion Pro sur une base de jeu.
# Prérequis : GP compilé et lancé (`next start -p 3100`) avec l'environnement ENV_PERF.
# Usage : ENV_PERF=/tmp/perf/env.sh mesurer-gp.sh <base> <étiquette> [users] [iterations] [paths-extra]
set -euo pipefail
BASE="${1:?base}"; ETIQ="${2:?étiquette}"; USERS="${3:-1}"; ITER="${4:-10}"
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SORTIE="${SORTIE_PERF:-/tmp/perf/resultats}"; mkdir -p "$SORTIE"
source "${ENV_PERF:?ENV_PERF requis}"
E=a0000000-0000-4000-a000-000000000001
q() { su postgres -c "psql -XAt -d $BASE -c \"$1\""; }
# Fiche chantier : le chantier le plus chargé en pointages (pire cas réel du jeu).
CH=$(q "select chantier_id from pointages where entreprise_id='$E' group by 1 order by count(*) desc limit 1")
# Devis : le plus gros devis du jeu (1 000 lignes si présent) ; facture : la plus longue.
DV=$(q "select devis_id from lignes_devis where entreprise_id='$E' group by 1 order by count(*) desc limit 1")
FA=$(q "select facture_id from lignes_factures where entreprise_id='$E' group by 1 order by count(*) desc limit 1")
PATHS="/dashboard,/chantiers,/chantiers/$CH,/devis,/devis/$DV,/factures,/factures/$FA,/planning,/pointage,/pointage/gestion${5:+,$5}"
echo "$ETIQ : chantier=$CH ($(q "select count(*) from pointages where chantier_id='$CH'") pointages) devis=$DV ($(q "select count(*) from lignes_devis where devis_id='$DV'") lignes) facture=$FA"
node "$ICI/bench-http.mjs" --app http://127.0.0.1:3100 --supabase "$NEXT_PUBLIC_SUPABASE_URL" --anon "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
  --users "$USERS" --email 'fixture.principale.{i}@perf.invalid' --password 'Perf-Baseline-2026!' --user-pool "${USER_POOL:-$USERS}" \
  --iterations "$ITER" --warmup 1 --paths "$PATHS" --out "$SORTIE/gp_${ETIQ}_u${USERS}.json"
