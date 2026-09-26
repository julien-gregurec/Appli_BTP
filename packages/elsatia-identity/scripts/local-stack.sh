#!/usr/bin/env bash
# Pile locale « deux projets Supabase » pour les tests réels de la fondation d'identité Studio.
# Aucun service distant : deux clusters PostgreSQL 16 distincts (un par projet), deux GoTrue
# v2.192.0 et deux PostgREST, secrets JWT distincts générés à chaque démarrage.
#
#   projet PARTAGÉ (identité centrale ELSATIA / GP) : PG :55432, GoTrue :59998, PostgREST :59996
#   projet DÉDIÉ Studio                             : PG :55433, GoTrue :59999, PostgREST :59997
#
# Prérequis : binaires `gotrue` (github.com/supabase/auth v2.192.0, `go build`) et `postgrest`
# (v12) dans $STACK_BIN ; PostgreSQL 16 (initdb/pg_ctl). Usage :
#   STACK_BIN=/chemin/bin STACK_DIR=/var/tmp/elsatia-stack packages/elsatia-identity/scripts/local-stack.sh start
#   source $STACK_DIR/env.sh && npx vitest run packages/elsatia-identity
#   packages/elsatia-identity/scripts/local-stack.sh stop
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
STACK_DIR="${STACK_DIR:-/var/tmp/elsatia-stack}"
STACK_BIN="${STACK_BIN:-/tmp/claude-0/infra}"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
RUN_AS="${RUN_AS:-postgres}"
as_pg() { if [ "$(id -u)" = 0 ]; then su "$RUN_AS" -c "$*"; else bash -c "$*"; fi; }

bootstrap_roles() { # $1 port
  psql -q -h 127.0.0.1 -p "$1" -U postgres -v ON_ERROR_STOP=1 <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role authenticator login noinherit password 'authenticator';
grant anon, authenticated, service_role to authenticator;
create extension if not exists pgcrypto;
create schema if not exists auth;
SQL
}

