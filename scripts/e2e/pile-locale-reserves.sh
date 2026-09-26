#!/usr/bin/env bash
# Pile Supabase RÉELLE, sans Docker, pour la recette ELSATIA Réserves.
#
# Monte, au-dessus d'un PostgreSQL 16 local :
#   • GoTrue      — compilé depuis github.com/supabase/auth (tag figé) ;
#   • storage-api — service officiel github.com/supabase/storage, stockage « file » ;
#   • PostgREST   — binaire officiel de la release GitHub ;
#   • le proxy de chemins de scripts/local-postgres-bootstrap/local_supabase_proxy.mjs
#     (/auth/v1, /rest/v1, /storage/v1 sur http://127.0.0.1:54321, comme Kong).
# Ordre de construction de la base : schéma auth de GoTrue → schéma storage de storage-api
# → amorce pg_bootstrap.sql (IF NOT EXISTS) → train complet supabase/migrations.
#
# Utilisé par docs/qualification/ELSATIA_RESERVES_FULL_LOCAL_QUALIFICATION_V1.md.
# Strictement local : 127.0.0.1 partout, identités @invalid.local, mot de passe « test ».
#
# Prérequis : PostgreSQL 16 (utilisateur OS postgres), Go, Node 22 (Réserves), accès
# github.com / nodejs.org / storage.googleapis.com. storage-api exige Node ≥ 24 : une
# distribution Node 24 est téléchargée dans le répertoire de travail, sans toucher au poste.
#
# Usage : scripts/e2e/pile-locale-reserves.sh [répertoire de travail]   (défaut /tmp/rsv-stack)
# Ensuite : voir la fin du script (build Réserves, décor, Playwright).
set -euo pipefail

TRAVAIL="${1:-/tmp/rsv-stack}"
BASE=reserves_e2e
RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
AMORCE="$RACINE/scripts/local-postgres-bootstrap"
GOTRUE_TAG=v2.196.0
POSTGREST_VERSION=v12.2.3
NODE24=v24.9.0
CHROME_POUR_PLAYWRIGHT=151.0.7922.34   # version attendue par @playwright/test 1.62
URL_ADMIN="postgresql://postgres:postgres@127.0.0.1:5432/$BASE"

mkdir -p "$TRAVAIL" && cd "$TRAVAIL"
psql_su() { su postgres -c "psql -X -q -v ON_ERROR_STOP=1 $*"; }

echo "== 0. arrêt d'une pile précédente =="
# Motifs en « [x]… » : ils ne correspondent jamais à la ligne de commande de ce script.
pkill -f "[.]/gotrue serve" 2>/dev/null || true
pkill -f "[.]/postgrest postgrest.conf" 2>/dev/null || true
pkill -f "[d]ist/start/server.js" 2>/dev/null || true
pkill -f "[l]ocal_supabase_proxy.mjs" 2>/dev/null || true
sleep 2
service postgresql start >/dev/null 2>&1 || true

echo "== 1. binaires (mis en cache dans $TRAVAIL) =="
if [ ! -x gotrue ]; then
  git clone -q --depth 1 --branch "$GOTRUE_TAG" https://github.com/supabase/auth.git gotrue-src
  (cd gotrue-src && GOFLAGS=-mod=mod go build -o "$TRAVAIL/gotrue" .)
  cp -r gotrue-src/migrations ./migrations
fi
if [ ! -x postgrest ]; then
  curl -sSL -o postgrest.tar.xz "https://github.com/PostgREST/postgrest/releases/download/$POSTGREST_VERSION/postgrest-$POSTGREST_VERSION-linux-static-x64.tar.xz"
  tar -xJf postgrest.tar.xz
fi
if [ ! -x "node-$NODE24-linux-x64/bin/node" ]; then
  curl -sSL -o node24.tar.xz "https://nodejs.org/dist/$NODE24/node-$NODE24-linux-x64.tar.xz"
  tar -xJf node24.tar.xz
fi
if [ ! -f storage-src/dist/start/server.js ]; then
  git clone -q --depth 1 https://github.com/supabase/storage.git storage-src
  (cd storage-src && PATH="$TRAVAIL/node-$NODE24-linux-x64/bin:$PATH" npm ci --engine-strict=false --no-audit --no-fund \
    && PATH="$TRAVAIL/node-$NODE24-linux-x64/bin:$PATH" npm run build)
fi
if [ ! -x chrome-linux64/chrome ]; then
  curl -sSL -o cft.zip "https://storage.googleapis.com/chrome-for-testing-public/$CHROME_POUR_PLAYWRIGHT/linux64/chrome-linux64.zip"
  unzip -q -o cft.zip
