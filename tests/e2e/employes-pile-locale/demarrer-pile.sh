#!/usr/bin/env bash
# Démarre la pile de la recette « données personnelles des salariés » (V1) sur une base
# préparée par preparer-base.sh : vrai PostgREST (:3001), passerelle auth/Storage (:54322),
# routeur (:54321). Gestion Pro (`next start -p 3100`) est lancé à part.
#
# Variables : PASSERELLE_SECRET_JWT, PASSERELLE_MDP_DB, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
#             SUPABASE_SERVICE_ROLE_KEY (JWT HS256 signés avec PASSERELLE_SECRET_JWT),
#             POSTGREST_BIN (binaire officiel PostgREST v12, release GitHub).
# Usage : demarrer-pile.sh <base> <dossier-journaux>
set -euo pipefail
BASE="${1:?base}"
JOURNAUX="${2:?dossier journaux}"
: "${PASSERELLE_SECRET_JWT:?}" "${PASSERELLE_MDP_DB:?}" "${POSTGREST_BIN:?}"
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPOT="$(cd "$ICI/../../.." && pwd)"
mkdir -p "$JOURNAUX"

cat > "$JOURNAUX/postgrest.conf" <<EOF
db-uri = "postgres://authenticator:$PASSERELLE_MDP_DB@127.0.0.1:5432/$BASE"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$PASSERELLE_SECRET_JWT"
server-host = "127.0.0.1"
server-port = 3001
db-pool = 10
EOF
nohup "$POSTGREST_BIN" "$JOURNAUX/postgrest.conf" > "$JOURNAUX/postgrest.log" 2>&1 &
echo $! > "$JOURNAUX/postgrest.pid"

PASSERELLE_PORT=54322 \
PASSERELLE_DATABASE_URL="postgres://authenticator:$PASSERELLE_MDP_DB@127.0.0.1:5432/$BASE" \
PASSERELLE_ADMIN_DATABASE_URL="postgres://supabase_admin:$PASSERELLE_MDP_DB@127.0.0.1:5432/$BASE" \
PASSERELLE_STOCKAGE="$JOURNAUX/stockage" \
  nohup node "$DEPOT/tests/e2e/colors-pile-locale/passerelle.mjs" > "$JOURNAUX/passerelle.log" 2>&1 &
echo $! > "$JOURNAUX/passerelle.pid"

ROUTEUR_PORT=54321 POSTGREST_URL=http://127.0.0.1:3001 PASSERELLE_URL=http://127.0.0.1:54322 \
  nohup node "$ICI/routeur.mjs" > "$JOURNAUX/routeur.log" 2>&1 &
echo $! > "$JOURNAUX/routeur.pid"

for _ in $(seq 1 150); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:54321/rest/v1/entreprises?select=id&limit=0" -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") || true
  # anon n'a aucun droit sur entreprises : 401 = PostgREST prêt (cache de schéma chargé).
  case "$code" in 000|502|503) sleep 0.2 ;; *) break ;; esac
done
case "$code" in 000|502|503) echo "pile non prête ($code)"; tail -n 5 "$JOURNAUX"/*.log; exit 1 ;; esac
echo "pile prête sur $BASE : routeur :54321 → PostgREST :3001 / passerelle :54322"
