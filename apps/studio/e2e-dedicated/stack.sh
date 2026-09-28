#!/usr/bin/env bash
# ELSATIA Studio — banc E2E DÉDIÉ (aucun train partagé GP, aucun service distant).
#
# Démarre réellement, en local (127.0.0.1) :
#   projet Supabase DÉDIÉ Studio : PostgreSQL 16 + GoTrue v2.192.0 + PostgREST v12 + storage-api
#                                  (supabase/storage, source) + passerelle /auth /rest /storage
#                                  + chaîne apps/studio/supabase/migrations SEULE
#   identité centrale ELSATIA    : PostgreSQL 16 + GoTrue + PostgREST + migration
#                                  20260927100000_elsatia_identity_broker SEULE (aucune table GP)
#                                  + central-identity.ts (logique plateforme réelle @elsatia/identity)
#   Redis, worker de rendu (workers/studio-video), application Studio (next build + next start).
#
# Prérequis (voir docs/qualification/ELSATIA_STUDIO_DEDICATED_PLAYWRIGHT_CI_V1.md §2) :
#   $E2E_BIN/gotrue, $E2E_BIN/postgrest, $E2E_STORAGE_SRC (supabase/storage construit : dist/),
#   PostgreSQL 16 (initdb/pg_ctl), redis-server, ffmpeg (avec drawtext), node ≥ 22, npm ci faits.
#
# Usage : apps/studio/e2e-dedicated/stack.sh start|stop|reset|status|env
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$(cd "$HERE/.." && pwd)"
ROOT="$(cd "$APP/../.." && pwd)"
E2E_DIR="${E2E_DIR:-/var/tmp/elsatia-studio-e2e}"
E2E_BIN="${E2E_BIN:-/tmp/claude-0/infra}"
E2E_STORAGE_SRC="${E2E_STORAGE_SRC:-$E2E_BIN/storage-src}"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
RUN_AS="${RUN_AS:-postgres}"
E2E_SKIP_BUILD="${E2E_SKIP_BUILD:-0}"

# Ports (tous sur 127.0.0.1)
P_PG_CENTRAL=56432; P_PG_STUDIO=56433
P_AUTH_CENTRAL=56998; P_AUTH_STUDIO=56999
P_REST_CENTRAL=56996; P_REST_STUDIO=56997
P_STORAGE=56500; P_GW_CENTRAL=56320; P_GW_STUDIO=56321
P_REDIS=56379; P_CENTRAL_APP=56300; P_STUDIO_APP=3030; P_SMTP=2500

as_pg() { if [ "$(id -u)" = 0 ]; then su "$RUN_AS" -c "$*"; else bash -c "$*"; fi; }
psql_c() { psql -X -q -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 "$@"; }
log() { printf '[e2e-dedicated] %s\n' "$*"; }
wait_http() { # url [tentatives]
  for _ in $(seq 1 "${2:-120}"); do curl -s -o /dev/null "$1" && return 0; sleep 0.5; done
  log "ÉCHEC : $1 injoignable"; return 1
}
spawn() { # nom commande… (journal + pid dans $E2E_DIR)
  local name=$1; shift
  nohup "$@" >"$E2E_DIR/$name.log" 2>&1 &
  echo $! >"$E2E_DIR/$name.pid"
}

# Plateforme Supabase minimale d'un projet hébergé, AVANT toute migration utilisateur : rôles,
# schéma extensions + pgcrypto, privilèges par défaut du schéma public (comme un vrai projet :
# anon/authenticated/service_role reçoivent les droits, les migrations les RETIRENT).
bootstrap_platform() { # port
  psql_c -p "$1" <<'SQL'
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator login noinherit password 'authenticator';
create role supabase_auth_admin login createrole noinherit;
create role supabase_storage_admin login createrole noinherit;
grant anon, authenticated, service_role to authenticator;
grant anon, authenticated, service_role to postgres;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
grant usage on schema public, extensions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter database postgres set search_path = "$user", public, extensions;
create schema if not exists auth;
SQL
}

