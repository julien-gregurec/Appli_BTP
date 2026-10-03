#!/usr/bin/env bash
# ELSATIA — Pack opérateur V9 : SIMULATEUR LOCAL de la CLI Supabase, pour le banc du cutover.
#
# N'est utilisé que par `v9-cutover.sh --local-harness`, sur une base PostgreSQL LOCALE
# (ELSATIA_V9_HARNESS_DB=elsatia_v9_harness_*). Ne parle à aucun service distant.
# Reproduit le comportement de `supabase db push` qui compte pour le pack :
#   - versions en attente = fichiers locaux absents de supabase_migrations.schema_migrations ;
#   - une version en attente ANTÉRIEURE au ledger → message « --include-all » et échec ;
#   - --dry-run : « Would push these migrations: • <fichier> » ;
#   - application : une transaction par migration, ledger complété au fil de l'eau (un échec
#     laisse un ledger partiel, comme la vraie CLI).
#   - ELSATIA_V9_HARNESS_FAIL_AT=<version> : fait échouer cette migration (scénario rollback A).
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
DB="${ELSATIA_V9_HARNESS_DB:-}"
case "$DB" in elsatia_v9_harness_*) ;; *) echo "supabase-sim : ELSATIA_V9_HARNESS_DB=elsatia_v9_harness_* requis" >&2; exit 2 ;; esac
q() { psql -X -At -v ON_ERROR_STOP=1 -d "$DB" -c "$1"; }

if [ "${1:-}" = "--version" ]; then echo "supabase-sim (banc local du pack Preview)"; exit 0; fi
[ "${1:-}" = "db" ] && [ "${2:-}" = "push" ] || { echo "supabase-sim : seule « db push » est simulée" >&2; exit 2; }
shift 2
DRY=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    --linked|--yes) ;;
    --include-all) echo "supabase-sim : --include-all refusé par le banc" >&2; exit 2 ;;
    *) echo "supabase-sim : option inconnue $a" >&2; exit 2 ;;
  esac
done

derniere="$(q "select coalesce(max(version), '') from supabase_migrations.schema_migrations")"
attente=()
anterieures=()
for f in "$REPO"/supabase/migrations/*.sql; do
  b="$(basename "$f")"; v="${b%%_*}"
  if [ "$(q "select count(*) from supabase_migrations.schema_migrations where version = '$v'")" = 0 ]; then
    attente+=("$b")
    [[ "$v" < "$derniere" ]] && anterieures+=("$b")
  fi
done
if [ ${#anterieures[@]} -gt 0 ]; then
  echo "Found local migration files to be inserted before the last migration on remote database."
  echo
  echo "Rerun the command with --include-all flag to apply these migrations:"
  for b in "${anterieures[@]}"; do echo " • $b"; done
  exit 1
fi
if [ ${#attente[@]} = 0 ]; then echo "Remote database is up to date."; exit 0; fi
if [ "$DRY" = 1 ]; then
  echo "DRY RUN: migrations will *not* be pushed to the database."
  echo "Would push these migrations:"
  for b in "${attente[@]}"; do echo " • $b"; done
  exit 0
fi
for b in "${attente[@]}"; do
  v="${b%%_*}"; n="${b#*_}"; n="${n%.sql}"
  echo "Applying migration $b..."
  if [ "${ELSATIA_V9_HARNESS_FAIL_AT:-}" = "$v" ]; then
    echo "ERROR: simulated failure at $b (ELSATIA_V9_HARNESS_FAIL_AT)" >&2; exit 1
  fi
  { echo "begin;"; sed -E 's/^create extension if not exists pgsodium;?/-- (stub banc) &/I' "$REPO/supabase/migrations/$b"
    echo ";"
    printf "insert into supabase_migrations.schema_migrations (version, name, statements) values ('%s', '%s', array[\$m\$%s\$m\$]);\n" "$v" "$n" "$(cat "$REPO/supabase/migrations/$b")"
    echo "commit;"; } | psql -X -q -v ON_ERROR_STOP=1 -d "$DB" >/dev/null || { echo "ERROR: migration $b failed" >&2; exit 1; }
done
echo "Finished supabase db push."
