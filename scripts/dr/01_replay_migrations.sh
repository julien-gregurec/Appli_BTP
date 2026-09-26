#!/usr/bin/env bash
# Rejoue supabase/migrations/*.sql, dans l'ordre, sur une base PostgreSQL
# locale jetable, après avoir posé les stubs Supabase (00_supabase_stubs.sql).
#
# Usage:
#   scripts/dr/01_replay_migrations.sh [--fresh]
#
#   --fresh   Supprime et recrée DR_PGDATABASE avant de rejouer les migrations
#             (sinon le script échoue si la base existe déjà, par sécurité).
#
# Variables d'environnement (voir lib/common.sh pour les défauts) :
#   DR_PGHOST, DR_PGPORT, DR_PGDATABASE, DR_PGUSER, DR_PGPASSWORD
#
# N'écrit jamais sur une base distante ni sur une base dont le nom ne
# commence pas par 'elsatia_dr_drill' (voir dr_require_local_target).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
source lib/common.sh

usage() {
  sed -n '2,15p' "${BASH_SOURCE[0]}"
}

FRESH=0
for arg in "$@"; do
  case "$arg" in
    --help|-h) usage; exit 0 ;;
    --fresh) FRESH=1 ;;
    *) dr_die "Argument inconnu: $arg (voir --help)" ;;
  esac
done

dr_require_local_target

PG_EXT_DIR="$(pg_config --sharedir 2>/dev/null || echo /usr/share/postgresql/16)/extension"
if [[ ! -f "$PG_EXT_DIR/pgsodium.control" ]]; then
  dr_die "Stub pgsodium absent ($PG_EXT_DIR/pgsodium.control). Lancez d'abord: sudo ./00b_install_pgsodium_stub.sh"
fi

MIGRATIONS_DIR="$(cd ../../supabase/migrations && pwd)"
STUB_FILE="$(pwd)/00_supabase_stubs.sql"

if [[ "$FRESH" == "1" ]]; then
  dr_log "Suppression/recréation de la base '$DR_PGDATABASE' (--fresh)."
  dr_psql_db postgres -c "drop database if exists \"$DR_PGDATABASE\";"
  dr_psql_db postgres -c "create database \"$DR_PGDATABASE\";"
else
  if ! dr_psql_db postgres -tAc "select 1 from pg_database where datname='$DR_PGDATABASE'" | grep -q 1; then
    dr_die "Base '$DR_PGDATABASE' absente. Relancez avec --fresh pour la créer."
  fi
fi

dr_log "Application des stubs Supabase (00_supabase_stubs.sql)."
dr_psql -f "$STUB_FILE"

FILES=("$MIGRATIONS_DIR"/*.sql)
TOTAL=${#FILES[@]}
dr_log "Rejeu de $TOTAL migrations depuis $MIGRATIONS_DIR"

START_TS=$(date +%s.%N)
N=0
for f in "${FILES[@]}"; do
  N=$((N + 1))
  if ! dr_psql -f "$f" 2>"/tmp/dr_migration_error.$$"; then
    dr_log "ECHEC migration #$N/$TOTAL : $(basename "$f")"
    cat "/tmp/dr_migration_error.$$" >&2
    rm -f "/tmp/dr_migration_error.$$"
    exit 1
  fi
  rm -f "/tmp/dr_migration_error.$$"
done
END_TS=$(date +%s.%N)

DURATION=$(awk -v a="$START_TS" -v b="$END_TS" 'BEGIN{printf "%.2f", b-a}')
dr_log "OK: $TOTAL/$TOTAL migrations appliquées en ${DURATION}s sur '$DR_PGDATABASE'."
