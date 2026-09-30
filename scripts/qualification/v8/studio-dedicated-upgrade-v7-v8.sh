#!/usr/bin/env bash
# Train canonique V8 — upgrade de la chaîne Studio DÉDIÉE V7 (21 migrations) → V8 (23).
# Rapport : docs/qualification/ELSATIA_CANONICAL_TRAIN_V8_CONVERGENCE_V1.md §13.
# 1. base vierge + chaîne dédiée de la ref V7 (lue par git) ; 2. + migrations dédiées V8 du dépôt
# (> 20260929160000) ; 3. pg_dump -s (ACL comprises) comparé à une chaîne V8 neuve. Aucun réseau.
# Usage : scripts/qualification/v8/studio-dedicated-upgrade-v7-v8.sh [ref-v7]
set -uo pipefail
REF_V7="${1:-origin/integration/elsatia-canonical-train-v7}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DERNIERE_V7="20260929160000"
pg() { su postgres -c "psql -X -q -v ON_ERROR_STOP=1 $*"; }
prepare() { # base
  pg "-c 'drop database if exists \"$1\";' -c 'create database \"$1\";'" >/dev/null 2>&1
  su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -v dbname=$1 -d $1" < "$REPO/scripts/local-postgres-bootstrap/pg_bootstrap.sql" >/dev/null 2>&1 || { echo "bootstrap KO"; exit 1; }
  pg "-d $1 -c 'create table if not exists auth.sessions (id uuid primary key, user_id uuid);'" >/dev/null
}
UPG=studio_upg_v7_v8; NEUF=studio_neuf_v8
prepare "$UPG"; prepare "$NEUF"
n=0
for f in $(git -C "$REPO" ls-tree --name-only "$REF_V7" apps/studio/supabase/migrations/ | sort); do
  git -C "$REPO" show "$REF_V7:$f" | su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d $UPG" >/dev/null 2>&1 || { echo "ÉCHEC V7 $f"; exit 1; }
  n=$((n+1))
done
echo "chaîne dédiée V7 : $n migrations"
m=0
for f in "$REPO"/apps/studio/supabase/migrations/*.sql; do
  v="$(basename "$f" | cut -d_ -f1)"; [[ "$v" > "$DERNIERE_V7" ]] || continue
  su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d $UPG" < "$f" >/dev/null 2>&1 || { echo "ÉCHEC V8 $(basename "$f")"; exit 1; }
  m=$((m+1)); echo "  ✓ $(basename "$f")"
done
k=0
for f in "$REPO"/apps/studio/supabase/migrations/*.sql; do
  su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d $NEUF" < "$f" >/dev/null 2>&1 || { echo "ÉCHEC neuf $(basename "$f")"; exit 1; }
  k=$((k+1))
done
echo "upgrade : +$m migrations V8 (total $((n+m))) ; chaîne neuve : $k"
dump() { su postgres -c "pg_dump -s --no-owner -d $1" | grep -vE '^(--|SET |SELECT pg_catalog.set_config|\\(un)?restrict )' | sed '/^$/d'; }
if diff <(dump "$UPG") <(dump "$NEUF") >/dev/null; then
  echo "✅ schéma + ACL de la chaîne upgradée identiques à la chaîne V8 neuve ($(dump "$NEUF" | wc -l) lignes)"
else
  echo "❌ écart de schéma"; diff <(dump "$UPG") <(dump "$NEUF") | head -30; exit 1
fi
pg "-c 'drop database if exists $UPG;' -c 'drop database if exists $NEUF;'" >/dev/null 2>&1
