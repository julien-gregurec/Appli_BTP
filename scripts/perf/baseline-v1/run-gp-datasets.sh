#!/usr/bin/env bash
# ELSATIA — Baseline performance V1 : construit les trois jeux Gestion Pro (petit / moyen / gros)
# sur des bases jetables clonées d'une base V5 fraîche (rebuild_db.sh), jamais Preview/Production.
#
# Usage : run-gp-datasets.sh <base_modele_v5> [petit|moyen|gros ...]
# Exemple : scripts/local-postgres-bootstrap/rebuild_db.sh perf_v5
#           scripts/perf/baseline-v1/run-gp-datasets.sh perf_v5 petit moyen gros
set -euo pipefail
MODELE="${1:?usage: run-gp-datasets.sh <base_modele_v5> [petit|moyen|gros ...]}"; shift
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TAILLES=("${@:-petit moyen gros}")

params() {
  case "$1" in
    #        comptes salariés clients chantiers devis factures planning/chantier planning récent lourds
    petit) echo "8 10 40 25 300 200 10 60 false" ;;
    moyen) echo "20 40 200 150 5000 3000 30 450 true" ;;
    gros)  echo "60 120 800 600 20000 12000 30 1500 true" ;;
    *) echo "taille inconnue: $1" >&2; exit 2 ;;
  esac
}

for t in ${TAILLES[@]}; do
  read -r c s cl ch d f pc pr l <<<"$(params "$t")"
  base="perf_gp_$t"
  su postgres -c "psql -Xq -c 'drop database if exists $base' -c 'create database $base template $MODELE'"
  debut=$(date +%s)
  su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d $base \
    -v nb_comptes=$c -v nb_salaries=$s -v nb_clients=$cl -v nb_chantiers=$ch -v nb_devis=$d \
    -v nb_factures=$f -v nb_planning_par_chantier=$pc -v nb_planning_recent=$pr -v devis_lourds=$l \
    -f $ICI/gp_fixture_scaled.sql" > "/tmp/perf_fixture_$t.log" 2>&1
  su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d $base -f $ICI/gp_affectations.sql" >> "/tmp/perf_fixture_$t.log" 2>&1
  su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d $base -f $ICI/gp_bench_access.sql" >> "/tmp/perf_fixture_$t.log" 2>&1
  echo "$t : $base prête en $(( $(date +%s) - debut )) s ($(su postgres -c "psql -XAt -d $base -c \"select pg_size_pretty(pg_database_size('$base'))\""))"
done
