#!/usr/bin/env bash
# Train canonique V6 — qualification d'UPGRADE V5 → V6 avec données réalistes.
# Rapport : docs/qualification/ELSATIA_CANONICAL_TRAIN_V6_CONVERGENCE_V1.md §10.
# Dérivé de upgrade-v4-v5.sh (train V5), inchangé dans son principe.
#
#   1. base V5 AVEC HISTORIQUE, comme une base réelle : amorce + migrations V3 (340) → jeu V3 (ref V3)
#      + complément V3→V4 (ref V4) → migrations V4 (352) → données de l'ère V4 (décors GP ↔ Réserves,
#      D-01 et complément V4→V5 de la ref V5) → migrations V5 (≤ 20260928000301, 355) ;
#   2. données de l'ère V5 : upgrade_v5_v6_seed_complement.sql (plan 2D figé + corrigé, ouverture,
#      photo sur mur, réabonnement Stripe) ;
#   3. instantané (upgrade_snapshot.py) → migrations V6 (> 20260928000301) → instantané ;
#   4. comparaison (upgrade_compare.py) ; schéma upgradé vs fresh V6 (pg_dump -s, ACL comprises) ;
#   5. contrôles métier après upgrade (upgrade_v5_v6_business_checks.sql, pgTAP, annulé).
#
# Usage : scripts/qualification/upgrade-v5-v6.sh [base-upgrade] [base-fresh-v6] [ref-v4] [ref-v3] [ref-v5]
# Prérequis : PostgreSQL 16 local (peer auth `postgres`), python3, git. Aucun réseau.
set -uo pipefail

DB="${1:-upg_v5_v6}"
FRESH="${2:-v6_fresh}"
REF_V4="${3:-origin/integration/elsatia-canonical-train-v4}"
REF_V3="${4:-origin/integration/elsatia-canonical-train-v3}"
REF_V5="${5:-origin/integration/elsatia-canonical-train-v5}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
BOOT="$REPO/scripts/local-postgres-bootstrap"
DERNIERE_V3="20260926000505"
DERNIERE_V4="20260927100000"
DERNIERE_V5="20260928000301"
OUT="${UPG_OUT:-$(mktemp -d)}"; mkdir -p "$OUT"; chmod 777 "$OUT"

