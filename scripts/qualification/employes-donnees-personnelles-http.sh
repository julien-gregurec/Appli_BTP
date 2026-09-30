#!/usr/bin/env bash
# ELSATIA-EMPLOYEE-PERSONAL-DATA-ACCESS-HARDENING-V1 — preuve HTTP (vrai PostgREST v12).
#
# Construit deux bases à partir d'une base de référence déjà rejouée par
# scripts/local-postgres-bootstrap/rebuild_db.sh :
#   <ref>_edp_v6      : la base de référence SANS la migration 20260928000806 (état antérieur au lot E)
#   <ref>_edp_corrige : la même + 20260928000806
# y charge le décor supabase/tests/fixtures/employes_donnees_personnelles.inc (committé, pas
# de rollback), lance un PostgREST réel sur chacune et rejoue
# employes-donnees-personnelles-http.mjs (attendu « v6 » puis « corrige »).
#
# Usage : employes-donnees-personnelles-http.sh <base-de-reference-sans-701> <chemin-binaire-postgrest>
set -uo pipefail
REF="${1:?usage: $0 <base-v6> <postgrest>}"
PGRST="${2:?usage: $0 <base-v6> <postgrest>}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
TMP="$(mktemp -d)"
SECRET="edp-http-$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')-secret-32-octets-min"
statut=0

psql_db() { su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d $1" ; }

for variante in v6 corrige; do
  DB="${REF}_edp_${variante}"
  su postgres -c "psql -X -q -c 'drop database if exists \"$DB\"'" >/dev/null
  su postgres -c "psql -X -q -c 'create database \"$DB\" template \"$REF\"'" || exit 1
  su postgres -c "psql -X -q -c 'alter database \"$DB\" set search_path = public, extensions'" >/dev/null
  if [ "$variante" = corrige ]; then
    psql_db "$DB" < "$REPO/supabase/migrations/20260928000806_employes_donnees_personnelles_acces_v1.sql" 2>&1 | grep -v NOTICE
  fi
  { echo "begin;"; cat "$REPO/supabase/tests/fixtures/employes_donnees_personnelles.inc"; echo "commit;"; } | psql_db "$DB" >/dev/null || exit 1
  su postgres -c "psql -X -q -d \"$DB\" -c \"alter role authenticator with password 'root';\"" >/dev/null
  PORT=$([ "$variante" = v6 ] && echo 3811 || echo 3812)
  cat > "$TMP/$variante.conf" <<EOF
db-uri = "postgres://authenticator:root@localhost:5432/$DB"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$SECRET"
server-port = $PORT
db-pool = 4
EOF
  "$PGRST" "$TMP/$variante.conf" > "$TMP/$variante.log" 2>&1 &
  PID=$!
  # Attendre le cache de schéma (503 PGRST002 tant qu'il n'est pas chargé).
  for _ in $(seq 1 150); do
    code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/entreprises?select=id&limit=0")
    [ "$code" != "000" ] && [ "$code" != "503" ] && break
    sleep 0.2
  done
  [ "$code" = "503" ] && { echo "PostgREST non prêt :"; tail -5 "$TMP/$variante.log"; }
  echo "== PostgREST $("$PGRST" --version) sur $DB (attendu : $variante) =="
  node "$HERE/employes-donnees-personnelles-http.mjs" "http://localhost:$PORT" "$SECRET" "$variante" || statut=1
  kill "$PID" 2>/dev/null; wait "$PID" 2>/dev/null
  echo
done
rm -rf "$TMP"
exit $statut
