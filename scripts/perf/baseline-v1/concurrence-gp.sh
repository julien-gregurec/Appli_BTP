#!/usr/bin/env bash
# ELSATIA — Baseline performance V1 : charge concurrente 10 / 25 / 50 utilisateurs sur des actions
# SÛRES (GET de pages authentifiées, aucune écriture), avec échantillonnage mémoire (RSS) du
# serveur Next, de PostgREST et de PostgreSQL toutes les secondes.
# Usage : ENV_PERF=/tmp/perf/env.sh concurrence-gp.sh <base> <étiquette> [iterations=3] [niveaux="10 25 50"]
set -euo pipefail
BASE="${1:?base}"; ETIQ="${2:?étiquette}"; ITER="${3:-3}"; NIVEAUX="${4:-10 25 50}"
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SORTIE="${SORTIE_PERF:-/tmp/perf/resultats}"; mkdir -p "$SORTIE"
source "${ENV_PERF:?ENV_PERF requis}"
E=a0000000-0000-4000-a000-000000000001
q() { su postgres -c "psql -XAt -d $BASE -c \"$1\""; }
CH=$(q "select chantier_id from pointages where entreprise_id='$E' group by 1 order by count(*) desc limit 1")
POOL=$(q "select count(*) from auth.users where email like 'fixture.principale.%'")
PATHS="/dashboard,/chantiers,/chantiers/$CH,/devis,/factures,/planning,/pointage"
bash "$ICI/pile-mesure.sh" "$BASE" "${DB_POOL:-10}" >/dev/null
rss() { ps -o rss= -p "$(pgrep -f "$1" | head -1)" 2>/dev/null | tr -d ' ' || echo 0; }
for n in $NIVEAUX; do
  memoire="$SORTIE/memoire_${ETIQ}_u$n.tsv"; : > "$memoire"
  ( while true; do
      pg=$(ps -C postgres -o rss= | awk '{s+=$1} END {print s}')
      printf '%s\t%s\t%s\t%s\n' "$(date +%s)" "$(rss "^next-server")" "$(rss "^\./postgrest perf")" "$pg" >> "$memoire"; sleep 1
    done ) & echantillonneur=$!
  node "$ICI/bench-http.mjs" --app http://127.0.0.1:3100 --supabase "$NEXT_PUBLIC_SUPABASE_URL" --anon "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
    --users "$n" --user-pool "$POOL" --email 'fixture.principale.{i}@perf.invalid' --password 'Perf-Baseline-2026!' \
    --iterations "$ITER" --warmup 0 --paths "$PATHS" --out "$SORTIE/gp_${ETIQ}_u$n.json" | head -1
  kill "$echantillonneur" 2>/dev/null; wait "$echantillonneur" 2>/dev/null || true
  awk -F'\t' 'BEGIN{n=0;p=0;g=0} {if($2>n)n=$2; if($3>p)p=$3; if($4>g)g=$4} END {printf "  mémoire max : next %.0f Mo · postgrest %.0f Mo · postgres (tous processus) %.0f Mo\n", n/1024, p/1024, g/1024}' "$memoire"
done
