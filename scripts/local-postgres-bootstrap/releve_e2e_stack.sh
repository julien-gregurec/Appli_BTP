#!/usr/bin/env bash
# Pile locale RÉELLE pour la recette Playwright Relevé & Métré (Lot 2 Recovery V2) :
# GoTrue (compilé depuis les sources) + PostgREST (binaire GitHub) + PostgreSQL 16 avec les
# vraies migrations et la vraie RLS, derrière local_supabase_proxy.mjs (CORS ouvert à Tools).
# Aucun Docker, aucun service distant. Tools lui-même se lance à part (commande affichée à la fin).
#
# Usage : releve_e2e_stack.sh [db]   (défaut : releve_e2e)
# Mot de passe des comptes de recette : RELEVE_E2E_PASSWORD (défaut local, non secret).
set -uo pipefail
DB="${1:-releve_e2e}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
BUILD_DIR="${GOTRUE_BUILD_DIR:-/tmp/gotrue-build}"
POSTGREST_DIR="${POSTGREST_BUILD_DIR:-/tmp/postgrest-build}"
POSTGREST_VERSION="v12.2.3"
PROXY_PORT="${PILOT_PROXY_PORT:-54321}"
TOOLS_ORIGIN="${TOOLS_ORIGIN:-http://localhost:3020}"
PASSWORD="${RELEVE_E2E_PASSWORD:-Releve-Test-2026!}"
fail() { echo "FAIL: $1" >&2; exit 1; }

pkill -9 -f "$POSTGREST_DIR/postgrest" >/dev/null 2>&1 || true
pkill -9 -f "node scripts/local-postgres-bootstrap/local_supabase_proxy" >/dev/null 2>&1 || true
pkill -9 -f "gotrue serve" >/dev/null 2>&1 || true
sleep 1
su postgres -c "psql -X -q -c \"select pg_terminate_backend(pid) from pg_stat_activity where datname='$DB' and pid<>pg_backend_pid();\"" >/dev/null 2>&1 || true

bash "$HERE/gotrue_pilot_bootstrap.sh" "$DB" || fail "gotrue_pilot_bootstrap.sh"
source "$BUILD_DIR/gotrue.env.sh"

mkdir -p "$POSTGREST_DIR"
if [ ! -x "$POSTGREST_DIR/postgrest" ]; then
  curl -sSL -o "$POSTGREST_DIR/postgrest.tar.xz" "https://github.com/PostgREST/postgrest/releases/download/${POSTGREST_VERSION}/postgrest-${POSTGREST_VERSION}-linux-static-x64.tar.xz" || fail "postgrest download"
  tar -xJf "$POSTGREST_DIR/postgrest.tar.xz" -C "$POSTGREST_DIR" || fail "postgrest extract"
fi
su postgres -c "psql -X -q -d \"$DB\" -c \"alter role authenticator with password 'root';\"" >/dev/null
cat > "$POSTGREST_DIR/postgrest.conf" <<CONF
db-uri = "postgres://authenticator:root@localhost:5432/$DB"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$(cat "$BUILD_DIR/jwt_secret.txt")"
server-port = 3001
db-pool = 10
CONF
(cd "$POSTGREST_DIR" && nohup ./postgrest postgrest.conf > postgrest.log 2>&1 &)
sleep 2
curl -sS -o /dev/null "http://localhost:3001/" || fail "PostgREST ne répond pas sur :3001"
(cd "$REPO" && PORT="$PROXY_PORT" GOTRUE_URL=http://localhost:9999 POSTGREST_URL=http://localhost:3001 CORS_ORIGINS="$TOOLS_ORIGIN" \
  nohup node scripts/local-postgres-bootstrap/local_supabase_proxy.mjs > "$POSTGREST_DIR/proxy.log" 2>&1 &)
sleep 1
curl -sS -o /dev/null "http://localhost:$PROXY_PORT/auth/v1/health" || fail "proxy ne répond pas sur :$PROXY_PORT"

ADMIN_JWT=$(node "$HERE/jwt_bridge.mjs" sign '{"role":"supabase_admin","aud":"authenticated","exp":2000000000}')
ANON_JWT=$(node "$HERE/jwt_bridge.mjs" sign '{"role":"anon","iss":"supabase","exp":2000000000}')
create_user() {
  curl -sS -X POST http://localhost:9999/admin/users -H "Authorization: Bearer $ADMIN_JWT" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$PASSWORD\",\"email_confirm\":true}" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);if(!j.id)process.exit(1);console.log(j.id)})'
}
UA=$(create_user releve-a@example.test) || fail "compte A"
UB=$(create_user releve-b@example.test) || fail "compte B"
EA=$(su postgres -c "psql -X -At -d \"$DB\" -c \"select id from entreprises where reference_interne='PILOTE-BTP-V1'\"")
su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -v ua=$UA -v ub=$UB -v ea=$EA -d \"$DB\"" < "$HERE/releve_e2e_seed.sql" || fail "seed Relevé"

cat <<INFO

Pile Relevé prête (DB=$DB, proxy http://localhost:$PROXY_PORT, CORS $TOOLS_ORIGIN).
1) Tools :
   cd apps/tools && NEXT_PUBLIC_SUPABASE_URL=http://localhost:$PROXY_PORT NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$ANON_JWT \\
     NEXT_PUBLIC_TOOLS_ENV=local NEXT_PUBLIC_TOOLS_URL=$TOOLS_ORIGIN npx next dev --webpack -p ${TOOLS_ORIGIN##*:}
2) Recette :
   PW_CHROME_PATH=/opt/pw-browsers/chromium RELEVE_E2E_BASE_URL=$TOOLS_ORIGIN RELEVE_E2E_EMAIL_A=releve-a@example.test \\
     RELEVE_E2E_EMAIL_B=releve-b@example.test RELEVE_E2E_PASSWORD='$PASSWORD' \\
     npx playwright test tests/e2e/tools-releve-lot2.spec.ts --project=desktop-chromium
INFO
