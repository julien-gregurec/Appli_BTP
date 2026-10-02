#!/usr/bin/env bash
# Train canonique V9 — qualification d'UPGRADE V8 (+ hotfix 813) → V9 avec données réalistes.
# Rapport : docs/qualification/ELSATIA_CANONICAL_TRAIN_V9_CONVERGENCE_V1.md.
#
#   0. base V8 + 813 HISTORISÉE (prérequis) : construite par le harnais V7 → V8 exécuté depuis un
#      worktree de la référence canonique 813 (de50245a), qui charge les données des ères V3 → V7
#      puis applique les 13 migrations V8 + 813 (il s'arrête ensuite sur son contrôle « 12 ») :
#        git worktree add /home/user/wt_v8_813 de50245a259e06623fbab070f9dc296573bae0ce
#        (cd /home/user/wt_v8_813 && bash scripts/qualification/upgrade-v7-v8.sh upg_v8_v9 <fresh>)
#   1. copie de travail de cette base + données de l'ère V8 (upgrade_v8_v9_seed_complement.sql) ;
#   2. instantané → migrations V9 (> 20261002000813) → instantané → comparaison ;
#   3. schéma + ACL de la base upgradée vs fresh V9 (pg_dump -s) ;
#   4. contrôles métier après upgrade (upgrade_v8_v9_business_checks.sql, pgTAP, annulé).
#
# Usage : scripts/qualification/upgrade-v8-v9.sh <base-v8-813-historisée> <base-fresh-v9> [base-travail]
set -uo pipefail
SRC="${1:?base V8+813 historisée}"
FRESH="${2:?base fresh V9}"
DB="${3:-upg_v9_travail}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
BOOT="$REPO/scripts/local-postgres-bootstrap"
DERNIERE_V8_813="20261002000813"
OUT="${UPG_OUT:-$(mktemp -d)}"; mkdir -p "$OUT"; chmod 777 "$OUT"
psql_db() { su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d $1"; }
appliquer() {
  sed -E 's/^create extension if not exists pgsodium;?/-- (stubbed by pg_bootstrap.sql) &/I' "$2" | psql_db "$1" >/dev/null 2>"$OUT/err" \
    || { echo "FAIL migration $(basename "$2") sur $1"; cat "$OUT/err"; exit 1; }
}

echo "== 1. Copie de travail de $SRC et données de l'ère V8 =="
su postgres -c "psql -X -q -c 'drop database if exists \"$DB\";' -c 'create database \"$DB\" template \"$SRC\";'"
psql_db "$DB" < "$BOOT/upgrade_v8_v9_seed_complement.sql" >/dev/null 2>"$OUT/err" || { echo "FAIL complément V8→V9"; cat "$OUT/err"; exit 1; }
echo "  ✓ complément V8→V9 (entreprise créée par la plateforme sans membre, contrat Pro mensuel)"

echo "== 2. Instantané avant =="
UPGRADE_SNAPSHOT_V8=1 python3 "$BOOT/upgrade_snapshot.py" "$DB" "$OUT/avant.json"
su postgres -c "psql -X -q -At -d $DB -c 'select count(*) from auth.users'" | sed 's/^/  utilisateurs : /'

echo "== 3. Migrations V9 (> $DERNIERE_V8_813) =="
m=0
for f in "$REPO"/supabase/migrations/*.sql; do
  v="$(basename "$f" | cut -d_ -f1)"
  [[ "$v" > "$DERNIERE_V8_813" ]] || continue
  appliquer "$DB" "$f"; m=$((m+1)); echo "  ✓ $(basename "$f")"
done
echo "  $m migrations V9 appliquées, 0 erreur"

echo "== 4. Instantané après + comparaison =="
UPGRADE_SNAPSHOT_V8=1 python3 "$BOOT/upgrade_snapshot.py" "$DB" "$OUT/apres.json" --colonnes-de "$OUT/avant.json"
python3 "$BOOT/upgrade_compare.py" "$OUT/avant.json" "$OUT/apres.json" | tee "$OUT/comparaison.txt"

echo "== 5. Schéma upgradé vs fresh V9 ($FRESH) =="
GOTRUE_SQL="$OUT/gotrue.sql"
cat > "$GOTRUE_SQL" <<'SQL'
alter table auth.users
  add column if not exists confirmation_token text, add column if not exists recovery_token text,
  add column if not exists email_change_token_new text, add column if not exists email_change text,
  add column if not exists email_change_token_current text, add column if not exists phone_change text,
  add column if not exists phone_change_token text, add column if not exists reauthentication_token text;
create table if not exists auth.identities (
  id uuid not null, provider_id text not null, user_id uuid not null references auth.users(id) on delete cascade,
  identity_data jsonb not null, provider text not null, created_at timestamptz, updated_at timestamptz,
  primary key (provider_id, provider)
);
SQL
dump() { su postgres -c "pg_dump -s -x --no-owner -d $1" | grep -vE '^(--|SET |SELECT pg_catalog.set_config|\\(un)?restrict )' | sed '/^$/d' > "$2"; }
dumpacl() { su postgres -c "pg_dump -s -d $1" | grep -E '^(GRANT|REVOKE)' | sort > "$2"; }
FRESH_CMP="${FRESH}_cmp_$$"
su postgres -c "psql -X -q -c 'drop database if exists \"$FRESH_CMP\";' -c 'create database \"$FRESH_CMP\" template \"$FRESH\";'"
psql_db "$FRESH_CMP" < "$GOTRUE_SQL" >/dev/null
dump "$DB" "$OUT/schema_upg.sql"; dump "$FRESH_CMP" "$OUT/schema_fresh.sql"
dumpacl "$DB" "$OUT/acl_upg.sql"; dumpacl "$FRESH_CMP" "$OUT/acl_fresh.sql"
su postgres -c "psql -X -q -c 'drop database if exists \"$FRESH_CMP\";'"
if diff -q "$OUT/schema_upg.sql" "$OUT/schema_fresh.sql" >/dev/null && diff -q "$OUT/acl_upg.sql" "$OUT/acl_fresh.sql" >/dev/null; then
  echo "  ✅ schéma et ACL identiques ($(wc -l < "$OUT/schema_upg.sql") lignes, $(wc -l < "$OUT/acl_upg.sql") ACL)"
else
  echo "  ❌ écart de schéma/ACL (diff dans $OUT)"; diff "$OUT/schema_upg.sql" "$OUT/schema_fresh.sql" | head -40; diff "$OUT/acl_upg.sql" "$OUT/acl_fresh.sql" | head -20
fi

echo "== 6. Contrôles métier après upgrade (pgTAP, transaction annulée) =="
su postgres -c "psql -X -q -At -d $DB -f $BOOT/upgrade_v8_v9_business_checks.sql" > "$OUT/metier.tap" 2>&1
ok=$(grep -cE '^ok ' "$OUT/metier.tap"); ko=$(grep -cE '^not ok ' "$OUT/metier.tap"); err=$(grep -cE 'ERROR:' "$OUT/metier.tap")
plan=$(grep -oE '^1\.\.[0-9]+' "$OUT/metier.tap" | cut -c4-)
grep -E '^(not ok|ok)' "$OUT/metier.tap" | sed 's/^/  /'
if [ -n "$plan" ] && [ "$ok" = "$plan" ] && [ "$ko" = 0 ] && [ "$err" = 0 ]; then echo "  ✅ contrôles métier $ok/$plan"; else echo "  ❌ contrôles métier ok=$ok/$plan not_ok=$ko erreurs=$err"; grep -A3 ERROR "$OUT/metier.tap" | head; fi
echo "Journaux : $OUT"
