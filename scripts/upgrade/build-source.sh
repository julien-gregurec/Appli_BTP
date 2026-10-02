#!/usr/bin/env bash
# ELSATIA — harnais d'upgrade Production → V9.x — reconstruction LOCALE d'une « Production historique ».
#
# Base PostgreSQL jetable représentant la Production à son point historique rapporté :
#   1. migrations EXACTES du commit source (défaut 5777abb = baseline Production 210, dernière 20260824000231),
#      appliquées une à une avec écriture du ledger Supabase (supabase_migrations.schema_migrations),
#      exactement comme la CLI les a historiquement inscrites ;
#   2. jeu de données HISTORIQUE synthétique, chargé avec les fichiers d'ÉPOQUE du commit source quand ils
#      existent (fixtures multitenant, seeds « Entreprise Test » 5 ans / tous onglets / suivi terrain) +
#      amorce, cas historiques et entreprise volumétrique de scripts/upgrade/seed/.
# Jamais de donnée réelle ; jamais de connexion distante (lib/common.sh).
#
# Usage : scripts/upgrade/build-source.sh <base> [--source-ref SHA] [--source-migration-count N] [--vol N] [--sans-donnees]
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
. "$HERE/lib/common.sh"

DB="${1:?usage: build-source.sh <base> [options]}"; shift
SOURCE_REF="5777abbcb94fb899ed14a3e7e5213be8f3abb0e7"; SOURCE_N=210; VOL=500; DONNEES=1
while [ $# -gt 0 ]; do
  case "$1" in
    --source-ref) SOURCE_REF="$2"; shift 2;;
    --source-migration-count) SOURCE_N="$2"; shift 2;;
    --vol) VOL="$2"; shift 2;;
    --sans-donnees) DONNEES=0; shift;;
    *) upg_die "option inconnue : $1";;
  esac
done
upg_garde_locale "$DB" "$SOURCE_REF"
upg_nom_base "$DB"
[[ "$VOL" =~ ^[0-9]+$ ]] || upg_die "--vol entier attendu"
OUT="${UPG_OUT:-$(mktemp -d)}"; mkdir -p "$OUT"; chmod 777 "$OUT"
SRC_DIR="$OUT/source-migrations"
upg_extraire_migrations "$REPO" "$SOURCE_REF" "$SRC_DIR"
n=$(ls "$SRC_DIR"/supabase/migrations/*.sql | wc -l)
[ "$n" = "$SOURCE_N" ] || upg_die "le commit source $SOURCE_REF porte $n migrations, attendu $SOURCE_N"

echo "== Source : $SOURCE_REF ($n migrations) → base $DB =="
upg_drop "$DB"
su postgres -c "psql -X -q -d postgres -c 'create database \"$DB\"'" >/dev/null
su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -v dbname=$DB -d $DB -f $REPO/scripts/local-postgres-bootstrap/pg_bootstrap.sql" >/dev/null 2>"$OUT/bootstrap.err" \
  || { cat "$OUT/bootstrap.err"; upg_die "bootstrap"; }
upg_creer_ledger "$DB"
t0=$(date +%s)
for f in "$SRC_DIR"/supabase/migrations/*.sql; do
  b=$(basename "$f" .sql); v=${b%%_*}; nom=${b#*_}
  { upg_contenu_migration "$f"; echo; echo "insert into supabase_migrations.schema_migrations(version, name) values ('$v', '$nom');"; } \
    | su postgres -c "psql -X -q -1 -v ON_ERROR_STOP=1 -d $DB" >/dev/null 2>"$OUT/err" \
    || { cat "$OUT/err"; upg_die "migration source $b"; }
done
echo "  ✓ $n migrations source + ledger ($(( $(date +%s) - t0 )) s) ; ledger=$(upg_q "$DB" "select count(*) from supabase_migrations.schema_migrations") versions, max $(upg_q "$DB" "select max(version) from supabase_migrations.schema_migrations")"

[ "$DONNEES" = 1 ] || { echo "  (sans données)"; exit 0; }
charger() { # <libellé> — SQL sur stdin
  local s; s=$(date +%s)
  if upg_psql "$DB" >/dev/null 2>"$OUT/err"; then echo "  ✓ $1 ($(( $(date +%s) - s )) s)"; else cat "$OUT/err"; upg_die "chargement $1"; fi
}
epoque() { git -C "$REPO" show "$SOURCE_REF:$1" 2>/dev/null; }
existe_epoque() { git -C "$REPO" cat-file -e "$SOURCE_REF:$1" 2>/dev/null; }

echo "== Jeu de données historique (fichiers d'époque de $SOURCE_REF + scripts/upgrade/seed) =="
if existe_epoque supabase/tests/fixtures/isolation_multitenant.inc; then
  { echo "set search_path = public, extensions; begin;"; epoque supabase/tests/fixtures/isolation_multitenant.inc; echo "commit;"; } | charger "entreprises A/B multi-rôles (isolation_multitenant.inc d'époque)"
fi
charger "amorce : Entreprise Test (moyenne) + Petite SARL Histo (petite)" < "$HERE/seed/00_amorce_entreprises_historiques.sql"
for s in seed_entreprise_test_5_ans seed_entreprise_test_tous_onglets seed_entreprise_test_suivi_terrain; do
  if existe_epoque "supabase/production/$s.sql"; then
    { echo "set search_path = public, extensions;"; epoque "supabase/production/$s.sql"; } | "$HERE/seed/verrous_historiques.sh" | charger "seed d'époque $s"
  fi
done
charger "cas historiques (offres, suspendu, essai expiré, sans membre, IBAN v1, support, Stripe synthétique…)" < "$HERE/seed/01_cas_historiques.sql"
if [ "$VOL" -gt 0 ]; then
  su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -v vol=$VOL -d $DB" < "$HERE/seed/02_volumetrie.sql" >/dev/null 2>"$OUT/err" \
    || { cat "$OUT/err"; upg_die "volumétrie"; }
  echo "  ✓ entreprise volumétrique (vol=$VOL)"
fi
upg_q "$DB" "analyze" >/dev/null
echo "  lignes totales : $(upg_q "$DB" "select sum(n_live_tup) from pg_stat_user_tables")"
