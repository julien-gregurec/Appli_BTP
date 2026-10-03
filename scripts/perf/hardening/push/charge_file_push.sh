#!/usr/bin/env bash
# ELSATIA PERFORMANCE HARDENING V9.1 — P1-A : charge de la file push avec workers PARALLÈLES réels
# (sessions PostgreSQL distinctes, une transaction par lot, comme la route cron).
#
# Usage : charge_file_push.sh <base> <N> <workers> <avant|apres>
#   N notifications réparties sur tous les couples (utilisateur, entreprise) actifs, créées sur
#   les 48 dernières heures ; 1 % sont des « poisons » (préparation toujours en échec).
#   avant : chaque worker exécute l'algorithme V9.1 (lecture des 200 en attente sur 25 h, marquage) ;
#   apres : push_reserver_lot_service(100, 25) jusqu'à file vide, poison → push_echec_notification_service.
# Sortie : JSON (perdues, doublons, débit, poisons abandonnés…).
set -euo pipefail
DB="${1:?base}"; N="${2:?N}"; W="${3:?workers}"; MODE="${4:?avant|apres}"
psqlq() { su postgres -c "psql -X -q -At -v ON_ERROR_STOP=1 -d $DB" ; }

psqlq <<SQL
create schema if not exists perf_push;
drop table if exists perf_push.journal;
create unlogged table perf_push.journal (id uuid, worker int, at timestamptz default clock_timestamp());
update public.notifications_utilisateurs set push_envoyee_at = coalesce(push_envoyee_at, now()) where push_envoyee_at is null;
delete from public.notifications_utilisateurs where type = 'charge_push';
insert into public.notifications_utilisateurs (entreprise_id, utilisateur_id, type, titre, created_at)
select c.entreprise_id, c.utilisateur_id, 'charge_push', case when g % 100 = 0 then 'poison:' else 'ok:' end || g,
       now() - interval '48 hours' + (g * (interval '48 hours' / $N))
from generate_series(1, $N) g
cross join lateral (
  select ue.entreprise_id, ue.utilisateur_id
  from public.utilisateurs_entreprises ue
  where ue.statut = 'actif'
  order by ue.utilisateur_id, ue.entreprise_id
  offset (g % (select count(*) from public.utilisateurs_entreprises where statut = 'actif')) limit 1
) c;
analyze public.notifications_utilisateurs;

create or replace procedure perf_push.worker_apres(p_worker int)
language plpgsql as \$\$
declare r record; v_n int; v_vides int := 0;
begin
  loop
    v_n := 0;
    -- Comme la route : uniquement les ids rendus par la réservation (pas de jointure dans la même instruction).
    for r in select l.id, null::text titre from public.push_reserver_lot_service(100, 25) l loop
      v_n := v_n + 1;
      r.titre := (select n.titre from public.notifications_utilisateurs n where n.id = r.id);
      insert into perf_push.journal (id, worker) values (r.id, p_worker);
      perform pg_sleep(0.0005); -- envoi simulé
      if r.titre like 'poison:%' then perform public.push_echec_notification_service(r.id);
      else perform public.push_marquer_notification_envoyee_service(r.id); end if;
    end loop;
    commit;
    if v_n = 0 then
      v_vides := v_vides + 1;
      exit when v_vides >= 3;
      -- Le temps passe : les poisons en backoff redeviennent éligibles.
      update public.notifications_utilisateurs set push_reessai_apres = now() - interval '1 second'
       where type = 'charge_push' and push_reessai_apres > now();
      commit;
    else
      v_vides := 0;
    end if;
  end loop;
end \$\$;

create or replace procedure perf_push.worker_avant(p_worker int)
language plpgsql as \$\$
declare r record; v_n int; v_passes int := 0;
begin
  loop
    v_n := 0;
    for r in select x.id, n.titre from public.push_notifications_en_attente_service(now() - interval '25 hours', 200) x
             join public.notifications_utilisateurs n on n.id = x.id loop
      v_n := v_n + 1;
      insert into perf_push.journal (id, worker) values (r.id, p_worker);
      perform pg_sleep(0.0005);
      if r.titre not like 'poison:%' then perform public.push_marquer_notification_envoyee_service(r.id); end if;
    end loop;
    commit;
    v_passes := v_passes + 1;
    -- Ancien comportement : un lot de 200 par passage ; on enchaîne les passages tant qu'il reste
    -- autre chose que des poisons dans la fenêtre (borne de sécurité 500 passages).
    exit when v_n = 0 or v_passes >= 500
      or not exists (select 1 from public.push_notifications_en_attente_service(now() - interval '25 hours', 500) x
                     join public.notifications_utilisateurs n on n.id = x.id where n.titre not like 'poison:%');
  end loop;
end \$\$;
SQL

debut=$(date +%s.%N)
pids=()
for w in $(seq 1 "$W"); do
  su postgres -c "psql -X -q -At -d $DB -c 'call perf_push.worker_$MODE($w)'" >/dev/null 2>&1 & pids+=($!)
done
for p in "${pids[@]}"; do wait "$p" || true; done
fin=$(date +%s.%N)
duree=$(echo "$fin - $debut" | bc)

psqlq <<SQL
select json_build_object(
  'mode', '$MODE', 'N', $N, 'workers', $W, 'secondes', round($duree::numeric, 1),
  'envoyees', (select count(*) from public.notifications_utilisateurs where type = 'charge_push' and push_envoyee_at is not null),
  'perdues_ou_bloquees', (select count(*) from public.notifications_utilisateurs n where type = 'charge_push' and push_envoyee_at is null
                            and coalesce((to_jsonb(n) ->> 'push_abandonnee_at'), '') = ''),
  'poisons', (select count(*) from public.notifications_utilisateurs where type = 'charge_push' and titre like 'poison:%'),
  'poisons_abandonnes', (select count(*) from public.notifications_utilisateurs n where type = 'charge_push' and titre like 'poison:%'
                           and (to_jsonb(n) ->> 'push_abandon_motif') = 'tentatives_epuisees'),
  'saines_traitees_plus_d_une_fois', (select count(*) from (select j.id from perf_push.journal j join public.notifications_utilisateurs n on n.id = j.id
                                        where n.titre like 'ok:%' group by j.id having count(*) > 1) d),
  'traitements_doublons', (select count(*) - count(distinct j.id) from perf_push.journal j join public.notifications_utilisateurs n on n.id = j.id where n.titre like 'ok:%'),
  'traitements_total', (select count(*) from perf_push.journal),
  'workers_actifs', (select count(distinct worker) from perf_push.journal),
  'tenants_servis', (select count(distinct n.entreprise_id) from perf_push.journal j join public.notifications_utilisateurs n on n.id = j.id),
  'debit_par_s', round((select count(*) from perf_push.journal) / greatest($duree, 0.001)::numeric, 0)
);
SQL
