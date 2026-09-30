-- ELSATIA-GP-POINTAGES-FACTURE-FIX-V1 — jeu de charge « pointages d'un mois ».
--
-- Insère :n pointages dans le mois :'mois' (AAAA-MM) pour l'entreprise
-- :'entreprise', répartis sur un pool de salariés dédiés (38 minimum, puis
-- un salarié pour 40 pointages), un chantier dédié, environ 70 % des
-- pointages adossés à une session GPS (sessions_pointage) portant deux
-- contrôles de zone chacune, le reste en « anciennes saisies » sans session.
-- Heures déterministes et non rondes (pas de 0,25 h) pour que toute ligne
-- perdue se voie dans les totaux.
--
-- Idempotent : les lignes d'un passage précédent (marqueur CHARGE-PT-V1) sont
-- d'abord supprimées. À lancer en superutilisateur (fixture, pas de RLS).
--
--   psql -d <db> -v entreprise=<uuid> -v mois=2026-08 -v n=1462 \
--        -f scripts/perf/pointages_mois_charge.sql
\set ON_ERROR_STOP on

set elsatia.capacite_personnes_bypass = 'on';

delete from public.verifications_zone_pointage v using public.sessions_pointage s
 where v.session_id = s.id and s.tache = 'CHARGE-PT-V1';
delete from public.sessions_pointage where tache = 'CHARGE-PT-V1';
delete from public.pointages where tache = 'CHARGE-PT-V1';
delete from public.employes where numero_inscription like 'CHARGE-PT-V1-%';
delete from public.chantiers where nom = 'Chantier charge pointages V1';
delete from public.clients where nom = 'Client charge pointages V1';

create temp table _charge_param as
select :'entreprise'::uuid as entreprise_id,
       to_date(:'mois' || '-01', 'YYYY-MM-DD') as debut,
       (to_date(:'mois' || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date as fin,
       (:n)::int as n,
       greatest(38, ceil((:n)::numeric / 40))::int as k;

insert into public.clients (entreprise_id, nom)
select entreprise_id, 'Client charge pointages V1' from _charge_param;

insert into public.chantiers (entreprise_id, client_id, nom, statut)
select p.entreprise_id, c.id, 'Chantier charge pointages V1', 'en_cours'
from _charge_param p join public.clients c on c.entreprise_id = p.entreprise_id and c.nom = 'Client charge pointages V1';

insert into public.employes (entreprise_id, prenom, nom, numero_inscription, identifiant_interne)
select p.entreprise_id, 'Salarié', 'Charge ' || lpad(g::text, 4, '0'),
       'CHARGE-PT-V1-' || lpad(g::text, 5, '0'), 'CPT' || lpad(g::text, 5, '0')
from _charge_param p, generate_series(1, p.k) g;

create temp table _charge_emp as
select row_number() over (order by e.numero_inscription) - 1 as rang, e.id
from public.employes e join _charge_param p on e.entreprise_id = p.entreprise_id
where e.numero_inscription like 'CHARGE-PT-V1-%';

create temp table _charge_pt as
select g as i,
       gen_random_uuid() as id,
       (select id from _charge_emp where rang = (g % p.k)) as employe_id,
       (p.debut + ((g / p.k) % (p.fin - p.debut + 1)))::date as jour,
       -- 1,07 h à 8,93 h, jamais un multiple de 0,25 : une ligne perdue se voit.
       round(1 + ((g * 37) % 787) / 100.0 + 0.07, 2) as hn,
       case when g % 3 = 0 then round(((g * 13) % 190) / 100.0 + 0.01, 2) else 0 end as hs,
       (g % 10) < 7 as avec_session
from _charge_param p, generate_series(0, p.n - 1) g;

insert into public.pointages (id, entreprise_id, employe_id, chantier_id, date, heures_normales, heures_supplementaires, tache, verification_statut, origine_pointage)
select t.id, p.entreprise_id, t.employe_id, ch.id, t.jour, t.hn, t.hs, 'CHARGE-PT-V1',
       case when t.i % 4 = 0 then 'a_verifier' else 'valide' end, 'gps_complet'
from _charge_pt t cross join _charge_param p
join public.chantiers ch on ch.entreprise_id = p.entreprise_id and ch.nom = 'Chantier charge pointages V1';

insert into public.sessions_pointage (id, entreprise_id, employe_id, chantier_id, arrivee_at, depart_at, pause_minutes,
  latitude_arrivee, longitude_arrivee, tache, pointage_id)
select gen_random_uuid(), p.entreprise_id, t.employe_id, ch.id,
       (t.jour + time '07:00' + (t.i % 60) * interval '1 minute') at time zone 'Europe/Paris',
       (t.jour + time '07:00' + (t.i % 60) * interval '1 minute' + (t.hn + t.hs) * interval '1 hour' + interval '1 hour') at time zone 'Europe/Paris',
       60, 45.75, 4.85, 'CHARGE-PT-V1', t.id
from _charge_pt t cross join _charge_param p
join public.chantiers ch on ch.entreprise_id = p.entreprise_id and ch.nom = 'Chantier charge pointages V1'
where t.avec_session;

insert into public.verifications_zone_pointage (entreprise_id, session_id, employe_id, chantier_id, latitude, longitude, distance_metres, dans_zone, created_at)
select s.entreprise_id, s.id, s.employe_id, s.chantier_id, 45.75, 4.85, (k * 17) % 500, (k % 5) <> 0, s.arrivee_at + k * interval '30 minutes'
from public.sessions_pointage s, generate_series(1, 2) k
where s.tache = 'CHARGE-PT-V1';

analyze public.pointages;
analyze public.sessions_pointage;
analyze public.verifications_zone_pointage;

select (select count(*) from public.pointages where tache = 'CHARGE-PT-V1') as pointages,
       (select count(*) from public.sessions_pointage where tache = 'CHARGE-PT-V1') as sessions,
       (select count(*) from public.verifications_zone_pointage v join public.sessions_pointage s on s.id = v.session_id where s.tache = 'CHARGE-PT-V1') as controles,
       (select count(*) from _charge_emp) as salaries;
