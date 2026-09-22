#!/usr/bin/env bash
# Stand up a REAL local GoTrue (built from source, github.com/supabase/auth)
# in front of the pilot fixture database, when Docker's Supabase images
# cannot be pulled here (registry blocked by a proxy "Data limit exceeded"
# cap -- Docker itself may work fine; only the image pull is blocked).
#
# This is a genuinely stronger substrate than scripts/local-postgres-bootstrap/
# rebuild_db.sh's stub auth schema: GoTrue runs its own real migrations
# (auth.users/identities/sessions/refresh_tokens/... -- ~70 tables/indexes),
# issues real signed JWTs over HTTP, and enforces its own login/ban/expiry
# rules. What it still does NOT give you: real PostgREST (no Haskell
# toolchain here either) or real Storage -- see jwt_bridge.mjs's header and
# README.md for exactly what is and is not proven this way.
#
# Requires: PostgreSQL 16 running locally (peer auth for the `postgres` OS
# user), Go toolchain (to build GoTrue), Node.js, network access to
# github.com (git clone) -- NOT to any Docker registry.
#
# Usage: gotrue_pilot_bootstrap.sh [db-name]   (default: pilot_gp)
set -uo pipefail

DB="${1:-pilot_gp}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
BUILD_DIR="${GOTRUE_BUILD_DIR:-/tmp/gotrue-build}"
GOTRUE_BIN="$BUILD_DIR/gotrue"
GOTRUE_TAG="v2.196.0"

mkdir -p "$BUILD_DIR"

echo "== [1/7] build GoTrue from source (skipped if already built) =="
if [ ! -x "$GOTRUE_BIN" ]; then
  rm -rf "$BUILD_DIR/gotrue-src"
  git clone --depth 1 --branch "$GOTRUE_TAG" https://github.com/supabase/auth.git "$BUILD_DIR/gotrue-src" || exit 1
  (cd "$BUILD_DIR/gotrue-src" && GOFLAGS=-mod=mod go build -o "$GOTRUE_BIN" .) || exit 1
fi
echo "GoTrue binary: $GOTRUE_BIN ($("$GOTRUE_BIN" version 2>/dev/null || echo "$GOTRUE_TAG"))"

echo "== [2/7] JWT secret (persisted per build dir so re-runs keep reusing the same tokens/config) =="
if [ ! -f "$BUILD_DIR/jwt_secret.txt" ]; then
  openssl rand -base64 48 | tr -d '\n' > "$BUILD_DIR/jwt_secret.txt"
fi

cat > "$BUILD_DIR/gotrue.env.sh" << ENVEOF
export GOTRUE_DB_DRIVER=postgres
export DB_NAMESPACE=auth
export DATABASE_URL="postgres://supabase_auth_admin:root@localhost:5432/$DB"
export GOTRUE_JWT_SECRET="$(cat "$BUILD_DIR/jwt_secret.txt")"
export GOTRUE_JWT_EXP=3600
export GOTRUE_JWT_AUD=authenticated
export GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated
export GOTRUE_JWT_ADMIN_ROLES="supabase_admin,service_role"
export API_EXTERNAL_URL="http://localhost:9999"
export GOTRUE_API_HOST="localhost"
export PORT=9999
export GOTRUE_SITE_URL="http://localhost:3000"
export GOTRUE_MAILER_AUTOCONFIRM=true
export GOTRUE_DISABLE_SIGNUP=false
export GOTRUE_EXTERNAL_EMAIL_ENABLED=true
export GOTRUE_EXTERNAL_PHONE_ENABLED=false
export GOTRUE_LOG_LEVEL=info
ENVEOF
source "$BUILD_DIR/gotrue.env.sh"

echo "== [3/7] Postgres roles + database =="
su postgres -c "psql -X -q -c \"do \\\$\\\$ begin if not exists (select 1 from pg_roles where rolname='supabase_auth_admin') then create role supabase_auth_admin superuser login password 'root' createrole; end if; end \\\$\\\$;\"" || exit 1
su postgres -c "psql -X -q -c 'drop database if exists \"$DB\";'" || exit 1
su postgres -c "psql -X -q -c 'create database \"$DB\" owner postgres;'" || exit 1
su postgres -c "psql -X -q -d \"$DB\" -c 'create schema if not exists auth authorization supabase_auth_admin;'" || exit 1

echo "== [4/7] GoTrue's own migrations (real auth.* schema, ~70 migrations) =="
(cd "$BUILD_DIR" && ./gotrue migrate) || exit 1
# GoTrue's unqualified SQL (`identities`, not `auth.identities`) needs its
# connecting role's default search_path to include `auth` -- the app's own
# migrations later reset the DATABASE-level search_path to public,extensions
# (matching a real Supabase project), which would otherwise break GoTrue.
su postgres -c "psql -X -q -d \"$DB\" -c \"alter role supabase_auth_admin set search_path = auth, extensions, public;\"" || exit 1

echo "== [5/7] infra bootstrap (roles/helper functions/storage+pgsodium stubs) =="
# IF NOT EXISTS everywhere: this only adds what GoTrue's real schema doesn't
# already provide (auth.users/auth.mfa_factors are left untouched).
su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -v dbname=\"$DB\" -d \"$DB\" -f \"$HERE/pg_bootstrap.sql\"" || exit 1

echo "== [6/7] app migrations ($(ls "$REPO"/supabase/migrations/*.sql | wc -l) files) =="
count=0
for f in "$REPO"/supabase/migrations/*.sql; do
  count=$((count+1))
  out=$(sed -E 's/^create extension if not exists pgsodium;?/-- (stubbed by pg_bootstrap.sql) \0/I' "$f" | \
        su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d \"$DB\"" 2>&1)
  if [ $? -ne 0 ]; then
    echo "FAIL at migration #$count: $(basename "$f")"
    echo "$out" | tail -30
    exit 1
  fi
done
echo "OK: $count migrations applied"

echo "== [7/7] pilot fixture (SARL Bati-Rhone Construction, 28 employees / 5 profiles) =="
su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d \"$DB\" -f \"$REPO/supabase/production/seed_entreprise_pilote_btp.sql\"" || exit 1

echo "== starting GoTrue on :9999 =="
pkill -9 -f "gotrue serve" >/dev/null 2>&1 || true
sleep 1
( source "$BUILD_DIR/gotrue.env.sh"; cd "$BUILD_DIR"; nohup "$GOTRUE_BIN" serve > "$BUILD_DIR/gotrue_serve.log" 2>&1 & disown )
sleep 3
curl -sS -m 5 http://localhost:9999/health && echo || { echo "GoTrue did not come up, see $BUILD_DIR/gotrue_serve.log"; exit 1; }

echo
echo "Ready. DB=$DB  GoTrue=http://localhost:9999  build dir=$BUILD_DIR"
echo "Next: $HERE/run_pilot_auth_scenarios.sh $DB"