start() {
  mkdir -p "$STACK_DIR"; chmod 777 "$STACK_DIR"
  for p in central:55432 studio:55433; do
    name=${p%%:*}; port=${p##*:}
    if [ ! -d "$STACK_DIR/$name" ]; then
      as_pg "$PGBIN/initdb -D $STACK_DIR/$name -A trust -U postgres >/dev/null"
      as_pg "$PGBIN/pg_ctl -D $STACK_DIR/$name -o '-p $port -k $STACK_DIR' -l $STACK_DIR/$name.log start >/dev/null"
      sleep 1.5
      bootstrap_roles "$port"
    else
      as_pg "$PGBIN/pg_ctl -D $STACK_DIR/$name -o '-p $port -k $STACK_DIR' -l $STACK_DIR/$name.log start >/dev/null" || true
      sleep 1.5
    fi
  done
  CENTRAL_SECRET=$(openssl rand -hex 32); STUDIO_SECRET=$(openssl rand -hex 32)

  gotrue() { # name port dbport secret disable_signup min_pw
    env -i PATH="$PATH" \
      GOTRUE_DB_DRIVER=postgres DATABASE_URL="postgres://postgres@127.0.0.1:$3/postgres?sslmode=disable&search_path=auth" \
      GOTRUE_DB_NAMESPACE=auth API_EXTERNAL_URL="http://127.0.0.1:$2" GOTRUE_SITE_URL="http://127.0.0.1:3030" \
      GOTRUE_API_HOST=127.0.0.1 PORT="$2" GOTRUE_JWT_SECRET="$4" GOTRUE_JWT_EXP=60 GOTRUE_JWT_AUD=authenticated \
      GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role \
      GOTRUE_DISABLE_SIGNUP="$5" GOTRUE_PASSWORD_MIN_LENGTH="$6" GOTRUE_MAILER_AUTOCONFIRM=true \
      GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_SMTP_HOST=127.0.0.1 GOTRUE_SMTP_PORT=2500 GOTRUE_SMTP_ADMIN_EMAIL=no-reply@example.test \
      GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED=true GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL=0 \
      GOTRUE_RATE_LIMIT_EMAIL_SENT=100000 GOTRUE_RATE_LIMIT_VERIFY=100000 GOTRUE_RATE_LIMIT_TOKEN_REFRESH=100000 \
      GOTRUE_RATE_LIMIT_SIGN_IN_SIGN_UPS=100000 GOTRUE_LOG_LEVEL=warn \
      "$STACK_BIN/gotrue" migrate >"$STACK_DIR/gotrue-$1-migrate.log" 2>&1
    env -i PATH="$PATH" \
      GOTRUE_DB_DRIVER=postgres DATABASE_URL="postgres://postgres@127.0.0.1:$3/postgres?sslmode=disable&search_path=auth" \
      GOTRUE_DB_NAMESPACE=auth API_EXTERNAL_URL="http://127.0.0.1:$2" GOTRUE_SITE_URL="http://127.0.0.1:3030" \
      GOTRUE_API_HOST=127.0.0.1 PORT="$2" GOTRUE_JWT_SECRET="$4" GOTRUE_JWT_EXP=60 GOTRUE_JWT_AUD=authenticated \
      GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role \
      GOTRUE_DISABLE_SIGNUP="$5" GOTRUE_PASSWORD_MIN_LENGTH="$6" GOTRUE_MAILER_AUTOCONFIRM=true \
      GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_SMTP_HOST=127.0.0.1 GOTRUE_SMTP_PORT=2500 GOTRUE_SMTP_ADMIN_EMAIL=no-reply@example.test \
      GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED=true GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL=0 \
      GOTRUE_RATE_LIMIT_EMAIL_SENT=100000 GOTRUE_RATE_LIMIT_VERIFY=100000 GOTRUE_RATE_LIMIT_TOKEN_REFRESH=100000 \
      GOTRUE_RATE_LIMIT_SIGN_IN_SIGN_UPS=100000 GOTRUE_LOG_LEVEL=warn \
      nohup "$STACK_BIN/gotrue" serve >"$STACK_DIR/gotrue-$1.log" 2>&1 &
    echo $! >"$STACK_DIR/gotrue-$1.pid"
  }
  gotrue central 59998 55432 "$CENTRAL_SECRET" false 6
  gotrue studio 59999 55433 "$STUDIO_SECRET" true 12

  # Migrations applicatives (après le schéma auth de GoTrue).
  psql -q -h 127.0.0.1 -p 55432 -U postgres -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20260926000347_elsatia_identity_broker.sql"
  psql -q -h 127.0.0.1 -p 55433 -U postgres -v ON_ERROR_STOP=1 -f "$ROOT/apps/studio/supabase/migrations/20260926120000_studio_identity_foundation.sql"
  # Sentinelles d'isolation : une donnée « GP » et une donnée « Studio », lisibles par le
  # service_role de LEUR projet uniquement.
  psql -q -h 127.0.0.1 -p 55432 -U postgres -v ON_ERROR_STOP=1 -c "create table public.gp_isolation_sentinel(id int primary key, secret text); insert into public.gp_isolation_sentinel values (1,'bulletin-de-paie'); grant select on public.gp_isolation_sentinel to service_role;"
  psql -q -h 127.0.0.1 -p 55433 -U postgres -v ON_ERROR_STOP=1 -c "create table public.studio_isolation_sentinel(id int primary key, secret text); insert into public.studio_isolation_sentinel values (1,'video-client'); grant select on public.studio_isolation_sentinel to service_role;"

  postgrest() { # name port dbport secret
    env -i PATH="$PATH" PGRST_DB_URI="postgres://authenticator:authenticator@127.0.0.1:$3/postgres" \
      PGRST_DB_ANON_ROLE=anon PGRST_DB_SCHEMAS=public PGRST_JWT_SECRET="$4" PGRST_SERVER_PORT="$2" \
      PGRST_SERVER_HOST=127.0.0.1 PGRST_LOG_LEVEL=warn \
      nohup "$STACK_BIN/postgrest" >"$STACK_DIR/postgrest-$1.log" 2>&1 &
    echo $! >"$STACK_DIR/postgrest-$1.pid"
  }
  postgrest central 59996 55432 "$CENTRAL_SECRET"
  postgrest studio 59997 55433 "$STUDIO_SECRET"
  node "$ROOT/packages/elsatia-identity/scripts/smtp-sink.mjs" >"$STACK_DIR/smtp.log" 2>&1 &
  echo $! >"$STACK_DIR/smtp.pid"

  for url in http://127.0.0.1:59998/health http://127.0.0.1:59999/health http://127.0.0.1:59996/ http://127.0.0.1:59997/; do
    for _ in $(seq 1 60); do curl -sf "$url" >/dev/null && break; sleep 0.5; done
  done
  cat >"$STACK_DIR/env.sh" <<EOF
export PLATFORM_GOTRUE_URL=http://127.0.0.1:59998
export PLATFORM_GOTRUE_JWT_SECRET=$CENTRAL_SECRET
export PLATFORM_REST_URL=http://127.0.0.1:59996
export PLATFORM_DB_URL=postgres://postgres@127.0.0.1:55432/postgres
export STUDIO_GOTRUE_URL=http://127.0.0.1:59999
export STUDIO_GOTRUE_JWT_SECRET=$STUDIO_SECRET
export STUDIO_REST_URL=http://127.0.0.1:59997
export STUDIO_DB_URL=postgres://postgres@127.0.0.1:55433/postgres
EOF
  echo "Pile prête : source $STACK_DIR/env.sh"
}

stop() {
  for f in "$STACK_DIR"/*.pid; do [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null || true; rm -f "$f"; done
  for name in central studio; do [ -d "$STACK_DIR/$name" ] && as_pg "$PGBIN/pg_ctl -D $STACK_DIR/$name stop -m fast >/dev/null" || true; done
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  reset) stop; rm -rf "$STACK_DIR"; start ;;
  *) echo "usage: $0 start|stop|reset" >&2; exit 2 ;;
esac