psql_db() { su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d $1"; }
appliquer() {
  sed -E 's/^create extension if not exists pgsodium;?/-- (stubbed by pg_bootstrap.sql) &/I' "$2" | psql_db "$1" >/dev/null 2>"$OUT/err" \
    || { echo "FAIL migration $(basename "$2") sur $1"; cat "$OUT/err"; exit 1; }
}
v4() { git -C "$REPO" show "$REF_V4:$1"; }
v3() { git -C "$REPO" show "$REF_V3:$1"; }
v5() { git -C "$REPO" show "$REF_V5:$1"; }
charger() { # charger <libellé> : SQL sur l'entrée standard (échec fatal, même dans un pipeline)
  if psql_db "$DB" >/dev/null 2>"$OUT/err"; then echo "  ✓ $1"; else echo "FAIL chargement $1"; cat "$OUT/err"; touch "$OUT/ECHEC"; fi
}
arret_si_echec() { [ -e "$OUT/ECHEC" ] && { echo "ARRÊT : chargement en échec"; exit 1; }; true; }

echo "== 1. Base V3 ($DERNIERE_V3), jeu V3, puis migrations V4 ($DERNIERE_V4) =="
su postgres -c "psql -X -q -c 'drop database if exists \"$DB\";' -c 'create database \"$DB\";'"
su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -v dbname=$DB -d $DB -f $BOOT/pg_bootstrap.sql" >/dev/null
n=0
for f in "$REPO"/supabase/migrations/*.sql; do
  v="$(basename "$f" | cut -d_ -f1)"
  [[ "$v" > "$DERNIERE_V3" ]] && continue
  appliquer "$DB" "$f"; n=$((n+1))
done
echo "  $n migrations V3 appliquées"
[ "$n" = 340 ] || { echo "attendu 340 migrations V3"; exit 1; }

rm -f "$OUT/ECHEC"
# Colonnes et table que GoTrue hébergé pose lui-même (miroir de tests/e2e/reserves-pile-locale/preparer-base.sh) ;
# appliquées aussi à la copie du fresh comparée en §6.
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
echo "== 1b. Jeu V3 (fichiers de $REF_V3 ; complément V3→V4 de $REF_V4) =="
charger "colonnes GoTrue" < "$GOTRUE_SQL"
{ echo "begin;"; v3 supabase/tests/fixtures/isolation_multitenant.inc; echo "commit;"; } | charger "isolation_multitenant"
{ echo "begin;"; v3 supabase/tests/fixtures/rgpd_tenant_facture_emise.inc; echo "commit;"; } | charger "rgpd_tenant_facture_emise"
{ echo "begin;"; v3 supabase/tests/fixtures/rgpd_tenant_contrats_acceptes.inc; echo "commit;"; } | charger "rgpd_tenant_contrats_acceptes"
for s in prepare-local-recipe prepare-reserves-v3-recipe prepare-local-recipe reset-reserves-recipe prepare-reserves-v4-listes prepare-reserves-v6-securite; do
  v3 "scripts/e2e/$s.sql" | charger "Réserves $s"
done
v3 supabase/production/seed_entreprise_pilote_btp.sql | charger "seed pilote GP (V3)"
v3 tests/e2e/fixtures/colors-pilote.sql | sed "s/'RECB0001'/'RECC0001'/g" | charger "Colors pilote (RECB0001 → RECC0001)"
v3 scripts/local-postgres-bootstrap/upgrade_v1_v2_seed_complement.sql | charger "complément V1→V2 (Boutique, entitlements)"
v3 scripts/local-postgres-bootstrap/upgrade_v2_v3_seed_complement.sql | charger "complément V2→V3 (Tools, tâches)"
v4 scripts/local-postgres-bootstrap/upgrade_v3_v4_seed_complement.sql | charger "complément V3→V4 (Stripe, commandes engagées, Storage)"
arret_si_echec
m4=0
for f in "$REPO"/supabase/migrations/*.sql; do
  v="$(basename "$f" | cut -d_ -f1)"
  { [[ "$v" > "$DERNIERE_V3" ]] && ! [[ "$v" > "$DERNIERE_V4" ]]; } || continue
  appliquer "$DB" "$f"; m4=$((m4+1))
done
echo "  $m4 migrations V4 appliquées sur les données V3 (total $((n+m4)))"
[ $((n+m4)) = 352 ] || { echo "attendu 352 migrations au train V4"; exit 1; }

echo "== 2. Données de l'ère V4 =="
{ echo "begin;"; v4 scripts/e2e/prepare-gp-reserves-integration.sql; echo "commit;"; } | charger "décor GP ↔ Réserves (V4)"
v5 scripts/e2e/prepare-reserves-suspension-hote.sql | charger "décor D-01 hôte H / intervenant S (V5)"
v5 scripts/local-postgres-bootstrap/upgrade_v4_v5_seed_complement.sql | charger "complément V4→V5 (Relevé, hôte suspendu, factures Stripe)"
arret_si_echec
m5=0
for f in "$REPO"/supabase/migrations/*.sql; do
  v="$(basename "$f" | cut -d_ -f1)"
  { [[ "$v" > "$DERNIERE_V4" ]] && ! [[ "$v" > "$DERNIERE_V5" ]]; } || continue
  appliquer "$DB" "$f"; m5=$((m5+1))
done
echo "  $m5 migrations V5 appliquées (total $((n+m4+m5)))"
[ $((n+m4+m5)) = 355 ] || { echo "attendu 355 migrations au train V5"; exit 1; }

echo "== 2b. Données de l'ère V5 =="
charger "complément V5→V6 (plan 2D figé + corrigé, ouverture, photo sur mur, réabonnement)" < "$BOOT/upgrade_v5_v6_seed_complement.sql"
arret_si_echec

echo "== 3. Instantané avant =="
python3 "$BOOT/upgrade_snapshot.py" "$DB" "$OUT/avant.json"
su postgres -c "psql -X -q -At -d $DB -c 'select count(*) from auth.users'" | sed 's/^/  utilisateurs : /'

echo "== 4. Migrations V6 =="
m=0
for f in "$REPO"/supabase/migrations/*.sql; do
  v="$(basename "$f" | cut -d_ -f1)"
  [[ "$v" > "$DERNIERE_V5" ]] || continue
  appliquer "$DB" "$f"; m=$((m+1)); echo "  ✓ $(basename "$f")"
done
echo "  $m migrations V6 appliquées, 0 erreur"
[ "$m" = 3 ] || { echo "attendu 3 migrations V6"; exit 1; }

echo "== 5. Instantané après + comparaison =="
python3 "$BOOT/upgrade_snapshot.py" "$DB" "$OUT/apres.json" --colonnes-de "$OUT/avant.json"
python3 "$BOOT/upgrade_compare.py" "$OUT/avant.json" "$OUT/apres.json" | tee "$OUT/comparaison.txt"

echo "== 6. Schéma upgradé vs fresh V6 ($FRESH) =="
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
  echo "  ❌ écart de schéma/ACL (diff dans $OUT)"; diff "$OUT/schema_upg.sql" "$OUT/schema_fresh.sql" | head -40
fi
echo "== 7. Contrôles métier après upgrade (pgTAP, transaction annulée) =="
su postgres -c "psql -X -q -At -d $DB -f $BOOT/upgrade_v5_v6_business_checks.sql" > "$OUT/metier.tap" 2>&1
ok=$(grep -cE '^ok ' "$OUT/metier.tap"); ko=$(grep -cE '^not ok ' "$OUT/metier.tap"); err=$(grep -cE 'ERROR:' "$OUT/metier.tap")
plan=$(grep -oE '^1\.\.[0-9]+' "$OUT/metier.tap" | cut -c4-)
grep -E '^(not ok|ok)' "$OUT/metier.tap" | sed 's/^/  /'
if [ -n "$plan" ] && [ "$ok" = "$plan" ] && [ "$ko" = 0 ] && [ "$err" = 0 ]; then echo "  ✅ contrôles métier $ok/$plan"; else echo "  ❌ contrôles métier ok=$ok/$plan not_ok=$ko erreurs=$err"; grep ERROR "$OUT/metier.tap" | head; fi
echo "Journaux : $OUT"
