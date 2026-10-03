#!/usr/bin/env bash
# ELSATIA — ponts d'upgrade Production du train (20261003000201 phase 0, 20261003000202 contrôle final) :
# preuves de sûreté hors Production historique (celle-ci est couverte par production-to-v9x.sh).
#
#   PS1 fresh SANS ledger Supabase (rejeu psql local, rebuild_db.sh) : 396/396, ponts sans effet
#   PS2 V9.1 déjà construite et PEUPLÉE (forme Preview : 391 migrations + ledger + données pilote avec devis /
#       factures émises) → +5 migrations post-V9.1 : empreinte des lignes / devis / factures INCHANGÉE
#       (aucune ligne réécrite, aucun updated_at), triggers identiques, notices « aucune action »
#   PS3 idempotence phase 0 sur Production 210 : 201 appliqué deux fois (2ᵉ passage : 0 ligne), puis le reste
#       du plan ; 300 ne touche aucune ligne
#   PS4 contrôle final 202 : réactive un trigger métier désactivé à la main ; refuse (transaction annulée)
#       une colonne entreprise_id redevenue nullable
# Local uniquement (lib/common.sh). Usage :
#   scripts/upgrade/ponts-scenarios.sh --target-sha <sha> --base-v91 <sha V9.1> --source-210 <base 210> --out <dossier>
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
. "$HERE/lib/common.sh"
BOOT="$REPO/scripts/local-postgres-bootstrap"
SHA=""; V91=""; SRC=""; OUT=""
while [ $# -gt 0 ]; do case "$1" in --target-sha) SHA="$2"; shift 2;; --base-v91) V91="$2"; shift 2;; --source-210) SRC="$2"; shift 2;; --out) OUT="$2"; shift 2;; *) upg_die "option $1";; esac; done
[ -n "$SHA" ] && [ -n "$V91" ] && [ -n "$SRC" ] && [ -n "$OUT" ] || upg_die "usage : --target-sha --base-v91 --source-210 --out"
upg_garde_locale "$SHA" "$V91" "$SRC" "$OUT"; upg_exists "$SRC" || upg_die "source $SRC absente"
mkdir -p "$OUT"; chmod 777 "$OUT"
upg_extraire_migrations "$REPO" "$SHA" "$OUT/cible"; MIG="$OUT/cible/supabase/migrations"
upg_extraire_migrations "$REPO" "$V91" "$OUT/v91"; MIG91="$OUT/v91/supabase/migrations"
KO=0; ok() { echo "  ✅ $*"; }; ko() { KO=1; echo "  ❌ $*"; }
P201=$(ls "$MIG"/20261003000201_*.sql); P202=$(ls "$MIG"/20261003000202_*.sql)
appliquer() { # <base> <fichier> [ledger=1]
  local b v nom; b=$(basename "$2" .sql); v=${b%%_*}; nom=${b#*_}
  { upg_contenu_migration "$2" | python3 "$HERE/lib/strip_txn.py"; echo
    [ "${3:-1}" = 1 ] && echo "insert into supabase_migrations.schema_migrations(version, name) values ('$v', '$nom');"; } \
    | su postgres -c "psql -X -q -1 -v ON_ERROR_STOP=1 -d $1" > "$OUT/derniere.out" 2>&1
}
empreinte() { # <base> : lignes + parents + triggers des tables concernées
  upg_q "$1" "select md5(string_agg(x, '|' order by x)) from (
      select 'ld:'||md5(ld::text) x from public.lignes_devis ld union all
      select 'lf:'||md5(lf::text) from public.lignes_factures lf union all
      select 'd:'||id||':'||coalesce(updated_at::text,'')||':'||coalesce(montant_ttc::text,'') from public.devis union all
      select 'f:'||id||':'||coalesce(updated_at::text,'')||':'||coalesce(montant_ttc::text,'') from public.factures union all
      select 't:'||c.relname||'.'||g.tgname||':'||g.tgenabled from pg_trigger g join pg_class c on c.oid = g.tgrelid
       where c.relname in ('lignes_devis','lignes_factures','devis','factures') and not g.tgisinternal) s"
}

echo "== PS1 fresh sans ledger Supabase (rebuild_db.sh) =="
db=ps1_fresh; upg_drop $db; su postgres -c "psql -X -q -d postgres -c 'create database $db'" >/dev/null
su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -v dbname=$db -d $db -f $BOOT/pg_bootstrap.sql" >/dev/null 2>&1
n=0; for f in "$MIG"/*.sql; do appliquer $db "$f" 0 || { ko "PS1 échec $(basename "$f")"; cat "$OUT/derniere.out" | head -5; break; }; n=$((n+1)); done
[ "$(upg_q $db "select to_regclass('supabase_migrations.schema_migrations') is null")" = t ] && ok "PS1 base sans ledger : $n/$(ls "$MIG"/*.sql | wc -l) migrations appliquées, ponts compris"
upg_drop $db

echo "== PS2 V9.1 peuplée (forme Preview) → post-V9.1 =="
db=ps2_v91; upg_drop $db; su postgres -c "psql -X -q -d postgres -c 'create database $db'" >/dev/null
su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -v dbname=$db -d $db -f $BOOT/pg_bootstrap.sql" >/dev/null 2>&1
upg_creer_ledger $db
for f in "$MIG91"/*.sql; do appliquer $db "$f" || { ko "PS2 V9.1 échec $(basename "$f")"; break; }; done
for s in seed_entreprise_pilote_btp seed_entreprise_test_5_ans; do
  if [ -f "$REPO/supabase/production/$s.sql" ]; then
    { echo "set search_path = public, extensions;"; cat "$REPO/supabase/production/$s.sql"; } | upg_psql $db > "$OUT/ps2_$s.log" 2>&1 \
      && echo "  données : $s" || echo "  données : $s non chargé (voir $OUT/ps2_$s.log)"
  fi
done
# Factures émises avec lignes, comme en Preview pilotée.
emises=$(upg_q $db "select count(*) from public.lignes_factures lf join public.factures f on f.id = lf.facture_id where f.statut <> 'brouillon'")
avant=$(empreinte $db); n91=$(upg_q $db "select count(*) from supabase_migrations.schema_migrations")
notices=""
for f in "$MIG"/*.sql; do
  v=$(basename "$f" | cut -d_ -f1)
  [ "$(upg_q $db "select count(*) from supabase_migrations.schema_migrations where version = '$v'")" = 1 ] && continue
  appliquer $db "$f" || { ko "PS2 échec $(basename "$f")"; head -5 "$OUT/derniere.out"; break; }
  case "$f" in *_pont_upgrade_*) notices="$notices $(grep -ho 'pont phase 0 : [^—]*— aucune action' "$OUT/derniere.out")";; esac
done
apres=$(empreinte $db)
echo "  ledger $n91 → $(upg_q $db "select count(*) from supabase_migrations.schema_migrations") ; lignes de factures émises : $emises ;$notices"
[ "$avant" = "$apres" ] && [ "${emises:-0}" -gt 0 ] && ok "PS2 empreinte lignes / devis / factures / triggers identique ($avant)" \
  || ko "PS2 empreinte modifiée ($avant → $apres) ou aucune facture émise ($emises)"
upg_drop $db

echo "== PS3 idempotence phase 0 sur Production 210 ($SRC) =="
db=ps3_210; upg_clone "$SRC" $db
appliquer $db "$P201" 0 || ko "PS3 1er passage"; p1=$(grep -o '[0-9]* ligne(s) de devis et [0-9]* ligne(s) de factures' "$OUT/derniere.out")
appliquer $db "$P201" || ko "PS3 2e passage"; p2=$(grep -o '[0-9]* ligne(s) de devis et [0-9]* ligne(s) de factures' "$OUT/derniere.out")
echo "  1er passage : $p1 ; 2e passage : $p2"
[[ "$p2" == "0 ligne(s) de devis et 0 ligne(s) de factures" ]] && ok "PS3 phase 0 idempotente" || ko "PS3 2e passage non nul"
upg_q $db "select 1" >/dev/null
upg_ledger $db > "$OUT/ps3_ledger.txt"
python3 "$HERE/lib/classify.py" plan "$OUT/ps3_ledger.txt" "$MIG" "$OUT/ps3_plan.json" >/dev/null
reste=0
for m in $(python3 -c "import json;print(' '.join(json.load(open('$OUT/ps3_plan.json'))['en_attente']))"); do
  appliquer $db "$MIG/$m" || { ko "PS3 échec $m"; head -5 "$OUT/derniere.out"; break; }; reste=$((reste+1))
done
dis=$(upg_q $db "select count(*) from pg_trigger g where g.tgrelid in ('public.lignes_devis'::regclass,'public.lignes_factures'::regclass) and not g.tgisinternal and g.tgenabled <> 'O'")
[ "$dis" = 0 ] && ok "PS3 reprise du plan après phase 0 : $reste migrations, 0 trigger désactivé" || ko "PS3 $dis trigger(s) désactivé(s)"
upg_drop $db

echo "== PS4 contrôle final 202 =="
db=ps4_ctl; upg_drop $db; su postgres -c "psql -X -q -d postgres -c 'create database $db'" >/dev/null
su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -v dbname=$db -d $db -f $BOOT/pg_bootstrap.sql" >/dev/null 2>&1
upg_creer_ledger $db
for f in "$MIG"/*.sql; do appliquer $db "$f" || { ko "PS4 fresh"; break; }; done
upg_q $db "alter table public.lignes_factures disable trigger lignes_factures_brouillon_only" >/dev/null
appliquer $db "$P202" 0 && grep -q "réactivé" "$OUT/derniere.out" \
  && [ "$(upg_q $db "select tgenabled from pg_trigger where tgname = 'lignes_factures_brouillon_only'")" = O ] \
  && ok "PS4 trigger désactivé à la main réactivé par 202" || ko "PS4 réactivation"
upg_q $db "alter table public.lignes_devis drop constraint lignes_devis_devis_id_entreprise_id_fkey; alter table public.lignes_devis alter column entreprise_id drop not null" >/dev/null
if appliquer $db "$P202" 0; then ko "PS4 202 aurait dû refuser une colonne nullable"; else
  grep -q "absente ou nullable" "$OUT/derniere.out" && ok "PS4 202 refuse une base incohérente (transaction annulée)" || ko "PS4 message inattendu"; fi
upg_drop $db

echo; [ "$KO" = 0 ] && echo "PONTS : ✅ PS1–PS4 conformes" || echo "PONTS : ❌ écarts"
exit $KO
