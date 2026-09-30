#!/usr/bin/env bash
# ELSATIA-RENTABILITE-DATA-CORRECTNESS-V1 — lance un vrai PostgREST v12.2.3
# (binaire statique GitHub, comme scripts/local-postgres-bootstrap/pilot_acceptance_v3.sh)
# devant une base locale, avec db-max-rows = 1000 comme supabase/config.toml
# (et la même valeur hébergée). Sert aux tests d'échelle Vitest (*.integration.test.ts).
#
# Usage : scripts/perf/postgrest_local.sh <db> <port> [jwt-secret]
set -euo pipefail
DB="${1:?db}"; PORT="${2:?port}"
SECRET="${3:-elsatia-local-perf-jwt-secret-0123456789abcdef}"
DIR="${POSTGREST_BUILD_DIR:-/tmp/postgrest-build}"
VERSION="v12.2.3"
mkdir -p "$DIR"
if [ ! -x "$DIR/postgrest" ]; then
  curl -sSL -o "$DIR/postgrest.tar.xz" "https://github.com/PostgREST/postgrest/releases/download/${VERSION}/postgrest-${VERSION}-linux-static-x64.tar.xz"
  tar -xJf "$DIR/postgrest.tar.xz" -C "$DIR"
fi
su postgres -c "psql -X -q -d \"$DB\" -c \"alter role authenticator with password 'root';\"" >/dev/null
cat > "$DIR/postgrest-$PORT.conf" <<CONF
db-uri = "postgres://authenticator:root@localhost:5432/$DB"
db-schemas = "public"
db-extra-search-path = "public, extensions"
db-anon-role = "anon"
db-max-rows = 1000
jwt-secret = "$SECRET"
server-port = $PORT
db-pool = 10
CONF
pkill -f "postgrest-$PORT.conf" >/dev/null 2>&1 || true
nohup "$DIR/postgrest" "$DIR/postgrest-$PORT.conf" > "$DIR/postgrest-$PORT.log" 2>&1 &
for _ in $(seq 1 50); do curl -s -o /dev/null "http://localhost:$PORT/" && break; sleep 0.2; done
curl -s -o /dev/null -w "PostgREST :$PORT -> $DB (HTTP %{http_code})\n" "http://localhost:$PORT/"
