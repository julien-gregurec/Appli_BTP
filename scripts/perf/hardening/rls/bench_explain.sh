#!/usr/bin/env bash
# ELSATIA PERFORMANCE HARDENING V9.1 — P1-C : mesure EXPLAIN ANALYZE de la RLS, rôle authenticated.
#
# Usage : bench_explain.sh <base> <étiquette> [k ...]
#   base     : base locale jetable (migrations + generate_fixture.sql + volume_tenant.sql k=11..15)
#   étiquette: « avant » / « apres » (colonne du CSV)
#   k        : tenants volumétriques à mesurer (défaut : 11 12 13 14 15 = 1k 5k 20k 50k 100k)
# Sortie CSV sur stdout : etiquette,table,scenario,k,n_lignes_tenant,execution_ms,lignes
# Chaque requête : 1 passage de chauffe puis médiane de 3 si < 5 s (statement_timeout 120 s → « timeout »).
set -uo pipefail
DB="${1:?base}"; ETQ="${2:?etiquette}"; shift 2
[ $# -eq 0 ] && set -- 11 12 13 14 15
ent() { printf 'e0000000-0000-4000-e000-0000000000%s' "$1"; }
adm() { printf 'facc0000-0000-4000-e000-0000000000%s' "$1"; }

mesure() { # $1 sub, $2 sql → "ms lignes"
  local out
  out=$(su postgres -c "psql -X -q -At -d $DB" <<SQL 2>&1
set statement_timeout = '120s';
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '$1', 'role', 'authenticated')::text, true);
explain (analyze, timing off, format json) $2;
rollback;
SQL
)
  if echo "$out" | grep -q "statement timeout"; then echo "timeout -"; return; fi
  echo "$out" | python3 -c '
import json,sys
t=sys.stdin.read(); i=t.find("[")
p=json.loads(t[i:])[0]
print(round(p["Execution Time"],1), p["Plan"].get("Actual Rows"))'
}

mediane() { # $1 sub, $2 sql — chauffe, puis médiane de 3 si la requête prend < 5 s (sinon la mesure de chauffe suffit).
  local w a b c
  w=$(mesure "$1" "$2")
  case "$w" in timeout*) echo "$w"; return;; esac
  if [ "$(echo "$w" | cut -d' ' -f1 | cut -d. -f1)" -ge 5000 ]; then echo "$w"; return; fi
  a=$(mesure "$1" "$2"); b=$(mesure "$1" "$2"); c=$(mesure "$1" "$2")
  printf '%s\n%s\n%s\n' "$a" "$b" "$c" | sort -n | sed -n 2p
}

echo "etiquette,table,scenario,k,n_lignes_tenant,execution_ms,lignes"
for k in "$@"; do
  E=$(ent "$k"); U=$(adm "$k"); X=$(adm 11); [ "$k" = 11 ] && X=$(adm 12)
  n=$(su postgres -c "psql -X -At -d $DB -c \"select count(*) from devis where entreprise_id = '$E'\"")
  for t in devis factures; do
    r=$(mediane "$U" "select * from public.$t where entreprise_id = '$E' limit 1000"); echo "$ETQ,$t,own_read_1000,$k,$n,${r// /,}"
    r=$(mediane "$U" "select id from public.$t order by created_at desc limit 50"); echo "$ETQ,$t,own_list_rls_only_50,$k,$n,${r// /,}"
    r=$(mediane "$U" "select count(*) from public.$t"); echo "$ETQ,$t,own_count,$k,$n,${r// /,}"
    r=$(mediane "$U" "select id from public.$t where entreprise_id = '$E' order by created_at desc limit 50 offset $((n / 2))"); echo "$ETQ,$t,own_page_milieu_50,$k,$n,${r// /,}"
    r=$(mediane "$X" "select * from public.$t where entreprise_id = '$E' limit 1000"); echo "$ETQ,$t,cross_tenant_empty,$k,$n,${r// /,}"
  done
  r=$(mediane "$U" "select count(*) from public.clients"); echo "$ETQ,clients,own_count,$k,$n,${r// /,}"
  r=$(mediane "$X" "select * from public.clients where entreprise_id = '$E' limit 1000"); echo "$ETQ,clients,cross_tenant_empty,$k,$n,${r// /,}"
  r=$(mediane "$U" "select count(*) from public.documents_chantier"); echo "$ETQ,documents_chantier,own_count,$k,$n,${r// /,}"
  r=$(mediane "$X" "select * from public.documents_chantier where entreprise_id = '$E' limit 1000"); echo "$ETQ,documents_chantier,cross_tenant_empty,$k,$n,${r// /,}"
  r=$(mediane "$U" "select count(*) from public.chantiers"); echo "$ETQ,chantiers,own_count,$k,$n,${r// /,}"
  CH=$(su postgres -c "psql -X -At -d $DB -c \"select chantier_id from taches t join chantiers c on c.id = t.chantier_id where c.entreprise_id = '$E' group by 1 order by count(*) desc limit 1\"")
  r=$(mediane "$U" "select id, libelle, statut from public.taches where chantier_id = '$CH' order by created_at"); echo "$ETQ,taches,taches_d_un_chantier,$k,$n,${r// /,}"
  r=$(mediane "$U" "select count(*) from public.taches"); echo "$ETQ,taches,own_count,$k,$n,${r// /,}"
  r=$(mediane "$U" "select count(*) from public.notifications_utilisateurs"); echo "$ETQ,notifications_utilisateurs,own_count,$k,$n,${r// /,}"
done
