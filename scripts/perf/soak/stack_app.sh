#!/usr/bin/env bash
# ELSATIA SOAK V1 — base « soak_app » avec le VRAI schéma GoTrue (auth réel), migrations,
# fixture capacité + tenants volumétriques choisis, mots de passe de banc, puis
# GoTrue :9999 + PostgREST :3001 (max_rows 1000) + proxy :54321 (scripts/local-postgres-bootstrap).
# Mot de passe de banc LOCAL (déjà utilisé par les missions perf précédentes) : PiloteTest!2026.
set -euo pipefail
DB=soak_app
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BS="$REPO/scripts/local-postgres-bootstrap"
B=/tmp/gotrue-build
P() { su postgres -c "psql -X -q -v ON_ERROR_STOP=1 $*"; }
[ -f $B/jwt_secret.txt ] || openssl rand -base64 48 | tr -d '\n' > $B/jwt_secret.txt
cat > $B/gotrue.env.sh <<ENVEOF
export GOTRUE_DB_DRIVER=postgres DB_NAMESPACE=auth DATABASE_URL="postgres://supabase_auth_admin:root@localhost:5432/$DB"
export GOTRUE_JWT_SECRET="$(cat $B/jwt_secret.txt)" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated
export GOTRUE_JWT_ADMIN_ROLES="supabase_admin,service_role" API_EXTERNAL_URL="http://localhost:9999" GOTRUE_API_HOST=localhost PORT=9999
export GOTRUE_SITE_URL="http://localhost:3000" GOTRUE_MAILER_AUTOCONFIRM=true GOTRUE_DISABLE_SIGNUP=false GOTRUE_EXTERNAL_EMAIL_ENABLED=true
export GOTRUE_EXTERNAL_PHONE_ENABLED=false GOTRUE_LOG_LEVEL=warn GOTRUE_RATE_LIMIT_TOKEN_REFRESH=100000 GOTRUE_RATE_LIMIT_VERIFY=100000
ENVEOF
if [ "${SKIP_DB:-0}" != 1 ]; then
  P -c "\"do \\\$\\\$ begin if not exists (select 1 from pg_roles where rolname='supabase_auth_admin') then create role supabase_auth_admin superuser login password 'root' createrole; end if; end \\\$\\\$;\""
  P -c "'drop database if exists $DB'"; P -c "'create database $DB'"
  P -d $DB -c "'create schema if not exists auth authorization supabase_auth_admin'"
  (source $B/gotrue.env.sh; cd $B && ./gotrue migrate >/dev/null 2>&1)
  P -d $DB -c "'alter role supabase_auth_admin set search_path = auth, extensions, public'"
  P -v dbname=$DB -d $DB -f $BS/pg_bootstrap.sql
  for f in "$REPO"/supabase/migrations/*.sql; do
    sed -E 's/^create extension if not exists pgsodium;?/-- stub &/I' "$f" | su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d $DB" >/dev/null 2>&1 || { echo "FAIL $f"; exit 1; }
  done
  # Même complément que gotrue_pilot_bootstrap.sh [6b/7] (bootstrap plateforme hors migrations).
  P -d $DB -c "'grant all on all tables in schema public to service_role; grant all on all sequences in schema public to service_role; grant execute on all functions in schema public to service_role;'"
  P -d $DB -f "$REPO/scripts/perf/generate_fixture.sql" >/dev/null
  LISTE="${TENANTS:-14:50000:20:0 22:1000:500:365}"
  for spec in $LISTE; do IFS=: read k n e j <<<"$spec"
    su postgres -c "psql -X -q -d $DB -v k=$k -v n=$n -v e=$e -v jours=$j -f $REPO/scripts/perf/soak/volume_tenant.sql" | grep tenant; done
  su postgres -c "psql -X -q -d $DB -v k=22 -v jours=120 -f $REPO/scripts/perf/soak/affectations_tenant.sql" | tail -1
  P -d $DB -c "\"update auth.users set encrypted_password = extensions.crypt('PiloteTest!2026', extensions.gen_salt('bf', 4)), email_confirmed_at = now(), instance_id = '00000000-0000-0000-0000-000000000000', confirmation_token = '', recovery_token = '', email_change_token_new = '', email_change = '' where email like '%@perf.invalid' or email like '%@soak.invalid'\""
fi
pkill -f "gotrue serve" 2>/dev/null || true; for p in $(pgrep -x postgrest); do grep -q postgrest-3001 /proc/$p/cmdline && kill $p; done
(source $B/gotrue.env.sh; cd $B; nohup ./gotrue serve > $B/gotrue_serve.log 2>&1 &)
POSTGREST_BUILD_DIR=/tmp/claude-0/pgrst bash "$REPO/scripts/perf/postgrest_local.sh" $DB 3001 "$(cat $B/jwt_secret.txt)"
pkill -f local_supabase_proxy.mjs 2>/dev/null || true
(PORT=54321 GOTRUE_URL=http://localhost:9999 POSTGREST_URL=http://localhost:3001 STORAGE_URL=http://localhost:5000 nohup node $BS/local_supabase_proxy.mjs > /tmp/claude-0/soak/proxy.log 2>&1 &)
sleep 3; curl -s -m 5 localhost:9999/health; echo; curl -s -o /dev/null -w "proxy rest %{http_code}\n" localhost:54321/rest/v1/