gotrue_env() { # port dbport secret disable_signup min_pw
  echo GOTRUE_DB_DRIVER=postgres "DATABASE_URL=postgres://postgres@127.0.0.1:$2/postgres?sslmode=disable&search_path=auth" \
    GOTRUE_DB_NAMESPACE=auth API_EXTERNAL_URL=http://127.0.0.1:$1 GOTRUE_SITE_URL=http://127.0.0.1:$P_STUDIO_APP \
    GOTRUE_URI_ALLOW_LIST=http://127.0.0.1:$P_STUDIO_APP/** \
    GOTRUE_API_HOST=127.0.0.1 PORT=$1 GOTRUE_JWT_SECRET=$3 GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated \
    GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role \
    GOTRUE_DISABLE_SIGNUP=$4 GOTRUE_PASSWORD_MIN_LENGTH=$5 GOTRUE_MAILER_AUTOCONFIRM=true \
    GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_SMTP_HOST=127.0.0.1 GOTRUE_SMTP_PORT=$P_SMTP GOTRUE_SMTP_ADMIN_EMAIL=no-reply@example.test \
    GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED=true GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL=0 \
    GOTRUE_RATE_LIMIT_EMAIL_SENT=100000 GOTRUE_RATE_LIMIT_VERIFY=100000 GOTRUE_RATE_LIMIT_TOKEN_REFRESH=100000 \
    GOTRUE_RATE_LIMIT_SIGN_IN_SIGN_UPS=100000 GOTRUE_RATE_LIMIT_OTP=100000 GOTRUE_LOG_LEVEL=warn
}

hs256() { # secret role → JWT (clé anon / service du projet)
  node -e '
    const c=require("node:crypto");const [s,r]=process.argv.slice(1);
    const b=(o)=>Buffer.from(JSON.stringify(o)).toString("base64url");
    const now=Math.floor(Date.now()/1000);
    const h=b({alg:"HS256",typ:"JWT"}),p=b({iss:"supabase-e2e",role:r,iat:now,exp:now+10*365*86400});
    process.stdout.write(`${h}.${p}.`+c.createHmac("sha256",s).update(`${h}.${p}`).digest("base64url"));
  ' "$1" "$2"
}

