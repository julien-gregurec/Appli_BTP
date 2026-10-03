#!/usr/bin/env bash
# Train canonique V9.2 — migration 20261003001503 (RLS ensembliste, 13 verrous ACCESS EXCLUSIVE pris
# d'un coup, lock_timeout 10 s) appliquée SOUS TRAFIC, sur des copies d'une base V9.1 peuplée amenée
# juste avant 1503 (toutes les migrations V9.2 antérieures appliquées).
#
# Scénarios (chacun sur une copie neuve) :
#   T0 trafic absent ;
#   T1 trafic léger : 8 clients pgbench (rôle authenticated, JWT simulé) lisant devis / factures /
#      chantiers / pointages / notifications de 4 tenants, pendant la migration ;
#   T2 lecture lente : une transaction lit `devis` puis dort 30 s (verrou ACCESS SHARE tenu) au
#      moment du lancement → attendu : échec PROPRE de 1503 après ~10 s (lock_timeout), transaction
#      annulée, policies V9.1 intactes, aucun interblocage ; puis REJEU après la lecture → succès ;
#   T3 lecture lente + trafic léger simultanés → idem T2 (aucune attente infinie, aucun deadlock).
# Contrôles : durée bornée, code de sortie, empreinte des policies des 13 tables (V9.1 si échec,
# V9.2 si succès), deadlocks (pg_stat_database.deadlocks), erreurs côté clients.
# Usage : rls-verrous-sous-trafic.sh <base-v91-peuplée> <dossier-sortie>
set -uo pipefail
SRC="${1:?base V9.1 peuplée}"; OUT="${2:?sortie}"
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; DEPOT="$(cd "$ICI/../../.." && pwd)"
M1503="$DEPOT/supabase/migrations/20261003001503_rls_ensembles_entreprises_autorisees_v1.sql"
mkdir -p "$OUT"; chmod 777 "$OUT"
pg() { runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1 "$@"; }
q() { runuser -u postgres -- psql -X -At -d "$1" -c "$2"; }
BASE_PRE="${SRC}_pre1503"
pg -c "drop database if exists $BASE_PRE" -c "create database $BASE_PRE template $SRC" > /dev/null
for f in "$DEPOT"/supabase/migrations/*.sql; do
  n=$(basename "$f"); [[ "${n:0:14}" > 20261002001302 && "${n:0:14}" < 20261003001503 ]] || continue
  pg -d "$BASE_PRE" -f "$f" > /dev/null || { echo "échec préparation $n"; exit 1; }
done
TABLES="'affectations','chantiers','clients','devis','documents_chantier','factures','lignes_devis','lignes_factures','notifications_utilisateurs','paiements','pointages','sessions_pointage','taches'"
empreinte_policies() { q "$1" "select md5(string_agg(tablename||policyname||coalesce(qual,'')||coalesce(with_check,''), '|' order by tablename, policyname)) from pg_policies where schemaname='public' and tablename in ($TABLES)"; }
REF_V91=$(empreinte_policies "$BASE_PRE")
# Script pgbench : tenant tiré au hasard parmi les tenants volumétriques présents.
TENANTS=$(q "$BASE_PRE" "select string_agg(right(id::text,2), ' ') from public.entreprises where id::text like 'e0000000-0000-4000-e000-0000000000%'")
cat > "$OUT/lecture.pgbench" <<SQL
\set t random(1, $(echo $TENANTS | wc -w))
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', (array[$(for t in $TENANTS; do printf "'facc0000-0000-4000-e000-0000000000%s'," $t; done | sed 's/,$//')])[:t], true);
select count(*) from (select id from public.devis order by created_at desc limit 50) d;
select count(*) from (select id from public.factures order by created_at desc limit 50) f;
select count(*) from (select id from public.chantiers limit 50) c;
select count(*) from (select id from public.notifications_utilisateurs limit 50) n;
commit;
SQL
chmod 644 "$OUT/lecture.pgbench"
scenario() { # <nom> <trafic 0|1> <lecture_lente 0|1>
  local nom=$1 trafic=$2 lent=$3 db="rls_${1,,}_$$"
  pg -c "drop database if exists $db" -c "create database $db template $BASE_PRE" > /dev/null
  local dl0; dl0=$(q postgres "select deadlocks from pg_stat_database where datname='$db'")
  local pb=""
  if [ "$trafic" = 1 ]; then
    runuser -u postgres -- pgbench -n -c 8 -j 4 -T 40 -f "$OUT/lecture.pgbench" "$db" > "$OUT/${nom}_pgbench.log" 2>&1 & pb=$!
    sleep 3
  fi
  local lp=""
  if [ "$lent" = 1 ]; then
    runuser -u postgres -- psql -X -q -d "$db" -c "begin; set local role authenticated; select set_config('request.jwt.claim.sub','facc0000-0000-4000-e000-000000000011',true); select count(*) from public.devis; select pg_sleep(30); commit;" > "$OUT/${nom}_lecture_lente.log" 2>&1 & lp=$!
    sleep 2
  fi
  local t0 rc d1 etat
  t0=$(date +%s%N)
  runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1 -d "$db" -f "$M1503" > "$OUT/${nom}_1503.log" 2>&1; rc=$?
  d1=$(( ($(date +%s%N) - t0) / 1000000 ))
  etat=$(empreinte_policies "$db")
  local resultat="rc=$rc duree_ms=$d1 policies=$([ "$etat" = "$REF_V91" ] && echo V9.1 || echo V9.2)"
  if [ $rc != 0 ]; then
    resultat="$resultat erreur=\"$(grep -m1 -oE 'ERROR:.*' "$OUT/${nom}_1503.log")\""
    [ -n "$lp" ] && wait $lp
    local t1; t1=$(date +%s%N)
    runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1 -d "$db" -f "$M1503" > "$OUT/${nom}_1503_rejeu.log" 2>&1; local rc2=$?
    resultat="$resultat rejeu_rc=$rc2 rejeu_ms=$(( ($(date +%s%N) - t1) / 1000000 )) policies_apres_rejeu=$([ "$(empreinte_policies "$db")" = "$REF_V91" ] && echo V9.1 || echo V9.2)"
  fi
  [ -n "$lp" ] && wait $lp 2>/dev/null
  [ -n "$pb" ] && wait $pb
  local dl; dl=$(( $(q postgres "select deadlocks from pg_stat_database where datname='$db'") - dl0 ))
  local pbres=""; [ "$trafic" = 1 ] && pbres=" pgbench=[$(grep -E 'number of (transactions actually processed|failed)' "$OUT/${nom}_pgbench.log" | sed 's/.*: //' | tr '\n' ' ' | sed 's/ $//')] erreurs_clients=$(grep -c 'ERROR' "$OUT/${nom}_pgbench.log")"
  echo "$nom $resultat deadlocks=$dl$pbres" | tee -a "$OUT/resultats.txt"
  pg -c "drop database if exists $db" > /dev/null
}
: > "$OUT/resultats.txt"
scenario T0_TRAFIC_ABSENT 0 0
scenario T1_TRAFIC_LEGER 1 0
scenario T2_LECTURE_LENTE 0 1
scenario T3_LECTURE_LENTE_ET_TRAFIC 1 1
pg -c "drop database if exists $BASE_PRE" > /dev/null
