#!/usr/bin/env bash
# Train canonique V9 — qualification d'UPGRADE V8 → V9 avec données réalistes.
# Rapport : docs/qualification/ELSATIA_CANONICAL_TRAIN_V9_CONVERGENCE_V1.md §6.
# Dérivé de upgrade-v7-v8.sh (train V8), inchangé dans son principe.
#
#   1. base V7 AVEC HISTORIQUE (V3 → V7, données de chaque ère) : upgrade-v7-v8.sh, arrêt après V7 ;
#   2. données de l'ère V7 (upgrade_v7_v8_seed_complement.sql) → migrations V8 (12, total 371) ;
#   3. passe « volumetrique » seulement — données de l'ère V8 : jeux volumétriques des lots
#      (finance-aggregates/seed.sql, gp-residual/seed.sql : 500 → 20 000 lignes par chemin) +
#      upgrade_v8_v9_seed_complement.sql (factures brouillon, IBAN v1, compteurs de connexion historiques) ;
#   4. instantané (UPGRADE_SNAPSHOT_V8=1 UPGRADE_SNAPSHOT_V9=1) → migrations V9 (> 20260928000812) → instantané ;
#   5. comparaison (upgrade_compare.py) + classement de chaque écart par règle V9
#      (upgrade_v8_v9_classify.py) ; schéma upgradé vs fresh V9 (pg_dump -s, ACL comprises) ;
#   6. contrôles métier après upgrade : passe « historique » = les 47 contrôles V8
#      (upgrade_v7_v8_business_checks.sql) REJOUÉS sur la base V9 (garanties V8 conservées) ;
#      passe « volumetrique » = upgrade_v8_v9_business_checks.sql (30 contrôles V9).
#
# Deux passes (UPG_PASSE) :
#   historique   (défaut) jeu V3 → V8 (52 utilisateurs) : sonde RLS réelle complète (utilisateur × table) ;
#   volumetrique  + jeux > 1 000 lignes : sans sonde (sous `authenticated` les policies sont évaluées ligne
#                 à ligne sur 20 000+ lignes, plusieurs minutes par cellule) ; comptages, empreintes,
#                 policies, droits, EXECUTE et contrôles métier V9.
#
# Usage : UPG_PASSE=historique|volumetrique scripts/qualification/upgrade-v8-v9.sh [base-upgrade] [base-fresh-v9]
# Prérequis : PostgreSQL 16 local (peer auth `postgres`), python3, git, refs origin/integration/elsatia-canonical-train-v3…v7.
set -uo pipefail

DB="${1:-upg_v8_v9}"
FRESH="${2:-v9_fresh}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
BOOT="$REPO/scripts/local-postgres-bootstrap"
DERNIERE_V7="20260928000701"
DERNIERE_V8="20260928000812"
OUT="${UPG_OUT:-$(mktemp -d)}"; mkdir -p "$OUT"; chmod 777 "$OUT"

