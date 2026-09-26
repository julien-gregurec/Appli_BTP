#!/usr/bin/env bash
# ELSATIA_PILOT_ACCEPTANCE_CLOSURE_V3 -- single reproducible command.
#
# Builds on npm run pilot:acceptance:v2 (real GoTrue + real PostgREST + the
# 69 ACTUALLY_AUTOMATABLE cases) and adds:
#   - the PL-02 DB-level fix (20260923000334_...sql), applied like any other
#     migration by gotrue_pilot_bootstrap.sh -> rebuild_db.sh -- nothing
#     extra to do here, just confirms it is in the replayed migration set
#   - the service_role token persistence run_pilot_acceptance_v2.mjs always
#     needed but run_pilot_auth_scenarios.sh never wrote (V2 gap, fixed here)
#   - a faithful local/mocked Storage HTTP surface (local_storage_mock.mjs)
#     wired into local_supabase_proxy.mjs's /storage/v1/* route, real
#     storage.objects/storage.buckets + real RLS, bytes on local disk
#     instead of S3 -- see that script's header for exactly what "mocked"
#     means here and local_supabase_proxy.mjs's 501 fallback if unset
#
# Usage: npm run pilot:acceptance:v3   (= this script, db name defaults to pilot_gp)
# Idempotent: rebuilds the database from scratch on every run.
set -uo pipefail

DB="${1:-pilot_gp}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
BUILD_DIR="${GOTRUE_BUILD_DIR:-/tmp/gotrue-build}"
POSTGREST_DIR="${POSTGREST_BUILD_DIR:-/tmp/postgrest-build}"
POSTGREST_VERSION="v12.2.3"
PROXY_PORT="${PILOT_PROXY_PORT:-54321}"
STORAGE_PORT="${PILOT_STORAGE_PORT:-5000}"
STORAGE_ROOT="${PILOT_STORAGE_ROOT:-/tmp/local-storage-mock}"

fail() { echo "FAIL: $1" >&2; exit 1; }

echo "== [1/7] stop any previous GoTrue/PostgREST/proxy/storage for this DB, free connections =="
pkill -9 -f "gotrue serve" >/dev/null 2>&1 || true
pkill -9 -f "$POSTGREST_DIR/postgrest" >/dev/null 2>&1 || true
pkill -9 -f "local_supabase_proxy.mjs" >/dev/null 2>&1 || true
pkill -9 -f "local_storage_mock.mjs" >/dev/null 2>&1 || true
sleep 1
su postgres -c "psql -X -q -c \"select pg_terminate_backend(pid) from pg_stat_activity where datname='$DB' and pid<>pg_backend_pid();\"" >/dev/null 2>&1 || true
(service postgresql status >/dev/null 2>&1) || service postgresql start >/dev/null 2>&1 || true

echo "== [2/7] GoTrue + pilot fixture (rebuilds \"$DB\" from scratch, replays all migrations incl. PL-02 fix) =="
bash "$HERE/gotrue_pilot_bootstrap.sh" "$DB" || fail "gotrue_pilot_bootstrap.sh"

echo "== [3/7] pilot auth/RLS scenarios (22 baseline + session scenarios), persists service_role token =="
bash "$HERE/run_pilot_auth_scenarios.sh" "$DB" || fail "run_pilot_auth_scenarios.sh"
[ -s "$BUILD_DIR/tokens/service_role.access_token" ] || fail "service_role.access_token not written by run_pilot_auth_scenarios.sh"
# The scenarios script deliberately bans one profile and deactivates another as part of its own
# assertions (real GoTrue ban / real membership revocation) -- undo those side effects here so the
# fixture is left in a normal, loggable-in state for anything run afterward (Playwright, manual use).
source "$BUILD_DIR/gotrue.env.sh"
ENT_A=$(su postgres -c "psql -X -q -t -A -d \"$DB\" -c \"select id from entreprises where reference_interne='PILOTE-BTP-V1';\"")
CE_UID=$(su postgres -c "psql -X -q -t -A -d \"$DB\" -c \"select id from auth.users where email='pilote.rachid.belkacem@example.test';\"")
su postgres -c "psql -X -q -d \"$DB\" -c \"update utilisateurs_entreprises set statut='actif' where utilisateur_id='$CE_UID' and entreprise_id='$ENT_A';\"" >/dev/null
OUVRIER_UID=$(su postgres -c "psql -X -q -t -A -d \"$DB\" -c \"select id from auth.users where email='pilote.sofiane.aitali@example.test';\"")
ADMIN_JWT=$(node "$HERE/jwt_bridge.mjs" sign '{"role":"supabase_admin","aud":"authenticated","exp":2000000000}')
curl -sS -m 10 -X PUT "http://localhost:9999/admin/users/$OUVRIER_UID" -H "Authorization: Bearer $ADMIN_JWT" -H "Content-Type: application/json" -d '{"ban_duration":"none"}' >/dev/null

