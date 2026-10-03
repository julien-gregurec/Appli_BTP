#!/usr/bin/env bash
# ELSATIA PERFORMANCE HARDENING V9.1 — P1-A : endurance de la file push (après correctif).
# Pendant <secondes> : un producteur insère ~20 notifications/s (1 % poison), un worker « webhook »
# réserve chaque nouvelle notification individuellement (push_reserver_notification_service), et
# <workers> workers « cron » réservent des lots en parallèle. Puis vidange (le temps des backoffs
# est simulé). Contrôles : aucune perte, aucune notification saine traitée deux fois, poisons
# abandonnés explicitement.
# Usage : endurance_file_push.sh <base> <secondes> <workers>
set -euo pipefail
DB="${1:?base}"; D="${2:?secondes}"; W="${3:?workers}"
psqlq() { su postgres -c "psql -X -q -At -v ON_ERROR_STOP=1 -d $DB" ; }

psqlq <<SQL
create schema if not exists perf_push;
drop table if exists perf_push.journal;
create unlogged table perf_push.journal (id uuid, worker int, at timestamptz default clock_timestamp());
update public.notifications_utilisateurs set push_envoyee_at = coalesce(push_envoyee_at, now()) where push_envoyee_at is null;
delete from public.notifications_utilisateurs where type = 'endurance_push';

create or replace procedure perf_push.traiter(p_id uuid, p_titre text, p_worker int)
language plpgsql as \$\$
begin
  insert into perf_push.journal (id, worker) values (p_id, p_worker);
  if p_titre like 'poison:%' then perform public.push_echec_notification_service(p_id);
  else perform public.push_marquer_notification_envoyee_service(p_id); end if;
end \$\$;

create or replace procedure perf_push.producteur(p_fin timestamptz)
language plpgsql as \$\$
declare g bigint := 0;
begin
  while clock_timestamp() < p_fin loop
    insert into public.notifications_utilisateurs (entreprise_id, utilisateur_id, type, titre)
    select c.entreprise_id, c.utilisateur_id, 'endurance_push', case when (g + i) % 100 = 0 then 'poison:' else 'ok:' end || (g + i)
    from generate_series(1, 10) i
    cross join lateral (select ue.entreprise_id, ue.utilisateur_id from public.utilisateurs_entreprises ue where ue.statut = 'actif'
                        order by ue.utilisateur_id offset ((g + i) % (select count(*) from public.utilisateurs_entreprises where statut = 'actif')) limit 1) c;
    g := g + 10;
    commit;
    perform pg_sleep(0.5);
  end loop;
end \$\$;

create or replace procedure perf_push.webhook(p_fin timestamptz)
language plpgsql as \$\$
declare r record;
begin
  while clock_timestamp() < p_fin loop
    for r in select n.id, n.titre from public.notifications_utilisateurs n
             where n.type = 'endurance_push' and n.push_envoyee_at is null and n.created_at > now() - interval '5 seconds'
             order by n.created_at limit 50 loop
      if public.push_reserver_notification_service(r.id) then call perf_push.traiter(r.id, r.titre, 0); end if;
      commit;
    end loop;
    perform pg_sleep(0.2);
  end loop;
end \$\$;

create or replace procedure perf_push.cron(p_worker int, p_fin timestamptz)
language plpgsql as \$\$
declare r record; v_n int; v_vides int := 0; v_titre text;
begin
  loop
    v_n := 0;
    -- Comme la route : on n'utilise QUE les ids rendus par la réservation (une jointure dans la même
    -- instruction lirait la table avec un instantané antérieur aux lignes tout juste réservées).
    for r in select l.id from public.push_reserver_lot_service(100, 25) l loop
      v_n := v_n + 1;
      select n.titre into v_titre from public.notifications_utilisateurs n where n.id = r.id;
      call perf_push.traiter(r.id, v_titre, p_worker);
    end loop;
    commit;
    if v_n = 0 then
      if clock_timestamp() < p_fin then perform pg_sleep(1); continue; end if;
      v_vides := v_vides + 1;
      exit when v_vides >= 3;
      update public.notifications_utilisateurs set push_reessai_apres = now() - interval '1 second'
       where type = 'endurance_push' and push_reessai_apres > now();
      commit;
    else
      v_vides := 0;
    end if;
  end loop;
end \$\$;
SQL

FIN=$(su postgres -c "psql -X -At -d $DB -c \"select now() + interval '$D seconds'\"")
pids=()
su postgres -c "psql -X -q -d $DB -c \"call perf_push.producteur('$FIN')\"" >/dev/null 2>&1 & pids+=($!)
su postgres -c "psql -X -q -d $DB -c \"call perf_push.webhook('$FIN')\"" >/dev/null 2>&1 & pids+=($!)
for w in $(seq 1 "$W"); do
  su postgres -c "psql -X -q -d $DB -c \"call perf_push.cron($w, '$FIN')\"" >/dev/null 2>&1 & pids+=($!)
done
for p in "${pids[@]}"; do wait "$p" || true; done

psqlq <<SQL
select json_build_object(
  'secondes', $D, 'workers_cron', $W, 'webhook', 1,
  'produites', (select count(*) from public.notifications_utilisateurs where type = 'endurance_push'),
  'envoyees', (select count(*) from public.notifications_utilisateurs where type = 'endurance_push' and push_envoyee_at is not null),
  'perdues_ou_bloquees', (select count(*) from public.notifications_utilisateurs where type = 'endurance_push' and push_envoyee_at is null and push_abandonnee_at is null),
  'poisons_abandonnes', (select count(*) from public.notifications_utilisateurs where type = 'endurance_push' and push_abandon_motif = 'tentatives_epuisees'),
  'saines_traitees_plus_d_une_fois', (select count(*) from (select j.id from perf_push.journal j join public.notifications_utilisateurs n on n.id = j.id
                                        where n.titre like 'ok:%' group by j.id having count(*) > 1) d),
  'par_webhook', (select count(*) from perf_push.journal where worker = 0),
  'par_cron', (select count(*) from perf_push.journal where worker > 0)
);
SQL
