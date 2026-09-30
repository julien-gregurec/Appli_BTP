#!/usr/bin/env bash
# Train canonique V8 — qualification d'UPGRADE V7 → V8 avec données réalistes.
# Rapport : docs/qualification/ELSATIA_CANONICAL_TRAIN_V8_CONVERGENCE_V1.md §7.
# Dérivé de upgrade-v6-v7.sh (train V7), inchangé dans son principe.
#
#   1. base V7 AVEC HISTORIQUE, comme une base réelle : amorce + migrations V3 (340) → jeu V3 (ref V3)
#      + complément V3→V4 (ref V4) → migrations V4 (352) → données de l'ère V4 → migrations V5 (355)
#      → données de l'ère V5 (complément V5→V6 de la ref V6) → migrations V6 (358) → données de l'ère
#      V6 (complément V6→V7 de la ref V7) → migration V7 (≤ 20260928000701, 359) ;
#   2. données de l'ère V7 : upgrade_v7_v8_seed_complement.sql (cycle commercial : contrats au prix
#      69 €, annulé, essai expiré, impayé ; droits Colors / Réserves / Tools d'entreprises GP fermées ;
#      données personnelles des salariés ; plan Lot 7 avec objets ; Réserves) ;
#   3. instantané (upgrade_snapshot.py, UPGRADE_SNAPSHOT_V8=1) → migrations V8 (> 20260928000701)
#      → instantané ;
#   4. comparaison (upgrade_compare.py) + classement de chaque écart par règle V8
#      (upgrade_v7_v8_classify.py) ; schéma upgradé vs fresh V8 (pg_dump -s, ACL comprises) ;
#   5. contrôles métier après upgrade (upgrade_v7_v8_business_checks.sql, pgTAP, annulé).
#
# Usage : scripts/qualification/upgrade-v7-v8.sh [base-upgrade] [base-fresh-v8] [ref-v4] [ref-v3] [ref-v5] [ref-v6] [ref-v7]
# Prérequis : PostgreSQL 16 local (peer auth `postgres`), python3, git. Aucun réseau.
set -uo pipefail

DB="${1:-upg_v7_v8}"
FRESH="${2:-v8_fresh}"
REF_V4="${3:-origin/integration/elsatia-canonical-train-v4}"
REF_V3="${4:-origin/integration/elsatia-canonical-train-v3}"
REF_V5="${5:-origin/integration/elsatia-canonical-train-v5}"
REF_V6="${6:-origin/integration/elsatia-canonical-train-v6}"
REF_V7="${7:-origin/integration/elsatia-canonical-train-v7}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
BOOT="$REPO/scripts/local-postgres-bootstrap"
DERNIERE_V3="20260926000505"
DERNIERE_V4="20260927100000"
DERNIERE_V5="20260928000301"
DERNIERE_V6="20260928000601"
DERNIERE_V7="20260928000701"
OUT="${UPG_OUT:-$(mktemp -d)}"; mkdir -p "$OUT"; chmod 777 "$OUT"