fi

echo "== 2. secrets locaux et clés signées =="
[ -f jwt_secret.txt ] || openssl rand -hex 32 | tr -d '\n' > jwt_secret.txt
export GOTRUE_JWT_SECRET="$(cat jwt_secret.txt)"
node "$AMORCE/jwt_bridge.mjs" sign '{"role":"anon","iss":"supabase-demo","exp":2000000000}' | tail -1 > anon.key
node "$AMORCE/jwt_bridge.mjs" sign '{"role":"service_role","iss":"supabase-demo","exp":2000000000}' | tail -1 > service.key

echo "== 3. base $BASE : GoTrue → storage-api → amorce → train =="
psql_su -c "\"alter role postgres with password 'postgres';\""
psql_su -c "\"do \\\$\\\$ begin if not exists (select 1 from pg_roles where rolname='supabase_auth_admin') then create role supabase_auth_admin superuser login password 'root' createrole; end if; end \\\$\\\$;\""
# Les services arrêtés à l'étape 0 peuvent tenir encore une connexion quelques instants.
for essai in 1 2 3 4 5 6 7 8 9 10; do
  psql_su -c "\"select pg_terminate_backend(pid) from pg_stat_activity where datname='$BASE' and pid<>pg_backend_pid();\"" >/dev/null
  psql_su -c "'drop database if exists $BASE;'" 2>/dev/null && break
  [ "$essai" = 10 ] && { echo "Base $BASE toujours occupée"; exit 1; }
  sleep 1
done
psql_su -c "'create database $BASE;'"
psql_su -d "$BASE" -c "'create schema if not exists auth authorization supabase_auth_admin;'"

cat > gotrue.env.sh <<EOF
export GOTRUE_DB_DRIVER=postgres DB_NAMESPACE=auth
export DATABASE_URL="postgres://supabase_auth_admin:root@127.0.0.1:5432/$BASE"
export GOTRUE_JWT_SECRET="$(cat jwt_secret.txt)" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated
export GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES="supabase_admin,service_role"
export API_EXTERNAL_URL="http://127.0.0.1:54321/auth/v1" GOTRUE_API_HOST=127.0.0.1 PORT=9999
export GOTRUE_SITE_URL="http://127.0.0.1:3020" GOTRUE_URI_ALLOW_LIST="http://127.0.0.1:3020/**,http://localhost:3020/**"
export GOTRUE_MAILER_AUTOCONFIRM=true GOTRUE_DISABLE_SIGNUP=true GOTRUE_EXTERNAL_EMAIL_ENABLED=true
export GOTRUE_EXTERNAL_PHONE_ENABLED=false GOTRUE_LOG_LEVEL=warn
export GOTRUE_RATE_LIMIT_TOKEN_REFRESH=10000 GOTRUE_RATE_LIMIT_VERIFY=10000
export GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED=true
EOF
( source gotrue.env.sh && ./gotrue migrate )
psql_su -d "$BASE" -c "'alter role supabase_auth_admin set search_path = auth, extensions, public;'"

cat > storage.env.sh <<EOF
export SERVER_HOST=127.0.0.1 SERVER_PORT=5000 SERVER_ADMIN_PORT=5001 SERVER_REGION=local
export AUTH_JWT_SECRET="$(cat jwt_secret.txt)" AUTH_JWT_ALGORITHM=HS256
export ANON_KEY="$(cat anon.key)" SERVICE_KEY="$(cat service.key)"
export DATABASE_URL="$URL_ADMIN"
export DB_INSTALL_ROLES=true DB_ANON_ROLE=anon DB_SERVICE_ROLE=service_role DB_AUTHENTICATED_ROLE=authenticated DB_SUPER_USER=postgres
export DB_ALLOW_MIGRATION_REFRESH=true DATABASE_MAX_CONNECTIONS=10
export STORAGE_BACKEND=file STORAGE_FILE_BACKEND_PATH="$TRAVAIL/storage-data" TENANT_ID=stub STORAGE_S3_BUCKET=stub
export FILE_SIZE_LIMIT=52428800 UPLOAD_FILE_SIZE_LIMIT=52428800 UPLOAD_FILE_SIZE_LIMIT_STANDARD=52428800
export UPLOAD_SIGNED_URL_EXPIRATION_TIME=60 IMAGE_TRANSFORMATION_ENABLED=false RATE_LIMITER_ENABLED=false
export PG_QUEUE_ENABLE=false OTEL_METRICS_ENABLED=false PROMETHEUS_METRICS_ENABLED=false LOGFLARE_ENABLED=false LOG_LEVEL=warn
EOF
rm -rf storage-data && mkdir -p storage-data
# Groupe entier redirigé et `exec` : aucun shell intermédiaire ne garde la sortie du script.
( source storage.env.sh && cd storage-src && PATH="$TRAVAIL/node-$NODE24-linux-x64/bin:$PATH" NODE_ENV=production \
    exec node dist/start/server.js ) > "$TRAVAIL/storage.log" 2>&1 < /dev/null &