psql_db() { su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d $1"; }
appliquer() {
  sed -E 's/^create extension if not exists pgsodium;?/-- (stubbed by pg_bootstrap.sql) &/I' "$2" | psql_db "$1" >/dev/null 2>"$OUT/err" \
    || { echo "FAIL migration $(basename "$2") sur $1"; cat "$OUT/err"; exit 1; }
}
charger() {
  if psql_db "$DB" >/dev/null 2>"$OUT/err"; then echo "  ✓ $1"; else echo "FAIL chargement $1"; cat "$OUT/err"; exit 1; fi
}

echo "== 1. Base V7 historisée (upgrade-v7-v8.sh, arrêt après V7) =="
UPG_ARRET_APRES_V7=1 UPG_OUT="$OUT/v7" "$REPO/scripts/qualification/upgrade-v7-v8.sh" "$DB" > "$OUT/base-v7.log" 2>&1 \
  || { echo "FAIL base V7"; tail -20 "$OUT/base-v7.log"; exit 1; }
grep -E "migrations|Arrêt" "$OUT/base-v7.log" | sed 's/^/  /'

echo "== 2. Données de l'ère V7, puis migrations V8 =="
charger "complément V7→V8" < "$BOOT/upgrade_v7_v8_seed_complement.sql"
m8=0
for f in "$REPO"/supabase/migrations/*.sql; do
  v="$(basename "$f" | cut -d_ -f1)"
  { [[ "$v" > "$DERNIERE_V7" ]] && ! [[ "$v" > "$DERNIERE_V8" ]]; } || continue
  appliquer "$DB" "$f"; m8=$((m8+1))
done
total=$(su postgres -c "psql -X -At -d $DB -c 'select 1'" >/dev/null; ls "$REPO"/supabase/migrations/*.sql | awk -F/ '{print $NF}' | cut -d_ -f1 | awk -v d="$DERNIERE_V8" '$0 <= d' | wc -l)
echo "  $m8 migrations V8 appliquées (train V8 : $total)"
[ "$m8" = 12 ] && [ "$total" = 371 ] || { echo "attendu 12 migrations V8, 371 au total"; exit 1; }

PASSE="${UPG_PASSE:-historique}"
case "$PASSE" in historique|volumetrique) ;; *) echo "UPG_PASSE inconnue : $PASSE"; exit 1 ;; esac
echo "== 3. Données de l'ère V8 (passe $PASSE) =="
if [ "$PASSE" = volumetrique ]; then
export UPGRADE_SNAPSHOT_SANS_SONDE=1
charger "jeu volumétrique Finance (F500 → F20000 + témoin)" < "$REPO/scripts/qualification/finance-aggregates/seed.sql"
charger "jeu volumétrique GP résiduel (R500 → R20000 + témoin)" < "$REPO/scripts/qualification/gp-residual/seed.sql"
charger "complément V8→V9 (factures brouillon, IBAN v1, rate limit historique)" < "$BOOT/upgrade_v8_v9_seed_complement.sql"
fi
su postgres -c "psql -X -q -d $DB -c 'analyze'" >/dev/null
export UPGRADE_SNAPSHOT_JOBS="${UPGRADE_SNAPSHOT_JOBS:-4}"

echo "== 4. Instantané avant =="
UPGRADE_SNAPSHOT_V8=1 UPGRADE_SNAPSHOT_V9=1 python3 "$BOOT/upgrade_snapshot.py" "$DB" "$OUT/avant.json"
su postgres -c "psql -X -q -At -d $DB -c 'select count(*) from auth.users'" | sed 's/^/  utilisateurs : /'

echo "== 5. Migrations V9 =="
m=0
for f in "$REPO"/supabase/migrations/*.sql; do
  v="$(basename "$f" | cut -d_ -f1)"
  [[ "$v" > "$DERNIERE_V8" ]] || continue
  appliquer "$DB" "$f"; m=$((m+1)); echo "  ✓ $(basename "$f")"
done
echo "  $m migrations V9 appliquées, 0 erreur"
[ "$m" = 13 ] || { echo "attendu 13 migrations V9"; exit 1; }

echo "== 6. Instantané après + comparaison =="
UPGRADE_SNAPSHOT_V8=1 UPGRADE_SNAPSHOT_V9=1 python3 "$BOOT/upgrade_snapshot.py" "$DB" "$OUT/apres.json" --colonnes-de "$OUT/avant.json"
python3 "$BOOT/upgrade_compare.py" "$OUT/avant.json" "$OUT/apres.json" | tee "$OUT/comparaison.txt"
echo "== 6b. Classement des écarts (règles V9, aucune perte silencieuse, aucun droit modifié en silence) =="
python3 "$BOOT/upgrade_v8_v9_classify.py" "$DB" "$OUT/avant.json" "$OUT/apres.json" | tee "$OUT/classement.txt"
classement=${PIPESTATUS[0]}

echo "== 7. Schéma upgradé vs fresh V9 ($FRESH) =="
GOTRUE_SQL="$OUT/v7/gotrue.sql"
dump() { su postgres -c "pg_dump -s -x --no-owner -d $1" | grep -vE '^(--|SET |SELECT pg_catalog.set_config|\\(un)?restrict )' | sed '/^$/d' > "$2"; }
dumpacl() { su postgres -c "pg_dump -s -d $1" | grep -E '^(GRANT|REVOKE)' | sort > "$2"; }
FRESH_CMP="${FRESH}_cmp_$$"
su postgres -c "psql -X -q -c 'drop database if exists \"$FRESH_CMP\";' -c 'create database \"$FRESH_CMP\" template \"$FRESH\";'"
psql_db "$FRESH_CMP" < "$GOTRUE_SQL" >/dev/null
dump "$DB" "$OUT/schema_upg.sql"; dump "$FRESH_CMP" "$OUT/schema_fresh.sql"
dumpacl "$DB" "$OUT/acl_upg.sql"; dumpacl "$FRESH_CMP" "$OUT/acl_fresh.sql"
su postgres -c "psql -X -q -c 'drop database if exists \"$FRESH_CMP\";'"
schema=0
if diff -q "$OUT/schema_upg.sql" "$OUT/schema_fresh.sql" >/dev/null && diff -q "$OUT/acl_upg.sql" "$OUT/acl_fresh.sql" >/dev/null; then
  echo "  ✅ schéma et ACL identiques ($(wc -l < "$OUT/schema_upg.sql") lignes, $(wc -l < "$OUT/acl_upg.sql") ACL)"
else
  schema=1; echo "  ❌ écart de schéma/ACL (diff dans $OUT)"; diff "$OUT/schema_upg.sql" "$OUT/schema_fresh.sql" | head -40
fi

echo "== 8. Ledger =="
su postgres -c "psql -X -q -At -d $DB -c \"select count(*) from information_schema.tables where table_schema='supabase_migrations'\"" | sed 's/^/  tables de ledger Supabase dans la base locale : /'

echo "== 9. Contrôles métier après upgrade (pgTAP, transaction annulée) =="
CONTROLES="$BOOT/upgrade_v8_v9_business_checks.sql"
[ "$PASSE" = historique ] && CONTROLES="$BOOT/upgrade_v7_v8_business_checks.sql"
echo "  $(basename "$CONTROLES")"
su postgres -c "psql -X -q -At -d $DB -f $CONTROLES" > "$OUT/metier.tap" 2>&1
ok=$(grep -cE '^ok ' "$OUT/metier.tap"); ko=$(grep -cE '^not ok ' "$OUT/metier.tap"); err=$(grep -cE 'ERROR:' "$OUT/metier.tap")
plan=$(grep -oE '^1\.\.[0-9]+' "$OUT/metier.tap" | cut -c4-)
grep -E '^(not ok|ok)' "$OUT/metier.tap" | sed 's/^/  /'
metier=0
if [ -n "$plan" ] && [ "$ok" = "$plan" ] && [ "$ko" = 0 ] && [ "$err" = 0 ]; then echo "  ✅ contrôles métier $ok/$plan"; else metier=1; echo "  ❌ contrôles métier ok=$ok/$plan not_ok=$ko erreurs=$err"; grep -E "ERROR|#" "$OUT/metier.tap" | head -20; fi
echo "Journaux : $OUT"
[ "$classement" = 0 ] && [ "$schema" = 0 ] && [ "$metier" = 0 ]