echo "== [4/7] real PostgREST binary (GitHub release, no container registry) =="
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

echo "== gestures for the browser/Playwright layer (test-only, not committed to the fixture) =="
# Mirrors V2's own documented gesture (README §Playwright): the pilot
# fixture has a trial that's expired by construction, and 3 features this
# V3 mission exercises live behind entitlement layers the fixture doesn't
# turn on by default -- none of this is a product bug, just fixture state a
# real paying customer would already have.
ENT_A_ID=$(su postgres -c "psql -X -q -t -A -d \"$DB\" -c \"select id from entreprises where reference_interne='PILOTE-BTP-V1';\"")
su postgres -c "psql -X -q -d \"$DB\" -c \"
  update entreprises set abonnement_statut='actif', abonnement_offre='business' where id='$ENT_A_ID';
  insert into entreprise_feature_flags(entreprise_id, feature_key, statut, active) values ('$ENT_A_ID','payroll','beta',true) on conflict (entreprise_id, feature_key) do update set active=true, statut='beta';
  truncate rate_limits_applicatifs;
\"" >/dev/null

echo "== [5/7] local Storage mock (real storage.objects/buckets + real RLS, bytes on disk) on :$STORAGE_PORT =="
mkdir -p "$STORAGE_ROOT"
(cd "$REPO" && DB="$DB" PORT="$STORAGE_PORT" GOTRUE_JWT_SECRET="$(cat "$BUILD_DIR/jwt_secret.txt")" STORAGE_ROOT="$STORAGE_ROOT" \
  nohup node scripts/local-postgres-bootstrap/local_storage_mock.mjs > "$POSTGREST_DIR/storage_mock.log" 2>&1 &)
sleep 1
curl -sS -o /dev/null -w '' "http://localhost:$STORAGE_PORT/" || fail "storage mock not responding on :$STORAGE_PORT"
echo "Storage mock up on :$STORAGE_PORT"

echo "== [6/7] local Supabase-shaped proxy (/auth/v1, /rest/v1, /storage/v1) on :$PROXY_PORT =="
(cd "$REPO" && PORT="$PROXY_PORT" GOTRUE_URL=http://localhost:9999 POSTGREST_URL=http://localhost:3001 STORAGE_URL="http://localhost:$STORAGE_PORT" \
  nohup node scripts/local-postgres-bootstrap/local_supabase_proxy.mjs > "$POSTGREST_DIR/proxy.log" 2>&1 &)
sleep 1
curl -sS -o /dev/null -w '' "http://localhost:$PROXY_PORT/auth/v1/health" || fail "proxy not responding on :$PROXY_PORT"
echo "Proxy up on :$PROXY_PORT"

echo "== [7/7] execute the 69 ACTUALLY_AUTOMATABLE acceptance-test IDs (incl. real PL-02 DB guard) =="
node "$HERE/run_pilot_acceptance_v2.mjs" "$DB"
echo
echo "================================================================"
echo "Backend done. Results: $BUILD_DIR/acceptance_v2_results.json"
echo
echo "For the browser/Playwright layer (login, URL guards, chantier/devis/facture/planning/pointage,"
echo "paramètres/onboarding/DOE/paie/exports -- see V3 report §7 for the 2 known-FAIL cases):"
echo "  NEXT_PUBLIC_SUPABASE_URL=http://localhost:$PROXY_PORT and the matching anon/service keys must"
echo "  be in .env.local (see docs/qualification/ELSATIA_PILOT_ACCEPTANCE_AUTOMATION_V2.md §Playwright)."
echo "  npm run dev -- -p 3100   (separate terminal)"
echo "  E2E_BASE_URL=http://localhost:3100 npx playwright test tests/e2e/pilot-acceptance-v2.spec.ts tests/e2e/pilot-acceptance-v3.spec.ts --project=desktop-chromium --workers=1"
echo "  E2E_BASE_URL must use the same host as next dev (localhost): Next 16 dev blocks /_next/* dev"
echo "  resources for another origin (127.0.0.1 = playwright.config.ts default) -- the page renders but"
echo "  never hydrates, so every client-side interaction (e.g. PE-06 signature canvas) silently fails."
echo "  If some tests land back on /login unexpectedly: the app's own login rate-limiter (10/10min/IP,"
echo "  real product protection, see src/lib/security/rate-limit.ts) tripped from repeated passes --"
echo "  su postgres -c \"psql -d $DB -c 'truncate rate_limits_applicatifs;'\" between runs, not a bug."
