#!/usr/bin/env bash
# ELSATIA — PRODUCTION INCIDENT RESPONSE & SAFE MODE V1 — drill LOCAL (npm run incident:drill).
#
# Monte une pile ELSATIA entièrement locale et jetable, puis injecte des pannes BORNÉES
# (arrêt/redémarrage de processus locaux, mocks en panne) et vérifie le comportement vu par
# l'utilisateur et la reprise (pas de doublon, pas de perte silencieuse, pas de droit incohérent).
#
#   Postgres 16 local (base jetable incident_drill + incident_drill_studio)
#   GoTrue (Auth réel) · PostgREST (API réelle) · mock Storage (RLS réelle) · proxy « Kong »
#   Redis local · faux Stripe · faux Brevo · Gestion Pro en `next dev`
#
# AUCUN appel à Preview/Production, aucun service tiers réel : toutes les URL sont 127.0.0.1
# (garde `exigerCibleLocale` dans lib.mjs) et les secrets sont générés pour le drill.
# À lancer en root (bascule postgres par authentification pair, comme rebuild_db.sh).
#
# Variables : INCIDENT_DRILL_DIR (défaut /tmp/elsatia-incident-drill : binaires, journaux,
# rapport), INCIDENT_DRILL_KEEP=1 (laisse la pile en marche), INCIDENT_DRILL_SKIP_BUILD=1
# (réutilise les bases déjà construites).
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
DIR="${INCIDENT_DRILL_DIR:-/tmp/elsatia-incident-drill}"
BIN="$DIR/bin"; LOGS="$DIR/logs"; PIDS="$DIR/pids"
DB=incident_drill; DB_STUDIO=incident_drill_studio
P_GOTRUE=19999; P_REST=13001; P_STORAGE=15000; P_PROXY=15432; P_REDIS=16379
P_STRIPE=14242; P_BREVO=14243; P_GP=3100
POSTGREST_VERSION=v12.2.3; GOTRUE_VERSION=v2.192.0