# ---------------------------------------------------------------------------------------------
# Chaîne DÉDIÉE : ordre lexical des fichiers, registre supabase_migrations (comme `db push`),
# puis contrôles bloquants : nombre, ordre, aucune migration GP, aucune table GP.
apply_dedicated_chain() {
  psql_c -p "$P_PG_STUDIO" -c "create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations(version text primary key, name text not null, applied_at timestamptz not null default now());"
  local n=0
  for f in "$APP"/supabase/migrations/*.sql; do
    local base; base=$(basename "$f" .sql)
    psql_c -p "$P_PG_STUDIO" -f "$f" >/dev/null
    psql_c -p "$P_PG_STUDIO" -c "insert into supabase_migrations.schema_migrations(version,name) values ('${base%%_*}','${base#*_}')"
    n=$((n + 1))
  done
  log "chaîne dédiée : $n migrations appliquées"
  node "$HERE/verify-dedicated-chain.mjs" --db "postgres://postgres@127.0.0.1:$P_PG_STUDIO/postgres"
}

start() {
  mkdir -p "$E2E_DIR"; chmod 777 "$E2E_DIR"
  [ -x "$E2E_BIN/gotrue" ] && [ -x "$E2E_BIN/postgrest" ] || { log "binaires gotrue/postgrest absents de $E2E_BIN"; exit 1; }
  [ -f "$E2E_STORAGE_SRC/dist/start/server.js" ] || { log "storage-api non construit ($E2E_STORAGE_SRC/dist)"; exit 1; }

  # 1. Deux clusters PostgreSQL 16 vierges (un par projet).
  for p in central:$P_PG_CENTRAL studio:$P_PG_STUDIO; do
    local name=${p%%:*} port=${p##*:}
    rm -rf "${E2E_DIR:?}/$name"
    as_pg "$PGBIN/initdb -D $E2E_DIR/$name -A trust -U postgres >/dev/null"
    as_pg "$PGBIN/pg_ctl -D $E2E_DIR/$name -o '-p $port -k $E2E_DIR -c max_connections=300' -l $E2E_DIR/pg-$name.log -w start >/dev/null"
    bootstrap_platform "$port"
  done

  local central_secret studio_secret
  central_secret=$(openssl rand -hex 32); studio_secret=$(openssl rand -hex 32)
  spawn smtp node "$ROOT/packages/elsatia-identity/scripts/smtp-sink.mjs"

  # 2. GoTrue (schéma auth réel) : central (inscription ouverte côté ELSATIA), Studio (fermée).
  # shellcheck disable=SC2046
  env -i PATH="$PATH" $(gotrue_env $P_AUTH_CENTRAL $P_PG_CENTRAL "$central_secret" false 6) "$E2E_BIN/gotrue" migrate >"$E2E_DIR/gotrue-central-migrate.log" 2>&1
  # shellcheck disable=SC2046
  env -i PATH="$PATH" $(gotrue_env $P_AUTH_STUDIO $P_PG_STUDIO "$studio_secret" true 12) "$E2E_BIN/gotrue" migrate >"$E2E_DIR/gotrue-studio-migrate.log" 2>&1
  # shellcheck disable=SC2046
  spawn gotrue-central env -i PATH="$PATH" $(gotrue_env $P_AUTH_CENTRAL $P_PG_CENTRAL "$central_secret" false 6) "$E2E_BIN/gotrue" serve
  # shellcheck disable=SC2046
  spawn gotrue-studio env -i PATH="$PATH" $(gotrue_env $P_AUTH_STUDIO $P_PG_STUDIO "$studio_secret" true 12) "$E2E_BIN/gotrue" serve

  # 3. storage-api RÉEL (supabase/storage) : ses propres migrations du schéma storage, avant la
  #    chaîne Studio (ordre d'un projet hébergé), stockage fichier local.
  mkdir -p "$E2E_DIR/storage-data"
  (cd "$E2E_STORAGE_SRC" && spawn storage env -i PATH="$PATH" HOME="$E2E_DIR" \
    SERVER_HOST=127.0.0.1 SERVER_PORT=$P_STORAGE SERVER_ADMIN_PORT=$((P_STORAGE + 1)) SERVER_REGION=local \
    AUTH_JWT_SECRET="$studio_secret" AUTH_JWT_ALGORITHM=HS256 \
    DATABASE_URL="postgresql://postgres@127.0.0.1:$P_PG_STUDIO/postgres" DB_INSTALL_ROLES=true \
    DB_MIGRATIONS_STRATEGY=on_request STORAGE_BACKEND=file STORAGE_FILE_BACKEND_PATH="$E2E_DIR/storage-data" \
    STORAGE_FILE_ETAG_ALGORITHM=md5 FILE_SIZE_LIMIT=1073741824 UPLOAD_FILE_SIZE_LIMIT=1073741824 \
    UPLOAD_SIGNED_URL_EXPIRATION_TIME=120 TUS_URL_PATH=/upload/resumable TUS_LOCK_TYPE=postgres \
    REQUEST_ALLOW_X_FORWARDED_PATH=true TENANT_ID=stub IS_MULTITENANT=false \
    IMAGE_TRANSFORMATION_ENABLED=false RATE_LIMITER_ENABLED=false PG_QUEUE_ENABLE=false \
    OTEL_METRICS_ENABLED=false PROMETHEUS_METRICS_ENABLED=false LOGFLARE_ENABLED=false LOG_LEVEL=warn \
    node "$E2E_STORAGE_SRC/dist/start/server.js")
  wait_http "http://127.0.0.1:$P_STORAGE/status"
  for _ in $(seq 1 120); do
    [ "$(psql -X -At -h 127.0.0.1 -p $P_PG_STUDIO -U postgres -c "select to_regclass('storage.objects') is not null and to_regclass('storage.migrations') is not null")" = t ] && break
    # stratégie on_request : la première requête authentifiée déclenche les migrations.
    curl -s -o /dev/null -H "Authorization: Bearer $(hs256 "$studio_secret" service_role)" "http://127.0.0.1:$P_STORAGE/bucket" || true
    sleep 0.5
  done
  log "storage-api : schéma storage migré ($(psql -X -At -h 127.0.0.1 -p $P_PG_STUDIO -U postgres -c 'select count(*) from storage.migrations') migrations storage)"

  # 4. Chaînes applicatives : identité centrale SEULE ; Studio DÉDIÉE SEULE.
  psql_c -p "$P_PG_CENTRAL" -f "$ROOT/supabase/migrations/20260927100000_elsatia_identity_broker.sql" >/dev/null
  apply_dedicated_chain

  # 5. PostgREST (un par projet), passerelles, Redis.
  for p in central:$P_REST_CENTRAL:$P_PG_CENTRAL:$central_secret studio:$P_REST_STUDIO:$P_PG_STUDIO:$studio_secret; do
    IFS=: read -r name port dbport secret <<<"$p"
    spawn "postgrest-$name" env -i PATH="$PATH" PGRST_DB_URI="postgres://authenticator:authenticator@127.0.0.1:$dbport/postgres" \
      PGRST_DB_ANON_ROLE=anon PGRST_DB_SCHEMAS=public PGRST_JWT_SECRET="$secret" PGRST_SERVER_PORT="$port" \
      PGRST_SERVER_HOST=127.0.0.1 PGRST_LOG_LEVEL=warn PGRST_DB_POOL=20 "$E2E_BIN/postgrest"
  done
  spawn gateway-central node "$HERE/gateway.mjs" $P_GW_CENTRAL http://127.0.0.1:$P_AUTH_CENTRAL http://127.0.0.1:$P_REST_CENTRAL
  spawn gateway-studio node "$HERE/gateway.mjs" $P_GW_STUDIO http://127.0.0.1:$P_AUTH_STUDIO http://127.0.0.1:$P_REST_STUDIO http://127.0.0.1:$P_STORAGE
  spawn redis redis-server --port $P_REDIS --bind 127.0.0.1 --save "" --appendonly no
  for url in http://127.0.0.1:$P_AUTH_CENTRAL/health http://127.0.0.1:$P_AUTH_STUDIO/health \
             http://127.0.0.1:$P_REST_CENTRAL/ http://127.0.0.1:$P_REST_STUDIO/ \
             http://127.0.0.1:$P_GW_STUDIO/auth/v1/health http://127.0.0.1:$P_GW_CENTRAL/auth/v1/health; do
    wait_http "$url"
  done

  # 6. Clés : anon/service Studio (secret Studio), service central (secret central), trousseau de
  #    signature ES256 de l'identité centrale (privé : identité centrale seule ; Studio : JWKS).
  local keys; keys=$(node "$ROOT/packages/elsatia-identity/scripts/keygen.mjs")
  local cron; cron=$(openssl rand -hex 24)
  local e2e_admin; e2e_admin=$(openssl rand -hex 24)
  cat >"$E2E_DIR/env.sh" <<EOF
# Généré par stack.sh — SECRETS DE TEST JETABLES, jamais réutilisables ailleurs.
export E2E_DIR=$E2E_DIR
export STUDIO_DB_URL=postgres://postgres@127.0.0.1:$P_PG_STUDIO/postgres
export PLATFORM_DB_URL=postgres://postgres@127.0.0.1:$P_PG_CENTRAL/postgres
export STUDIO_GOTRUE_URL=http://127.0.0.1:$P_AUTH_STUDIO
export STUDIO_REST_URL=http://127.0.0.1:$P_REST_STUDIO
export STUDIO_GOTRUE_JWT_SECRET=$studio_secret
export PLATFORM_GOTRUE_URL=http://127.0.0.1:$P_AUTH_CENTRAL
export PLATFORM_REST_URL=http://127.0.0.1:$P_REST_CENTRAL
export PLATFORM_GOTRUE_JWT_SECRET=$central_secret
export PLATFORM_GATEWAY_URL=http://127.0.0.1:$P_GW_CENTRAL
export PLATFORM_ANON_KEY=$(hs256 "$central_secret" anon)
export PLATFORM_SERVICE_KEY=$(hs256 "$central_secret" service_role)
export NEXT_PUBLIC_STUDIO_URL=http://127.0.0.1:$P_STUDIO_APP
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:$P_GW_STUDIO
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$(hs256 "$studio_secret" anon)
export STUDIO_STORAGE_SERVICE_KEY=$(hs256 "$studio_secret" service_role)
export STUDIO_AUTH_SERVICE_KEY=$(hs256 "$studio_secret" service_role)
export STUDIO_REDIS_URL=redis://127.0.0.1:$P_REDIS
export ELSATIA_CENTRAL_URL=http://127.0.0.1:$P_CENTRAL_APP
export ELSATIA_IDENTITY_ISSUER=http://127.0.0.1:$P_CENTRAL_APP/identity
export ELSATIA_IDENTITY_JWKS_URL=http://127.0.0.1:$P_CENTRAL_APP/api/elsatia-identity/jwks
export ELSATIA_IDENTITY_HANDOFF_URL=http://127.0.0.1:$P_CENTRAL_APP/identity/studio/handoff
export ELSATIA_IDENTITY_SIGNING_KEYS='$keys'
export ELSATIA_STUDIO_EXCHANGE_URL=http://127.0.0.1:$P_STUDIO_APP/auth/elsatia/exchange
export ELSATIA_STUDIO_LIFECYCLE_URL=http://127.0.0.1:$P_STUDIO_APP/api/elsatia/lifecycle
export E2E_CENTRAL_ADMIN_TOKEN=$e2e_admin
export STUDIO_CRON_SECRET=$cron
export STUDIO_IDENTITY_MODE=elsatia
export ELSATIA_APPLICATION_ENV=local
export STUDIO_LEGAL_PUBLISHED=1
export STUDIO_ENABLED=1
export STUDIO_AI_ANALYSIS=0
export STUDIO_IDENTITY_REVALIDATE_S=43200
export STUDIO_IDENTITY_MAX_SESSION_S=86400
export STUDIO_RENDER_TMP=$E2E_DIR/render-tmp
export STUDIO_RENDER_TIMEOUT_SECONDS=300
export STUDIO_FFMPEG_PATH=\${STUDIO_FFMPEG_PATH:-$(command -v ffmpeg || true)}
export STUDIO_FFPROBE_PATH=\${STUDIO_FFPROBE_PATH:-$(command -v ffprobe || true)}
EOF
  # shellcheck disable=SC1091
  source "$E2E_DIR/env.sh"

  # 7. Identité centrale ELSATIA (logique plateforme réelle, projet central sans table GP).
  spawn central "$ROOT/workers/studio-video/node_modules/.bin/tsx" "$HERE/central-identity.ts"
  wait_http "http://127.0.0.1:$P_CENTRAL_APP/health"

  # 8. Application Studio : build de production puis next start (variables publiques inlinées).
  if [ "$E2E_SKIP_BUILD" != 1 ] || [ ! -f "$APP/.next/BUILD_ID" ]; then
    log "next build Studio…"
    (cd "$APP" && npm run build >"$E2E_DIR/studio-build.log" 2>&1) || { log "ÉCHEC build (voir $E2E_DIR/studio-build.log)"; exit 1; }
  fi
  (cd "$APP" && spawn studio npx next start -p $P_STUDIO_APP -H 127.0.0.1)
  wait_http "http://127.0.0.1:$P_STUDIO_APP/login" 240

  # 9. Worker de rendu réel (BullMQ sur Redis, RPC service, storage-api).
  mkdir -p "$STUDIO_RENDER_TMP"
  (cd "$ROOT/workers/studio-video" && spawn worker npx tsx src/worker.ts)
  sleep 2
  kill -0 "$(cat "$E2E_DIR/worker.pid")" || { log "ÉCHEC worker (voir $E2E_DIR/worker.log)"; exit 1; }
  log "banc prêt : source $E2E_DIR/env.sh"
}

stop() {
  for f in "$E2E_DIR"/*.pid; do
    [ -f "$f" ] || continue
    pid=$(cat "$f"); pkill -P "$pid" 2>/dev/null || true; kill "$pid" 2>/dev/null || true; rm -f "$f"
  done
  for name in central studio; do
    [ -d "$E2E_DIR/$name" ] && as_pg "$PGBIN/pg_ctl -D $E2E_DIR/$name stop -m fast >/dev/null" || true
  done
}

status() {
  for f in "$E2E_DIR"/*.pid; do
    [ -f "$f" ] || continue
    if kill -0 "$(cat "$f")" 2>/dev/null; then echo "up   $(basename "$f" .pid)"; else echo "DOWN $(basename "$f" .pid)"; fi
  done
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  reset) stop; rm -rf "${E2E_DIR:?}"; start ;;
  status) status ;;
  *) echo "usage: $0 start|stop|reset|status" >&2; exit 2 ;;
esac
