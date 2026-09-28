#!/usr/bin/env bash
# Pile locale RÉELLE pour la qualification de l'export RGPD V1 (deux « projets ») :
#   projet partagé GP : PostgreSQL 16 (base <gp_db>) + PostgREST v12.2.3 + mock Storage + passerelle
#   projet Studio     : PostgreSQL 16 (base <studio_db>) + PostgREST v12.2.3 + mock Storage + passerelle
# Secrets JWT DISTINCTS par projet. Aucun Docker, aucun service distant, aucune clé réelle.
# Rapport : docs/qualification/ELSATIA_RGPD_DATA_EXPORT_PORTABILITY_V1.md (§15, §16).
#
# Usage : rgpd-export-stack.sh start <gp_db> <studio_db> | stop
# Puis  : source /var/tmp/rgpd-export-stack/env.sh && npx vitest run src/lib/rgpd-export/real.test.ts
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
PGRST="${POSTGREST_BIN:-/tmp/postgrest-build/postgrest}"
ETAT=/var/tmp/rgpd-export-stack
fail() { echo "FAIL: $1" >&2; exit 1; }

arreter() {
  pkill -f "postgrest $ETAT/" >/dev/null 2>&1 || true
  for f in "$ETAT"/*.pid; do [ -f "$f" ] && kill "$(cat "$f")" >/dev/null 2>&1; rm -f "$f"; done
  sleep 1
}

if [ "${1:-}" = "stop" ]; then arreter; echo "pile arrêtée"; exit 0; fi
[ "${1:-}" = "start" ] || fail "usage : start <gp_db> <studio_db> | stop"
GP_DB="${2:?gp_db}"; ST_DB="${3:?studio_db}"
[ -x "$PGRST" ] || fail "PostgREST absent ($PGRST) : voir releve_e2e_stack.sh pour le téléchargement v12.2.3"
arreter
mkdir -p "$ETAT"; chmod 777 "$ETAT"
su postgres -c "psql -X -q -c \"alter role authenticator with login password 'root';\"" >/dev/null || fail "authenticator"

demarrer() { # nom db port_rest port_storage port_proxy
  local nom=$1 db=$2 rest=$3 sto=$4 prox=$5 secret
  secret=$(openssl rand -hex 32)
  echo "$secret" > "$ETAT/$nom.secret"
  cat > "$ETAT/$nom.conf" <<CONF
db-uri = "postgres://authenticator:root@localhost:5432/$db"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$secret"
server-port = $rest
db-pool = 10
CONF
  nohup "$PGRST" "$ETAT/$nom.conf" > "$ETAT/$nom.postgrest.log" 2>&1 & echo $! > "$ETAT/$nom.rest.pid"
  rm -rf "$ETAT/$nom-storage"; mkdir -p "$ETAT/$nom-storage"
  (cd "$REPO" && RGPD_STACK_TAG=1 PORT=$sto DB=$db GOTRUE_JWT_SECRET=$secret STORAGE_ROOT="$ETAT/$nom-storage" \
     nohup node scripts/local-postgres-bootstrap/local_storage_mock.mjs > "$ETAT/$nom.storage.log" 2>&1 & echo $! > "$ETAT/$nom.storage.pid")
  (cd "$REPO" && RGPD_STACK_TAG=1 PORT=$prox GOTRUE_URL=http://localhost:1 POSTGREST_URL=http://localhost:$rest STORAGE_URL=http://localhost:$sto \
     nohup node scripts/local-postgres-bootstrap/local_supabase_proxy.mjs > "$ETAT/$nom.proxy.log" 2>&1 & echo $! > "$ETAT/$nom.proxy.pid")
}
demarrer gp "$GP_DB" 3101 5101 54401
demarrer studio "$ST_DB" 3102 5102 54402
sleep 3
curl -sS -o /dev/null http://localhost:3101/ || fail "PostgREST GP"
curl -sS -o /dev/null http://localhost:3102/ || fail "PostgREST Studio"
cat > "$ETAT/env.sh" <<ENV
export RGPD_STACK_GP_URL=http://localhost:54401
export RGPD_STACK_GP_SECRET=$(cat "$ETAT/gp.secret")
export RGPD_STACK_GP_DB=$GP_DB
export RGPD_STACK_GP_STORAGE=$ETAT/gp-storage
export RGPD_STACK_STUDIO_URL=http://localhost:54402
export RGPD_STACK_STUDIO_SECRET=$(cat "$ETAT/studio.secret")
export RGPD_STACK_STUDIO_DB=$ST_DB
export RGPD_STACK_STUDIO_STORAGE=$ETAT/studio-storage
ENV
chmod 644 "$ETAT/env.sh"
echo "pile prête : GP http://localhost:54401 ($GP_DB), Studio http://localhost:54402 ($ST_DB) — source $ETAT/env.sh"
