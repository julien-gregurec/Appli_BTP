#!/usr/bin/env bash
# Relance la pile Supabase locale (déjà construite par pilot_acceptance_v3.sh) sans
# reconstruire la base : Postgres, GoTrue :9999, PostgREST :3001, proxy :54321.
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
service postgresql start >/dev/null 2>&1 || true
until su postgres -c "psql -Xqtc 'select 1'" >/dev/null 2>&1; do sleep 1; done
source /tmp/gotrue-build/gotrue.env.sh
(cd /tmp/gotrue-build && nohup ./gotrue serve > gotrue_serve.log 2>&1 &)
(cd /tmp/postgrest-build && nohup ./postgrest postgrest.conf > postgrest.log 2>&1 &)
(cd "$REPO" && PORT=54321 GOTRUE_URL=http://localhost:9999 POSTGREST_URL=http://localhost:3001 nohup node scripts/local-postgres-bootstrap/local_supabase_proxy.mjs > /tmp/postgrest-build/proxy.log 2>&1 &)
for u in http://localhost:9999/health http://localhost:3001/ http://localhost:54321/auth/v1/health; do
  until curl -s -o /dev/null "$u"; do sleep 1; done; echo "up: $u"
done