psql_db() { su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d $1"; }
appliquer() {
  sed -E 's/^create extension if not exists pgsodium;?/-- (stubbed by pg_bootstrap.sql) &/I' "$2" | psql_db "$1" >/dev/null 2>"$OUT/err" \
    || { echo "FAIL migration $(basename "$2") sur $1"; cat "$OUT/err"; exit 1; }
}
v4() { git -C "$REPO" show "$REF_V4:$1" || { echo "FAIL lecture $REF_V4:$1" >&2; touch "$OUT/ECHEC"; }; }
v3() { git -C "$REPO" show "$REF_V3:$1" || { echo "FAIL lecture $REF_V3:$1" >&2; touch "$OUT/ECHEC"; }; }
v5() { git -C "$REPO" show "$REF_V5:$1" || { echo "FAIL lecture $REF_V5:$1" >&2; touch "$OUT/ECHEC"; }; }
v6() { git -C "$REPO" show "$REF_V6:$1" || { echo "FAIL lecture $REF_V6:$1" >&2; touch "$OUT/ECHEC"; }; }
v7() { git -C "$REPO" show "$REF_V7:$1" || { echo "FAIL lecture $REF_V7:$1" >&2; touch "$OUT/ECHEC"; }; }
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

echo "== 2b. Données de l'ère V5 (complément V5→V6 de $REF_V6) =="
v6 scripts/local-postgres-bootstrap/upgrade_v5_v6_seed_complement.sql | charger "complément V5→V6 (plan 2D figé + corrigé, ouverture, photo sur mur, réabonnement)"
arret_si_echec
m6=0
for f in "$REPO"/supabase/migrations/*.sql; do
  v="$(basename "$f" | cut -d_ -f1)"
  { [[ "$v" > "$DERNIERE_V5" ]] && ! [[ "$v" > "$DERNIERE_V6" ]]; } || continue
  appliquer "$DB" "$f"; m6=$((m6+1))
done
echo "  $m6 migrations V6 appliquées (total $((n+m4+m5+m6)))"
[ $((n+m4+m5+m6)) = 358 ] || { echo "attendu 358 migrations au train V6"; exit 1; }

echo "== 2c. Données de l'ère V6 (complément V6→V7 de $REF_V7) =="
v7 scripts/local-postgres-bootstrap/upgrade_v6_v7_seed_complement.sql | charger "complément V6→V7 (plan corrigé Lot 6 figé, surface synchronisée, plan as built, équipement Lot 2)"
arret_si_echec
m7=0
for f in "$REPO"/supabase/migrations/*.sql; do
  v="$(basename "$f" | cut -d_ -f1)"
  { [[ "$v" > "$DERNIERE_V6" ]] && ! [[ "$v" > "$DERNIERE_V7" ]]; } || continue
  appliquer "$DB" "$f"; m7=$((m7+1))
done
echo "  $m7 migration(s) V7 appliquée(s) (total $((n+m4+m5+m6+m7)))"
[ $((n+m4+m5+m6+m7)) = 359 ] || { echo "attendu 359 migrations au train V7"; exit 1; }
# UPG_ARRET_APRES_V7=1 : s'arrêter sur la base V7 historisée, avant le complément de l'ère V7 (inspection).
[ "${UPG_ARRET_APRES_V7:-}" = 1 ] && { echo "Arrêt demandé : base V7 prête ($DB)"; exit 0; }

echo "== 2d. Données de l'ère V7 =="
charger "complément V7→V8 (cycle commercial, droits par application, salariés, plan Lot 7, Réserves)" < "$BOOT/upgrade_v7_v8_seed_complement.sql"
arret_si_echec

echo "== 3. Instantané avant =="
UPGRADE_SNAPSHOT_V8=1 python3 "$BOOT/upgrade_snapshot.py" "$DB" "$OUT/avant.json"
su postgres -c "psql -X -q -At -d $DB -c 'select count(*) from auth.users'" | sed 's/^/  utilisateurs : /'

echo "== 4. Migrations V8 =="
m=0
for f in "$REPO"/supabase/migrations/*.sql; do
  v="$(basename "$f" | cut -d_ -f1)"
  [[ "$v" > "$DERNIERE_V7" ]] || continue
  appliquer "$DB" "$f"; m=$((m+1)); echo "  ✓ $(basename "$f")"
done
echo "  $m migrations V8 appliquées, 0 erreur"
[ "$m" = 12 ] || { echo "attendu 12 migrations V8"; exit 1; }

echo "== 5. Instantané après + comparaison =="
UPGRADE_SNAPSHOT_V8=1 python3 "$BOOT/upgrade_snapshot.py" "$DB" "$OUT/apres.json" --colonnes-de "$OUT/avant.json"
python3 "$BOOT/upgrade_compare.py" "$OUT/avant.json" "$OUT/apres.json" | tee "$OUT/comparaison.txt"
echo "== 5b. Classement des écarts (règles V8, aucune perte silencieuse) =="
python3 "$BOOT/upgrade_v7_v8_classify.py" "$DB" "$OUT/avant.json" "$OUT/apres.json" | tee "$OUT/classement.txt"

echo "== 6. Schéma upgradé vs fresh V8 ($FRESH) =="
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
su postgres -c "psql -X -q -At -d $DB -f $BOOT/upgrade_v7_v8_business_checks.sql" > "$OUT/metier.tap" 2>&1
ok=$(grep -cE '^ok ' "$OUT/metier.tap"); ko=$(grep -cE '^not ok ' "$OUT/metier.tap"); err=$(grep -cE 'ERROR:' "$OUT/metier.tap")
plan=$(grep -oE '^1\.\.[0-9]+' "$OUT/metier.tap" | cut -c4-)
grep -E '^(not ok|ok)' "$OUT/metier.tap" | sed 's/^/  /'
if [ -n "$plan" ] && [ "$ok" = "$plan" ] && [ "$ko" = 0 ] && [ "$err" = 0 ]; then echo "  ✅ contrôles métier $ok/$plan"; else echo "  ❌ contrôles métier ok=$ok/$plan not_ok=$ko erreurs=$err"; grep ERROR "$OUT/metier.tap" | head; fi
echo "Journaux : $OUT"