fail() { echo "ÉCHEC : $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || fail "à lancer en root (bascule postgres par authentification pair)"
for outil in psql redis-server redis-cli node curl openssl; do command -v "$outil" >/dev/null || fail "outil absent : $outil"; done
mkdir -p "$BIN" "$LOGS" "$PIDS"
pg() { su postgres -c "psql -X -q -v ON_ERROR_STOP=1 $*"; }

arreter_pile() {
  for f in "$PIDS"/*.pid; do [ -f "$f" ] && kill "$(cat "$f")" >/dev/null 2>&1; rm -f "$f"; done
  redis-cli -p "$P_REDIS" shutdown nosave >/dev/null 2>&1 || true
  pkill -f "next dev -p $P_GP" >/dev/null 2>&1 || true
}
trap '[ "${INCIDENT_DRILL_KEEP:-0}" = 1 ] || arreter_pile' EXIT
arreter_pile
(service postgresql status >/dev/null 2>&1) || service postgresql start >/dev/null 2>&1 || fail "Postgres local indisponible"

echo "== [1/7] binaires GoTrue $GOTRUE_VERSION et PostgREST $POSTGREST_VERSION (releases GitHub, mis en cache) =="
if [ ! -x "$BIN/postgrest" ]; then
  curl -sSL -o "$BIN/postgrest.tar.xz" "https://github.com/PostgREST/postgrest/releases/download/$POSTGREST_VERSION/postgrest-$POSTGREST_VERSION-linux-static-x64.tar.xz" || fail "téléchargement PostgREST"
  tar -xJf "$BIN/postgrest.tar.xz" -C "$BIN" || fail "extraction PostgREST"
fi
if [ ! -x "$BIN/auth" ]; then
  curl -sSL -o "$BIN/auth.tar.gz" "https://github.com/supabase/auth/releases/download/$GOTRUE_VERSION/auth-$GOTRUE_VERSION-x86.tar.gz" || fail "téléchargement GoTrue"
  tar -xzf "$BIN/auth.tar.gz" -C "$BIN" || fail "extraction GoTrue"
fi

echo "== [2/7] secrets LOCAUX du drill (jamais réutilisés ailleurs) =="
[ -f "$DIR/jwt_secret" ] || openssl rand -hex 32 > "$DIR/jwt_secret"
JWT_SECRET="$(cat "$DIR/jwt_secret")"
jwt() { node -e "import('$HERE/lib.mjs').then(m=>process.stdout.write(m.signerJwt(JSON.parse(process.argv[1]),process.argv[2],86400*7)))" "$1" "$JWT_SECRET"; }
ANON_JWT="$(jwt '{"role":"anon","iss":"supabase-drill"}')"
SERVICE_JWT="$(jwt '{"role":"service_role","iss":"supabase-drill"}')"

export GOTRUE_DB_DRIVER=postgres DB_NAMESPACE=auth
export DATABASE_URL="postgres://supabase_auth_admin:root@localhost:5432/$DB"
export GOTRUE_JWT_SECRET="$JWT_SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated
export GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES="supabase_admin,service_role"
export API_EXTERNAL_URL="http://127.0.0.1:$P_GOTRUE" GOTRUE_API_HOST=127.0.0.1 PORT=$P_GOTRUE
export GOTRUE_SITE_URL="http://127.0.0.1:$P_GP" GOTRUE_MAILER_AUTOCONFIRM=true GOTRUE_DISABLE_SIGNUP=true
export GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_EXTERNAL_PHONE_ENABLED=false GOTRUE_LOG_LEVEL=warn

if [ "${INCIDENT_DRILL_SKIP_BUILD:-0}" != 1 ]; then
  echo "== [3/7] base partagée jetable $DB : Auth réel + $(ls "$REPO"/supabase/migrations/*.sql | wc -l) migrations + fixture =="
  pg "-c \"do \\\$\\\$ begin if not exists (select 1 from pg_roles where rolname='supabase_auth_admin') then create role supabase_auth_admin superuser login password 'root' createrole; end if; end \\\$\\\$;\"" || fail "rôle auth"
  pg "-c \"select pg_terminate_backend(pid) from pg_stat_activity where datname in ('$DB','$DB_STUDIO') and pid <> pg_backend_pid();\"" >/dev/null
  pg "-c 'drop database if exists \"$DB\";' -c 'create database \"$DB\";'" || fail "création $DB"
  pg "-d $DB -c 'create schema if not exists auth authorization supabase_auth_admin;'" || fail "schéma auth"
  (cd "$BIN" && ./auth migrate > "$LOGS/gotrue_migrate.log" 2>&1) || fail "migrations GoTrue (voir $LOGS/gotrue_migrate.log)"
  pg "-d $DB -c 'alter role supabase_auth_admin set search_path = auth, extensions, public;'" >/dev/null
  pg "-v dbname=$DB -d $DB -f $REPO/scripts/local-postgres-bootstrap/pg_bootstrap.sql" > "$LOGS/bootstrap.log" 2>&1 || fail "amorce (voir $LOGS/bootstrap.log)"
  n=0
  for f in "$REPO"/supabase/migrations/*.sql; do
    n=$((n+1))
    sed -E 's/^create extension if not exists pgsodium;?/-- (amorce) &/I' "$f" | su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d $DB" >/dev/null 2>"$LOGS/migration.err" \
      || fail "migration #$n $(basename "$f") : $(tail -3 "$LOGS/migration.err")"
  done
  # Droits par défaut d'un projet Supabase hébergé (hors migrations utilisateur), comme gotrue_pilot_bootstrap.sh.
  pg "-d $DB -c 'grant all on all tables in schema public to service_role; grant all on all sequences in schema public to service_role;'" >/dev/null
  { echo "set search_path = public, extensions; begin;"; cat "$REPO/supabase/tests/fixtures/isolation_multitenant.inc"; echo "commit;"; } \
    | su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d $DB" > "$LOGS/fixture.log" 2>&1 || fail "fixture (voir $LOGS/fixture.log)"
  pg "-d $DB -c \"alter role authenticator with login password 'root';\"" >/dev/null

  echo "== [4/7] base Studio DÉDIÉE jetable $DB_STUDIO ($(ls "$REPO"/apps/studio/supabase/migrations/*.sql | wc -l) migrations) =="
  pg "-c 'drop database if exists \"$DB_STUDIO\";' -c 'create database \"$DB_STUDIO\";'" || fail "création $DB_STUDIO"
  pg "-v dbname=$DB_STUDIO -d $DB_STUDIO -f $REPO/scripts/local-postgres-bootstrap/pg_bootstrap.sql" >/dev/null 2>&1 || fail "amorce Studio"
  pg "-d $DB_STUDIO -c 'create table if not exists auth.sessions (id uuid primary key, user_id uuid);'" >/dev/null
  for f in "$REPO"/apps/studio/supabase/migrations/*.sql; do pg "-d $DB_STUDIO -f $f" >/dev/null 2>&1 || fail "migration Studio $(basename "$f")"; done
fi

echo "== [5/7] démarrage de la pile locale =="
start() { # nom commande...
  local nom="$1"; shift
  nohup "$@" > "$LOGS/$nom.log" 2>&1 &
  echo $! > "$PIDS/$nom.pid"
}
redis-server --port "$P_REDIS" --bind 127.0.0.1 --save '' --appendonly no --daemonize yes --pidfile "$PIDS/redis.pid.srv" --logfile "$LOGS/redis.log" || fail "Redis"
(cd "$BIN" && start gotrue ./auth serve)
cat > "$DIR/postgrest.conf" <<EOF
db-uri = "postgres://authenticator:root@127.0.0.1:5432/$DB"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$JWT_SECRET"
server-host = "127.0.0.1"
server-port = $P_REST
db-pool = 10
EOF
start postgrest "$BIN/postgrest" "$DIR/postgrest.conf"
mkdir -p "$DIR/storage"
(cd "$REPO" && DB="$DB" PORT="$P_STORAGE" GOTRUE_JWT_SECRET="$JWT_SECRET" STORAGE_ROOT="$DIR/storage" start storage node scripts/local-postgres-bootstrap/local_storage_mock.mjs)
(cd "$REPO" && PORT="$P_PROXY" GOTRUE_URL="http://127.0.0.1:$P_GOTRUE" POSTGREST_URL="http://127.0.0.1:$P_REST" STORAGE_URL="http://127.0.0.1:$P_STORAGE" \
  start proxy node scripts/local-postgres-bootstrap/local_supabase_proxy.mjs)
PORT=$P_STRIPE NOM=stripe start stripe node "$HERE/mock-externe.mjs"
PORT=$P_BREVO NOM=brevo start brevo node "$HERE/mock-externe.mjs"
(cd "$REPO" && env \
  NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:$P_PROXY" NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$ANON_JWT" \
  SUPABASE_SERVICE_ROLE_KEY="$SERVICE_JWT" NEXT_PUBLIC_APP_URL="http://127.0.0.1:$P_GP" \
  STRIPE_SECRET_KEY=sk_test_drill_local STRIPE_WEBHOOK_SECRET=whsec_drill_connect \
  STRIPE_WEBHOOK_ABONNEMENT_SECRET=whsec_drill_abonnement STRIPE_WEBHOOK_BOUTIQUE_SECRET=whsec_drill_boutique \
  STRIPE_WEBHOOK_EXPECTED_MODE=test BREVO_API_KEY=xkeysib-drill-local EMAIL_FROM_ADDRESS=drill@example.test \
  CRON_SECRET=drill-cron-secret NEXT_TELEMETRY_DISABLED=1 \
  nohup npx next dev -p "$P_GP" -H 127.0.0.1 > "$LOGS/gp.log" 2>&1 & echo $! > "$PIDS/gp.pid")

attendre_http() { # url libellé [secondes]
  for _ in $(seq 1 "${3:-60}"); do curl -s -o /dev/null -m 3 "$1" && return 0; sleep 1; done
  fail "$2 ne répond pas ($1) — voir $LOGS"
}
attendre_http "http://127.0.0.1:$P_GOTRUE/health" GoTrue
attendre_http "http://127.0.0.1:$P_REST/" PostgREST
attendre_http "http://127.0.0.1:$P_STORAGE/status" "Storage (mock)"
attendre_http "http://127.0.0.1:$P_PROXY/rest/v1/" "proxy Supabase"
attendre_http "http://127.0.0.1:$P_STRIPE/__etat" "Stripe (mock)"
attendre_http "http://127.0.0.1:$P_BREVO/__etat" "Brevo (mock)"
attendre_http "http://127.0.0.1:$P_GP/api/health" "Gestion Pro (next dev)" 240

echo "== [6/7] scénarios =="
export INCIDENT_DRILL_CONFIG="$(node -e 'process.stdout.write(JSON.stringify({
  repo: process.argv[1], dir: process.argv[2], db: process.argv[3], dbStudio: process.argv[4],
  jwtSecret: process.argv[5], anon: process.argv[6], service: process.argv[7],
  urls: { gp: "http://127.0.0.1:" + process.argv[8], supabase: "http://127.0.0.1:" + process.argv[9],
          stripe: "http://127.0.0.1:" + process.argv[10], brevo: "http://127.0.0.1:" + process.argv[11] },
  redis: "redis://127.0.0.1:" + process.argv[12], pids: process.argv[13], logs: process.argv[14], bin: process.argv[15],
  ports: { gotrue: Number(process.argv[16]), storage: Number(process.argv[17]) },
  secrets: ["sk_test_drill_local","whsec_drill_connect","whsec_drill_abonnement","whsec_drill_boutique","xkeysib-drill-local","drill-cron-secret", process.argv[5], process.argv[6], process.argv[7]]
}))' "$REPO" "$DIR" "$DB" "$DB_STUDIO" "$JWT_SECRET" "$ANON_JWT" "$SERVICE_JWT" "$P_GP" "$P_PROXY" "$P_STRIPE" "$P_BREVO" "$P_REDIS" "$PIDS" "$LOGS" "$BIN" "$P_GOTRUE" "$P_STORAGE")"
node "$HERE/scenarios.mjs"
statut=$?

echo "== [7/7] rapport : $DIR/rapport.json (pile $( [ "${INCIDENT_DRILL_KEEP:-0}" = 1 ] && echo conservée || echo arrêtée )) =="
exit $statut
