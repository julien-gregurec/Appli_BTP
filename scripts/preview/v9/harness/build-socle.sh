#!/usr/bin/env bash
# ELSATIA — Pack opérateur V9 : construit une base LOCALE jetable dans l'état de la Preview
# (par défaut : socle V8 = train jusqu'à 20261002000813 ORIGINALE, rang CALCULÉ depuis le train),
# avec un ledger façon Supabase, pour éprouver v9-cutover.sh.
#
# Usage : scripts/preview/v9/harness/build-socle.sh elsatia_v9_harness_<nom> [nb]
#   nb : nombre de migrations à appliquer (défaut : rang de 20261002000813 dans supabase/migrations).
# Prérequis : PostgreSQL 16 local, rôle superutilisateur pour l'utilisateur courant (peer).
# Réutilise scripts/local-postgres-bootstrap/pg_bootstrap.sql (substituts d'infrastructure Supabase).
set -uo pipefail
DB="${1:?usage: build-socle.sh elsatia_v9_harness_<nom> [nb]}"
case "$DB" in elsatia_v9_harness_*) ;; *) echo "nom de base refusé (préfixe elsatia_v9_harness_ exigé)" >&2; exit 2 ;; esac
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
VERSION_SOCLE="20261002000813"
RANG_SOCLE="$(ls "$REPO"/supabase/migrations/*.sql | grep -n "/${VERSION_SOCLE}_" | cut -d: -f1)"
[ -n "$RANG_SOCLE" ] || { echo "$VERSION_SOCLE absente du train local" >&2; exit 2; }
NB="${2:-$RANG_SOCLE}"
case "$NB" in ""|*[!0-9]*) echo "nb doit être un entier" >&2; exit 2 ;; esac
BOOT="$REPO/scripts/local-postgres-bootstrap"

psql -X -q -d postgres -c "drop database if exists \"$DB\"" -c "create database \"$DB\"" || exit 1
psql -X -q -v ON_ERROR_STOP=1 -v dbname="$DB" -d "$DB" -f "$BOOT/pg_bootstrap.sql" >/dev/null || exit 1
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -c "create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations (version text primary key, name text, statements text[]);" || exit 1

i=0
for f in "$REPO"/supabase/migrations/*.sql; do
  i=$((i+1)); [ "$i" -gt "$NB" ] && break
  b="$(basename "$f")"; v="${b%%_*}"; n="${b#*_}"; n="${n%.sql}"
  { sed -E 's/^create extension if not exists pgsodium;?/-- (stub banc) &/I' "$f"; echo ";"
    printf "insert into supabase_migrations.schema_migrations (version, name, statements) values ('%s', '%s', array[\$m\$%s\$m\$]);\n" "$v" "$n" "$(cat "$f")"
  } | psql -X -q -v ON_ERROR_STOP=1 -d "$DB" >/dev/null 2>"${TMPDIR:-/tmp}/$DB.err" || { echo "échec à la migration $i : $b"; tail -5 "${TMPDIR:-/tmp}/$DB.err"; exit 1; }
done
echo "$DB : $(psql -X -At -d "$DB" -c "select count(*) || ' migrations, dernière ' || max(version) from supabase_migrations.schema_migrations")"
