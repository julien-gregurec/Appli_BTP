#!/usr/bin/env bash
# ELSATIA_PILOT_ACCEPTANCE_AUTOMATION_V2 -- single reproducible command.
#
# Builds on npm run pilot:auth:local (GoTrue + pilot fixture, V1's deliverable) and adds:
#   - a real local PostgREST binary (downloaded from GitHub releases, not a container registry --
#     see docs/qualification/ELSATIA_PILOT_ACCEPTANCE_AUTOMATION_V2.md for why V1 missed this)
#   - a minimal reverse proxy (local_supabase_proxy.mjs) so @supabase/ssr/@supabase/supabase-js see
#     one Supabase-shaped URL (/auth/v1/*, /rest/v1/*)
#   - real execution of the 69 ACTUALLY_AUTOMATABLE acceptance-test IDs V1 identified but ran out of
#     time to execute (run_pilot_acceptance_v2.mjs), against real GoTrue JWTs and real RLS
#
# Usage: npm run pilot:acceptance:v2   (= this script, db name defaults to pilot_gp)
# Idempotent: rebuilds the database from scratch on every run.
set -uo pipefail

DB="${1:-pilot_gp}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
BUILD_DIR="${GOTRUE_BUILD_DIR:-/tmp/gotrue-build}"
POSTGREST_DIR="${POSTGREST_BUILD_DIR:-/tmp/postgrest-build}"
POSTGREST_VERSION="v12.2.3"
PROXY_PORT="${PILOT_PROXY_PORT:-54321}"

fail() { echo "FAIL: $1" >&2; exit 1; }

echo "== [1/6] stop any previous GoTrue/PostgREST/proxy for this DB, free connections =="
pkill -9 -f "gotrue serve" >/dev/null 2>&1 || true
pkill -9 -f "$POSTGREST_DIR/postgrest" >/dev/null 2>&1 || true
pkill -9 -f "local_supabase_proxy.mjs" >/dev/null 2>&1 || true
sleep 1
su postgres -c "psql -X -q -c \"select pg_terminate_backend(pid) from pg_stat_activity where datname='$DB' and pid<>pg_backend_pid();\"" >/dev/null 2>&1 || true
(service postgresql status >/dev/null 2>&1) || service postgresql start >/dev/null 2>&1 || true

echo "== [2/6] GoTrue + pilot fixture (rebuilds \"$DB\" from scratch) =="
bash "$HERE/gotrue_pilot_bootstrap.sh" "$DB" || fail "gotrue_pilot_bootstrap.sh"

echo "== [3/6] pilot auth/RLS scenarios (22 baseline + session scenarios) =="
bash "$HERE/run_pilot_auth_scenarios.sh" "$DB" || fail "run_pilot_auth_scenarios.sh"
# The scenarios script deliberately bans one profile and deactivates another as part of its own
# assertions (real GoTrue ban / real membership revocation) -- undo those side effects here so the
# fixture is left in a normal, loggable-in state for anything run afterward (Playwright, manual use).
source "$BUILD_DIR/gotrue.env.sh"
ENT_A=$(su postgres -c "psql -X -q -t -A -d \"$DB\" -c \"select id from entreprises where reference_interne='PILOTE-BTP-V1';\"")
CE_UID=$(su postgres -c "psql -X -q -t -A -d \"$DB\" -c \"select id from auth.users where email='pilote.rachid.belkacem@example.test';\"")
su postgres -c "psql -X -q -d \"$DB\" -c \"update utilisateurs_entreprises set statut='actif' where utilisateur_id='$CE_UID' and entreprise_id='$ENT_A';\"" >/dev/null
OUVRIER_UID=$(su postgres -c "psql -X -q -t -A -d \"$DB\" -c \"select id from auth.users where email='pilote.sofiane.aitali@example.test';\"")
ADMIN_JWT=$(node "$HERE/jwt_bridge.mjs" sign '{"role":"supabase_admin","aud":"authenticated","exp":2000000000}')
curl -sS -X PUT "http://localhost:9999/admin/users/$OUVRIER_UID" -H "Authorization: Bearer $ADMIN_JWT" -H "Content-Type: application/json" -d '{"ban_duration":"none"}' >/dev/null

echo "== [4/6] real PostgREST binary (GitHub release, no container registry) =="
mkdir -p "$POSTGREST_DIR"
if [ ! -x "$POSTGREST_DIR/postgrest" ]; then
  curl -sSL -o "$POSTGREST_DIR/postgrest.tar.xz" "https://github.com/PostgREST/postgrest/releases/download/${POSTGREST_VERSION}/postgrest-${POSTGREST_VERSION}-linux-static-x64.tar.xz" || fail "postgrest download"
  tar -xJf "$POSTGREST_DIR/postgrest.tar.xz" -C "$POSTGREST_DIR" || fail "postgrest extract"
fi
su postgres -c "psql -X -q -d \"$DB\" -c \"alter role authenticator with password 'root';\"" >/dev/null
cat > "$POSTGREST_DIR/postgrest.conf" <<EOF
db-uri = "postgres://authenticator:root@localhost:5432/$DB"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$(cat "$BUILD_DIR/jwt_secret.txt")"
server-port = 3001
db-pool = 10
EOF
(cd "$POSTGREST_DIR" && nohup ./postgrest postgrest.conf > postgrest.log 2>&1 &)
sleep 2
curl -sS -o /dev/null -w '' "http://localhost:3001/" || fail "PostgREST not responding on :3001"
echo "PostgREST up on :3001"

echo "== [5/6] local Supabase-shaped proxy (/auth/v1, /rest/v1) on :$PROXY_PORT =="
(cd "$REPO" && PORT="$PROXY_PORT" GOTRUE_URL=http://localhost:9999 POSTGREST_URL=http://localhost:3001 nohup node scripts/local-postgres-bootstrap/local_supabase_proxy.mjs > "$POSTGREST_DIR/proxy.log" 2>&1 &)
sleep 1
curl -sS -o /dev/null -w '' "http://localhost:$PROXY_PORT/auth/v1/health" || fail "proxy not responding on :$PROXY_PORT"
echo "Proxy up on :$PROXY_PORT"

echo "== [6/6] execute the 69 ACTUALLY_AUTOMATABLE acceptance-test IDs =="
node "$HERE/run_pilot_acceptance_v2.mjs" "$DB"
echo
echo "================================================================"
echo "Backend done. Results: $BUILD_DIR/acceptance_v2_results.json"
echo
echo "For the browser/Playwright layer (login, URL guards, chantier/devis/facture/planning/pointage):"
echo "  NEXT_PUBLIC_SUPABASE_URL=http://localhost:$PROXY_PORT and the matching anon/service keys must"
echo "  be in .env.local (see docs/qualification/ELSATIA_PILOT_ACCEPTANCE_AUTOMATION_V2.md §Playwright)."
echo "  npm run dev -- -p 3100   (separate terminal)"
echo "  npx playwright test tests/e2e/pilot-acceptance-v2.spec.ts --project=desktop-chromium"