timeout 60 bash -c 'until curl -sf -o /dev/null http://127.0.0.1:5000/status; do sleep 1; done'
# storage-api a joué SES migrations au démarrage : le schéma storage est le vrai.

psql_su -v dbname="$BASE" -d "$BASE" -f "$AMORCE/pg_bootstrap.sql" >/dev/null
n=0
for f in "$RACINE"/supabase/migrations/*.sql; do
  n=$((n+1))
  sed -E 's/^create extension if not exists pgsodium;?/-- (stub pg_bootstrap.sql) &/I' "$f" \
    | psql "$URL_ADMIN" -X -q -v ON_ERROR_STOP=1 >/dev/null || { echo "ÉCHEC migration $n : $f"; exit 1; }
done
echo "   $n migrations appliquées"
psql "$URL_ADMIN" -X -q -c "grant all on all tables in schema public to service_role;
  grant all on all sequences in schema public to service_role;
  grant execute on all functions in schema public to service_role;
  alter role authenticator with login password 'root';"

echo "== 4. services =="
cat > postgrest.conf <<EOF
db-uri = "postgres://authenticator:root@127.0.0.1:5432/$BASE"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$(cat jwt_secret.txt)"
server-host = "127.0.0.1"
server-port = 3001
db-pool = 10
EOF
( exec ./postgrest postgrest.conf ) > postgrest.log 2>&1 < /dev/null &
( source gotrue.env.sh && exec ./gotrue serve ) > gotrue.log 2>&1 < /dev/null &
( cd "$RACINE" && PORT=54321 GOTRUE_URL=http://127.0.0.1:9999 POSTGREST_URL=http://127.0.0.1:3001 \
    STORAGE_URL=http://127.0.0.1:5000 exec node "$AMORCE/local_supabase_proxy.mjs" ) > "$TRAVAIL/proxy.log" 2>&1 < /dev/null &
timeout 60 bash -c 'until curl -sf -o /dev/null http://127.0.0.1:54321/auth/v1/health; do sleep 1; done'

cat > reserves.env.sh <<EOF
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
export NEXT_PUBLIC_SUPABASE_ANON_KEY=$(cat anon.key)
export NEXT_PUBLIC_RESERVES_URL=http://127.0.0.1:3020
export ELSATIA_APPLICATION_ENV=local
export SUPABASE_SERVICE_ROLE_KEY=$(cat service.key)
export PDF_CHROMIUM_EXECUTABLE_PATH=$TRAVAIL/chrome-linux64/chrome
export CRON_SECRET=recette-locale-cron
EOF
cat > e2e.env.sh <<EOF
export E2E_RESERVES_URL=http://127.0.0.1:3020 E2E_SUPABASE_URL=http://127.0.0.1:54321
export E2E_SUPABASE_ANON_KEY=$(cat anon.key) E2E_SUPABASE_SERVICE_ROLE_KEY=$(cat service.key)
export PW_CHROME_PATH=$TRAVAIL/chrome-linux64/chrome
export E2E_DATABASE_URL=$URL_ADMIN RESERVES_DB_URL=$URL_ADMIN
EOF

cat <<EOF

Pile prête : http://127.0.0.1:54321 (GoTrue $GOTRUE_TAG, PostgREST $POSTGREST_VERSION, storage-api).
Ensuite, depuis $RACINE :
  source $TRAVAIL/reserves.env.sh && npm --prefix apps/reserves run build && npm --prefix apps/reserves run start &
  source $TRAVAIL/e2e.env.sh
  bash scripts/e2e/recette-reserves-v4.sh
  psql "\$RESERVES_DB_URL" -f scripts/e2e/prepare-reserves-v6-securite.sql
  psql "\$RESERVES_DB_URL" -f scripts/e2e/prepare-reserves-v6-charge.sql
  psql "\$RESERVES_DB_URL" -f scripts/e2e/prepare-reserves-qualification-v1.sql
  psql "\$RESERVES_DB_URL" -f scripts/e2e/prepare-local-recipe.sql
  npx playwright test tests/e2e/reserves-*.spec.ts --project=desktop-chromium
EOF
