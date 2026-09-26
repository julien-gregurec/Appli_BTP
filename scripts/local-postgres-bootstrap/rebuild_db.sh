#!/usr/bin/env bash
# Rebuild a local database from scratch: drop, create, bootstrap the minimal
# Supabase-infra substitutes (pg_bootstrap.sql), then replay every real
# migration under supabase/migrations in order. Requires PostgreSQL 16
# running locally (peer auth for the `postgres` OS/DB user) and no Docker/
# Supabase CLI -- see README.md in this directory for why this exists and
# what it does and does not prove.
#
# Usage: rebuild_db.sh <database-name>
set -uo pipefail

DB="${1:?usage: rebuild_db.sh <database-name>}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"

run_psql() {
  su postgres -c "psql -v ON_ERROR_STOP=1 -X -q $*"
}

echo "== drop/create $DB =="
su postgres -c "psql -X -q -c 'drop database if exists \"$DB\";'"
su postgres -c "psql -X -q -c 'create database \"$DB\";'"

echo "== bootstrap =="
su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -v dbname=$DB -d $DB -f $HERE/pg_bootstrap.sql"

echo "== migrations =="
count=0
for f in "$REPO"/supabase/migrations/*.sql; do
  count=$((count+1))
  # pgsodium cannot be installed as a real extension on a bare box; the
  # stub schema/functions in pg_bootstrap.sql already cover what the two
  # Stripe-attestation migrations need to apply cleanly.
  out=$(sed -E 's/^create extension if not exists pgsodium;?/-- (stubbed by pg_bootstrap.sql) &/I' "$f" | \
        su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d $DB" 2>&1)
  status=$?
  if [ $status -ne 0 ]; then
    echo "FAIL at migration #$count: $(basename "$f")"
    echo "$out"
    exit 1
  fi
done

echo "== OK: $count migrations applied cleanly to $DB =="
