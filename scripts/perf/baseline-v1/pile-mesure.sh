#!/usr/bin/env bash
# ELSATIA — Baseline performance V1 : (re)démarre la pile de mesure locale sur une base jetable.
#   PostgREST v12.2.3 réel (:3001) + passerelle de recette auth/storage (:54320) + routeur (:54321).
# Variables : fichier d'environnement local (secret JWT, clés anon/service signées localement),
# jamais un secret réel. Usage : ENV_PERF=/tmp/perf/env.sh pile-mesure.sh <base> [db_pool]
set -euo pipefail
BASE="${1:?usage: pile-mesure.sh <base> [db_pool]}"
POOL="${2:-10}"
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPOT="$(cd "$ICI/../../.." && pwd)"
POSTGREST_DIR="${POSTGREST_BUILD_DIR:-/tmp/postgrest-build}"
source "${ENV_PERF:?ENV_PERF requis}"

pkill -f "postgrest perf.conf" 2>/dev/null || true
pkill -f "colors-pile-locale/passerelle.mjs" 2>/dev/null || true
pkill -f "baseline-v1/routeur-local.mjs" 2>/dev/null || true
sleep 1

su postgres -w PASSERELLE_MDP_DB -c "psql -X -q -v ON_ERROR_STOP=1 -d $BASE" <<'SQL'
\getenv mdp PASSERELLE_MDP_DB
grant all on table storage.objects, storage.buckets to anon, authenticated, service_role;
alter role authenticator with login password :'mdp';
alter role supabase_admin with login password :'mdp';
SQL

cat > "$POSTGREST_DIR/perf.conf" <<CONF
db-uri = "postgres://authenticator:$PASSERELLE_MDP_DB@127.0.0.1:5432/$BASE"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$PASSERELLE_SECRET_JWT"
server-port = 3001
db-pool = $POOL
db-max-rows = 1000
CONF
(cd "$POSTGREST_DIR" && nohup ./postgrest perf.conf > perf-postgrest.log 2>&1 &) </dev/null >/dev/null 2>&1

(cd "$DEPOT" && PASSERELLE_PORT=54320 PASSERELLE_STOCKAGE="${JOURNAUX_PERF:-/tmp/perf}/stockage" \
  PASSERELLE_DATABASE_URL="postgres://authenticator:$PASSERELLE_MDP_DB@127.0.0.1:5432/$BASE" \
  PASSERELLE_ADMIN_DATABASE_URL="postgres://supabase_admin:$PASSERELLE_MDP_DB@127.0.0.1:5432/$BASE" \
  nohup node tests/e2e/colors-pile-locale/passerelle.mjs > "${JOURNAUX_PERF:-/tmp/perf}/passerelle.log" 2>&1 &) </dev/null >/dev/null 2>&1
(cd "$DEPOT" && PORT=54321 nohup node scripts/perf/baseline-v1/routeur-local.mjs > "${JOURNAUX_PERF:-/tmp/perf}/routeur.log" 2>&1 &) </dev/null >/dev/null 2>&1
sleep 3
# Le cache de schéma de PostgREST (357 migrations) peut demander plusieurs secondes : 503 d'ici là.
for _ in $(seq 1 30); do curl -sf -o /dev/null http://127.0.0.1:3001/ && break; sleep 1; done
curl -sf -o /dev/null http://127.0.0.1:3001/ || { echo "PostgREST KO"; tail "$POSTGREST_DIR/perf-postgrest.log"; exit 1; }
# Garde-fou : exactement UN PostgREST, connecté à la base demandée (sinon un ancien processus
# resté sur le port servirait une autre base et fausserait toute la campagne).
[ "$(pgrep -fc "postgrest perf.conf")" = 1 ] || { echo "plusieurs PostgREST actifs"; exit 1; }
sleep 1
[ "$(su postgres -c "psql -XAt -c \"select count(*) from pg_stat_activity where usename='authenticator' and datname<>'$BASE'\"")" = 0 ] \
  || { echo "authenticator connecté à une autre base que $BASE"; exit 1; }
curl -sf -o /dev/null http://127.0.0.1:54321/__recette/sante || { echo "passerelle/routeur KO"; exit 1; }
echo "pile de mesure prête sur $BASE (PostgREST db-pool=$POOL)"
