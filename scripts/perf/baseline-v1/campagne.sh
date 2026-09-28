#!/usr/bin/env bash
# ELSATIA — Baseline performance V1 : une campagne de mesure = (re)démarrer la pile sur une base,
# remettre pg_stat_statements à zéro, jouer un banc, puis extraire les requêtes lentes de CETTE base
# (seuils 100 ms / 500 ms / 1 s sur le temps moyen et maximal d'exécution).
# Usage : ENV_PERF=/tmp/perf/env.sh campagne.sh <base> <étiquette> <commande de banc…>
set -euo pipefail
BASE="${1:?base}"; ETIQ="${2:?étiquette}"; shift 2
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SORTIE="${SORTIE_PERF:-/tmp/perf/resultats}"; mkdir -p "$SORTIE"
bash "$ICI/pile-mesure.sh" "$BASE" "${DB_POOL:-10}" >/dev/null
su postgres -c "psql -XAtq -d $BASE -c 'select extensions.pg_stat_statements_reset()'" >/dev/null
"$@"
su postgres -c "psql -XAt -d $BASE" > "$SORTIE/pgss_${ETIQ}.tsv" <<'SQL'
select round(mean_exec_time::numeric, 1) moyenne_ms, round(max_exec_time::numeric, 1) max_ms, calls,
       round(total_exec_time::numeric) total_ms, rows,
       regexp_replace(left(query, 400), '\s+', ' ', 'g') requete
from extensions.pg_stat_statements
where dbid = (select oid from pg_database where datname = current_database())
  and query not ilike '%pg_stat_statements%'
order by total_exec_time desc limit 60;
SQL
su postgres -c "psql -XAt -d $BASE" <<'SQL' | sed "s/^/[$ETIQ] requêtes lentes (moyenne) /"
select '>100ms=' || count(*) filter (where mean_exec_time > 100) || ' >500ms=' || count(*) filter (where mean_exec_time > 500)
    || ' >1s=' || count(*) filter (where mean_exec_time > 1000)
    || ' | (max) >100ms=' || count(*) filter (where max_exec_time > 100) || ' >500ms=' || count(*) filter (where max_exec_time > 500)
    || ' >1s=' || count(*) filter (where max_exec_time > 1000)
from extensions.pg_stat_statements where dbid = (select oid from pg_database where datname = current_database());
SQL
