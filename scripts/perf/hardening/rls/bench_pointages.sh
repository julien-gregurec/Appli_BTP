#!/usr/bin/env bash
# ELSATIA PERFORMANCE HARDENING V9.1 — P1-C : pointages / planning sous RLS (tenant A de
# generate_fixture.sql, ~52 000 pointages). Trois profils :
#   gestionnaire : admin de A (toutes permissions : chemin rapide) ;
#   salarie      : compte créé dans la transaction, poste sans voir_pointages_equipe /
#                  gerer_pointage / valider_pointages (repli exact peut_consulter_pointage_employe
#                  ligne à ligne : la limite assumée du correctif) ;
#   croise       : admin du tenant volumétrique 11 lisant les pointages de A (attendu : 0).
# Usage : bench_pointages.sh <base> <étiquette>     Sortie CSV.
set -uo pipefail
DB="${1:?base}"; ETQ="${2:?etiquette}"
A="a0000000-0000-4000-a000-000000000001"
ADMIN_A=$(su postgres -c "psql -X -At -d $DB -c \"select ue.utilisateur_id from utilisateurs_entreprises ue join permissions_poste pp on pp.poste_id = ue.poste_id and pp.cle_permission = 'gerer_pointage' where ue.entreprise_id = '$A' and ue.statut = 'actif' limit 1\"")
EMP=$(su postgres -c "psql -X -At -d $DB -c \"select id from employes where entreprise_id = '$A' and utilisateur_id is null order by id limit 1\"")
X="facc0000-0000-4000-e000-000000000011"
SAL="5a1a0000-0000-4000-8000-000000000001"

mesure() { # $1 sub, $2 sql
  su postgres -c "psql -X -q -At -d $DB" <<SQL 2>&1 | python3 -c 'import json,sys;t=sys.stdin.read();i=t.find("[");p=json.loads(t[i:])[0];print(round(p["Execution Time"],1), p["Plan"].get("Actual Rows"))' 2>/dev/null || echo "erreur -"
set statement_timeout = '120s';
begin;
insert into auth.users (id, email) values ('$SAL', 'salarie-bench@invalid.local') on conflict do nothing;
insert into postes (id, entreprise_id, nom) values ('5a1a0000-0000-4000-8000-0000000000aa', '$A', 'Salarié bench') on conflict do nothing;
insert into permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
  values ('$A', '5a1a0000-0000-4000-8000-0000000000aa', 'acces_pointage', true), ('$A', '5a1a0000-0000-4000-8000-0000000000aa', 'saisir_son_pointage', true)
  on conflict do nothing;
insert into utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut, pointage_personnel_actif)
  values ('$SAL', '$A', '5a1a0000-0000-4000-8000-0000000000aa', 'actif', true) on conflict do nothing;
update employes set utilisateur_id = '$SAL' where id = '$EMP';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '$1', 'role', 'authenticated')::text, true) \g /dev/null
explain (analyze, timing off, format json) $2;
rollback;
SQL
}

echo "etiquette,table,scenario,profil,execution_ms,lignes"
for profil in gestionnaire salarie croise; do
  case $profil in gestionnaire) U=$ADMIN_A;; salarie) U=$SAL;; croise) U=$X;; esac
  for sc in "count|select count(*) from public.pointages" \
            "mois_filtre|select id, employe_id, date, heures_normales from public.pointages where entreprise_id = '$A' and date >= current_date - 30 order by date desc limit 500" \
            "liste_rls_seule_50|select id from public.pointages order by date desc limit 50" \
            "affectations_count|select count(*) from public.affectations"; do
    nom=${sc%%|*}; sql=${sc#*|}
    mesure "$U" "$sql" >/dev/null
    r=$(mesure "$U" "$sql")
    echo "$ETQ,pointages,$nom,$profil,${r// /,}"
  done
done
