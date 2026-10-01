#!/usr/bin/env bash
# Banc PostgREST réel pour ELSATIA-FINANCE-AGGREGATES-DATA-CORRECTNESS-V1.
# - base : schéma complet (rebuild_db.sh) + seed.sql de ce dossier ;
# - PostgREST 12.2.3 (binaire officiel) avec db-max-rows = 1000, la valeur
#   de supabase/config.toml ([api] max_rows) et du défaut Supabase hébergé ;
# - émet dans $OUT/env les jetons HS256 des profils du banc.
# Usage : postgrest-bench.sh [db] [port]
set -euo pipefail
DB="${1:-fin_bench}"; PORT="${2:-3011}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; REPO="$(cd "$HERE/../../.." && pwd)"
PGRST_DIR="${POSTGREST_BUILD_DIR:-/tmp/postgrest-build}"; OUT="${BENCH_OUT:-/tmp/finance-bench}"
mkdir -p "$OUT" "$PGRST_DIR"
if [ ! -x "$PGRST_DIR/postgrest" ]; then
  curl -sSL -o "$PGRST_DIR/postgrest.tar.xz" "https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz"
  tar -xJf "$PGRST_DIR/postgrest.tar.xz" -C "$PGRST_DIR"
fi
if [ "${REBUILD:-1}" = "1" ]; then
  "$REPO/scripts/local-postgres-bootstrap/rebuild_db.sh" "$DB" >/dev/null
  cp "$HERE/seed.sql" "$OUT/seed.sql"; chmod 644 "$OUT/seed.sql"
  su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d $DB -f $OUT/seed.sql" >/dev/null
fi
su postgres -c "psql -X -q -d $DB -c \"alter role authenticator with password 'root';\"" >/dev/null
SECRET="finance-bench-secret-finance-bench-secret-0123456789"
cat > "$OUT/postgrest.conf" <<CONF
db-uri = "postgres://authenticator:root@localhost:5432/$DB"
db-schemas = "public"
db-anon-role = "anon"
db-max-rows = 1000
jwt-secret = "$SECRET"
server-port = $PORT
db-pool = 10
CONF
pkill -f "postgrest $OUT/postgrest.conf" >/dev/null 2>&1 || true
nohup "$PGRST_DIR/postgrest" "$OUT/postgrest.conf" > "$OUT/postgrest.log" 2>&1 &
for _ in $(seq 1 50); do curl -s -o /dev/null "http://localhost:$PORT/" && break; sleep 0.2; done
jeton() { GOTRUE_JWT_SECRET="$SECRET" node "$REPO/scripts/local-postgres-bootstrap/jwt_bridge.mjs" sign "{\"sub\":\"$1\",\"role\":\"$2\",\"aud\":\"authenticated\",\"exp\":4102444800}"; }
{
  echo "FINANCE_BENCH_URL=http://localhost:$PORT"
  echo "FINANCE_BENCH_DB=$DB"
  echo "FINANCE_BENCH_ANON=$(GOTRUE_JWT_SECRET="$SECRET" node "$REPO/scripts/local-postgres-bootstrap/jwt_bridge.mjs" sign '{"role":"anon","exp":4102444800}')"
  for p in f0500 f1000 f1462 f5000 f2000 fe000; do
    up=$(echo "$p" | tr a-z A-Z)
    echo "FINANCE_BENCH_JWT_${up}_ADMIN=$(jeton "${p}a00-0000-0000-0000-000000000001" authenticated)"
    echo "FINANCE_BENCH_JWT_${up}_OUVRIER=$(jeton "${p}a00-0000-0000-0000-000000000002" authenticated)"
  done
} > "$OUT/env"
echo "PostgREST (max_rows=1000) sur :$PORT, base $DB ; jetons dans $OUT/env"
