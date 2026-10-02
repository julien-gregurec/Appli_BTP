-- ELSATIA-GP-POINTAGES-FACTURE-FIX-V1 — B1 : totaux mensuels des pointages
-- calculés en base (pointages_gestion_totaux_mois, 20261002001105).
--
-- Avant : /pointage/gestion additionnait côté Next les pointages reçus de
-- PostgREST, plafonnés à max_rows = 1 000 → totaux faux au-delà (1 462
-- pointages dans le mois du rapport Performance). Ici : 1 462 pointages dans
-- le mois pour l'entreprise A, plus du bruit hors période et chez B.
--
-- Matrice : existence et droits de la RPC ; vérité DB (superutilisateur) ;
-- PARITÉ STRICTE avec la RLS réelle de `pointages` pour chaque profil (même
-- agrégat calculé sous `authenticated`, RLS appliquée) — c'est la garde contre
-- toute dérive entre la fonction SECURITY DEFINER et les policies ; refus
-- cross-tenant, membre désactivé, entreprise suspendue, anon ; bornes de
-- période ; paramètres invalides.
begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

\ir fixtures/isolation_multitenant.inc

-- 1 462 pointages en août 2026 pour A, répartis sur ses 4 salariés, heures non rondes.
insert into public.pointages (entreprise_id, employe_id, chantier_id, date, heures_normales, heures_supplementaires, tache)
select 'a0000000-0000-0000-0000-000000000001',
       ('a2000000-0000-0000-0000-00000000000' || (1 + g % 4))::uuid,
       'a4000000-0000-0000-0000-000000000001',
       date '2026-08-01' + (g % 31),
       round(1 + ((g * 37) % 787) / 100.0 + 0.07, 2),
       case when g % 3 = 0 then round(((g * 13) % 190) / 100.0 + 0.01, 2) else 0 end,
       'PGTAP-TOTAUX'
from generate_series(0, 1461) g;
-- Bruit : veille et lendemain du mois, et entreprise B dans le même mois.
insert into public.pointages (entreprise_id, employe_id, chantier_id, date, heures_normales, tache) values
  ('a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', '2026-07-31', 7.77, 'PGTAP-HORS'),
  ('a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-000000000001', '2026-09-01', 6.66, 'PGTAP-HORS'),
  ('b0000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002', 'b4000000-0000-0000-0000-000000000001', '2026-08-15', 5.55, 'PGTAP-B');

-- ~70 % des pointages du mois adossés à une session GPS clôturée, 2 contrôles de zone par session.
insert into public.sessions_pointage (entreprise_id, employe_id, chantier_id, arrivee_at, depart_at, pointage_id, tache)
select p.entreprise_id, p.employe_id, p.chantier_id,
       (p.date + time '07:00') at time zone 'Europe/Paris', (p.date + time '16:00') at time zone 'Europe/Paris', p.id, 'PGTAP-TOTAUX'
from (select p.*, row_number() over (order by p.id) as rn from public.pointages p where p.tache = 'PGTAP-TOTAUX') p
where p.rn % 10 < 7;
insert into public.verifications_zone_pointage (entreprise_id, session_id, employe_id, chantier_id, latitude, longitude, distance_metres, dans_zone, created_at)
select s.entreprise_id, s.id, s.employe_id, s.chantier_id, 45.75, 4.85, 12, true, s.arrivee_at + k * interval '1 hour'
from public.sessions_pointage s, generate_series(1, 2) k where s.tache = 'PGTAP-TOTAUX';

create temp table verite as
select employe_id, count(*) as nb, sum(heures_normales) as hn, sum(heures_supplementaires) as hs
from public.pointages
where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and date between '2026-08-01' and '2026-08-31'
group by employe_id;
grant select on verite to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Surface et droits.
-- ───────────────────────────────────────────────────────────────────────────
select has_function('public', 'pointages_gestion_totaux_mois', array['uuid', 'date', 'date'],
  '1. la RPC pointages_gestion_totaux_mois(uuid, date, date) existe');
select is(has_function_privilege('anon', 'public.pointages_gestion_totaux_mois(uuid, date, date)', 'execute'), false,
  '2. anon n''a pas EXECUTE');
select is(has_function_privilege('authenticated', 'public.pointages_gestion_totaux_mois(uuid, date, date)', 'execute'), true,
  '3. authenticated a EXECUTE');
select is((select sum(nb)::int from verite), 1462, '4. jeu de test : 1 462 pointages dans le mois (> 1 000)');

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Dirigeant A : vérité DB exacte.
-- ───────────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}', true);

select results_eq(
  $$select employe_id, nb_pointages, heures_normales, heures_supplementaires, heures_total
    from public.pointages_gestion_totaux_mois('a0000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31') order by employe_id$$,
  $$select employe_id, nb, hn, hs, hn + hs from verite order by employe_id$$,
  '5. dirigeant A : totaux par salarié = vérité DB (superutilisateur), au centième');
select is(
  (select sum(nb_pointages)::int from public.pointages_gestion_totaux_mois('a0000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31')),
  1462, '6. dirigeant A : 1 462 pointages comptés, aucun tronqué');
select is(
  (select sum(heures_total) from public.pointages_gestion_totaux_mois('a0000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31')),
  (select sum(hn + hs) from verite), '7. dirigeant A : total général d''heures exact');
select is(
  (select string_agg(prenom || ' ' || nom, ',') from public.pointages_gestion_totaux_mois('a0000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31')),
  'Admin A,Chef équipe A,Conducteur A,Ouvrier A', '8. noms joints et tri par nom puis prénom');
select is(
  (select heures_total from public.pointages_gestion_totaux_mois('a0000000-0000-0000-0000-000000000001', '2026-07-31', '2026-07-31')),
  7.77::numeric, '9. borne basse : seul le pointage du 31/07 sur la période du 31/07');

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Parité avec la RLS réelle de `pointages`, profil par profil.
-- ───────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq(
  $$select employe_id, nb_pointages, heures_total from public.pointages_gestion_totaux_mois('a0000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31') order by employe_id$$,
  $$select employe_id, count(*), sum(heures_normales + heures_supplementaires) from public.pointages where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and date between '2026-08-01' and '2026-08-31' group by employe_id order by employe_id$$,
  '10. parité RLS : admin A');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select results_eq(
  $$select employe_id, nb_pointages, heures_total from public.pointages_gestion_totaux_mois('a0000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31') order by employe_id$$,
  $$select employe_id, count(*), sum(heures_normales + heures_supplementaires) from public.pointages where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and date between '2026-08-01' and '2026-08-31' group by employe_id order by employe_id$$,
  '11. parité RLS : ouvrier A');
select is(
  (select array_agg(employe_id::text) from public.pointages_gestion_totaux_mois('a0000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31')),
  array['a2000000-0000-0000-0000-000000000002'], '12. ouvrier A : ne voit que son propre total');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select results_eq(
  $$select employe_id, nb_pointages, heures_total from public.pointages_gestion_totaux_mois('a0000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31') order by employe_id$$,
  $$select employe_id, count(*), sum(heures_normales + heures_supplementaires) from public.pointages where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and date between '2026-08-01' and '2026-08-31' group by employe_id order by employe_id$$,
  '13. parité RLS : chef d''équipe A');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select results_eq(
  $$select employe_id, nb_pointages, heures_total from public.pointages_gestion_totaux_mois('a0000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31') order by employe_id$$,
  $$select employe_id, count(*), sum(heures_normales + heures_supplementaires) from public.pointages where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and date between '2026-08-01' and '2026-08-31' group by employe_id order by employe_id$$,
  '14. parité RLS : conducteur A');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select results_eq(
  $$select employe_id, nb_pointages, heures_total from public.pointages_gestion_totaux_mois('a0000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31') order by employe_id$$,
  $$select employe_id, count(*), sum(heures_normales + heures_supplementaires) from public.pointages where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and date between '2026-08-01' and '2026-08-31' group by employe_id order by employe_id$$,
  '15. parité RLS : comptable A');
select is(
  (select count(*)::int from public.pointages_gestion_totaux_mois('a0000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31')),
  0, '16. comptable A (aucun droit pointage, pas salarié) : aucun total visible');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select results_eq(
  $$select employe_id, nb_pointages, heures_total from public.pointages_gestion_totaux_mois('a0000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31') order by employe_id$$,
  $$select employe_id, count(*), sum(heures_normales + heures_supplementaires) from public.pointages where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and date between '2026-08-01' and '2026-08-31' group by employe_id order by employe_id$$,
  '17. parité RLS : dirigeant A');

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Refus.
-- ───────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select throws_ok($$select * from public.pointages_gestion_totaux_mois('a0000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31')$$,
  '42501', 'POINTAGES_TOTAUX_REFUSES', '18. cross-tenant : dirigeant B refusé sur A');
select is(
  (select heures_total from public.pointages_gestion_totaux_mois('b0000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31')),
  5.55::numeric, '19. dirigeant B : voit uniquement les pointages de B (5,55 h)');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select throws_ok($$select * from public.pointages_gestion_totaux_mois('a0000000-0000-0000-0000-000000000001', '2026-08-31', '2026-08-01')$$,
  '22023', 'POINTAGES_TOTAUX_PERIODE', '20. période inversée refusée');
select throws_ok($$select * from public.pointages_gestion_totaux_mois('a0000000-0000-0000-0000-000000000001', '2024-01-01', '2026-08-31')$$,
  '22023', 'POINTAGES_TOTAUX_PERIODE', '21. période > 366 jours refusée');
select throws_ok($$select * from public.pointages_gestion_totaux_mois(null, '2026-08-01', '2026-08-31')$$,
  '22023', 'POINTAGES_TOTAUX_PARAMETRES', '22. entreprise absente refusée');
reset role;

-- Membre désactivé.
select set_config('request.jwt.claims', '', true);
update public.utilisateurs_entreprises set statut = 'desactive'
 where utilisateur_id = '10000000-0000-0000-0000-000000000004' and entreprise_id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select throws_ok($$select * from public.pointages_gestion_totaux_mois('a0000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31')$$,
  '42501', 'POINTAGES_TOTAUX_REFUSES', '23. membre désactivé refusé');
reset role;

-- Entreprise suspendue.
select set_config('request.jwt.claims', '', true);
update public.entreprises set abonnement_statut = 'suspendu' where id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select throws_ok($$select * from public.pointages_gestion_totaux_mois('a0000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31')$$,
  '42501', 'POINTAGES_TOTAUX_REFUSES', '24. entreprise suspendue refusée');
reset role;

-- Sans JWT (auth.uid() nul) et anon.
set local role authenticated;
select set_config('request.jwt.claims', '', true);
select throws_ok($$select * from public.pointages_gestion_totaux_mois('b0000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31')$$,
  '42501', 'POINTAGES_TOTAUX_REFUSES', '25. sans identité : refusé');
reset role;
set local role anon;
select throws_ok($$select * from public.pointages_gestion_totaux_mois('b0000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31')$$,
  '42501', null, '26. anon : EXECUTE refusé');
reset role;

select is((select prosecdef from pg_proc where oid = 'public.pointages_gestion_totaux_mois(uuid, date, date)'::regprocedure), true,
  '27. SECURITY DEFINER assumé (visibilité réappliquée par salarié, parité testée ci-dessus)');

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Compteurs (pointages_gestion_compteurs_mois) : vérité DB et parité RLS.
-- ───────────────────────────────────────────────────────────────────────────
reset role;
select set_config('request.jwt.claims', '', true);
update public.entreprises set abonnement_statut = 'actif' where id = 'a0000000-0000-0000-0000-000000000001';
update public.utilisateurs_entreprises set statut = 'actif'
 where utilisateur_id = '10000000-0000-0000-0000-000000000004' and entreprise_id = 'a0000000-0000-0000-0000-000000000001';
create temp table verite_compteurs as
select (select count(*) from public.sessions_pointage where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and arrivee_at between '2026-08-01T00:00:00+02:00' and '2026-08-31T23:59:59+02:00') as s,
       (select count(*) from public.pointages p where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and date between '2026-08-01' and '2026-08-31' and not exists (select 1 from public.sessions_pointage sp where sp.pointage_id = p.id)) as a,
       (select count(*) from public.verifications_zone_pointage where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and created_at between '2026-08-01T00:00:00+02:00' and '2026-08-31T23:59:59+02:00') as c;
grant select on verite_compteurs to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select results_eq(
  $$select nb_sessions, nb_anciennes_saisies, nb_controles from public.pointages_gestion_compteurs_mois('a0000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31', '2026-08-01T00:00:00+02:00', '2026-08-31T23:59:59+02:00')$$,
  $$select s, a, c from verite_compteurs$$,
  '28. compteurs dirigeant A = vérité DB (sessions, anciennes saisies, contrôles)');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq(
  $$select nb_sessions, nb_anciennes_saisies, nb_controles from public.pointages_gestion_compteurs_mois('a0000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31', '2026-08-01T00:00:00+02:00', '2026-08-31T23:59:59+02:00')$$,
  $$select (select count(*) from public.sessions_pointage where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and arrivee_at between '2026-08-01T00:00:00+02:00' and '2026-08-31T23:59:59+02:00'),
           (select count(*) from public.pointages p where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and date between '2026-08-01' and '2026-08-31' and not exists (select 1 from public.sessions_pointage sp where sp.pointage_id = p.id)),
           (select count(*) from public.verifications_zone_pointage where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and created_at between '2026-08-01T00:00:00+02:00' and '2026-08-31T23:59:59+02:00')$$,
  '29. parité RLS des compteurs : admin A');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select results_eq(
  $$select nb_sessions, nb_anciennes_saisies, nb_controles from public.pointages_gestion_compteurs_mois('a0000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31', '2026-08-01T00:00:00+02:00', '2026-08-31T23:59:59+02:00')$$,
  $$select (select count(*) from public.sessions_pointage where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and arrivee_at between '2026-08-01T00:00:00+02:00' and '2026-08-31T23:59:59+02:00'),
           (select count(*) from public.pointages p where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and date between '2026-08-01' and '2026-08-31' and not exists (select 1 from public.sessions_pointage sp where sp.pointage_id = p.id)),
           (select count(*) from public.verifications_zone_pointage where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and created_at between '2026-08-01T00:00:00+02:00' and '2026-08-31T23:59:59+02:00')$$,
  '30. parité RLS des compteurs : ouvrier A');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select results_eq(
  $$select nb_sessions, nb_anciennes_saisies, nb_controles from public.pointages_gestion_compteurs_mois('a0000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31', '2026-08-01T00:00:00+02:00', '2026-08-31T23:59:59+02:00')$$,
  $$select (select count(*) from public.sessions_pointage where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and arrivee_at between '2026-08-01T00:00:00+02:00' and '2026-08-31T23:59:59+02:00'),
           (select count(*) from public.pointages p where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and date between '2026-08-01' and '2026-08-31' and not exists (select 1 from public.sessions_pointage sp where sp.pointage_id = p.id)),
           (select count(*) from public.verifications_zone_pointage where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and created_at between '2026-08-01T00:00:00+02:00' and '2026-08-31T23:59:59+02:00')$$,
  '31. parité RLS des compteurs : chef d''équipe A');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select results_eq(
  $$select nb_sessions, nb_anciennes_saisies, nb_controles from public.pointages_gestion_compteurs_mois('a0000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31', '2026-08-01T00:00:00+02:00', '2026-08-31T23:59:59+02:00')$$,
  $$select (select count(*) from public.sessions_pointage where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and arrivee_at between '2026-08-01T00:00:00+02:00' and '2026-08-31T23:59:59+02:00'),
           (select count(*) from public.pointages p where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and date between '2026-08-01' and '2026-08-31' and not exists (select 1 from public.sessions_pointage sp where sp.pointage_id = p.id)),
           (select count(*) from public.verifications_zone_pointage where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and created_at between '2026-08-01T00:00:00+02:00' and '2026-08-31T23:59:59+02:00')$$,
  '32. parité RLS des compteurs : conducteur A');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select results_eq(
  $$select nb_sessions, nb_anciennes_saisies, nb_controles from public.pointages_gestion_compteurs_mois('a0000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31', '2026-08-01T00:00:00+02:00', '2026-08-31T23:59:59+02:00')$$,
  $$select (select count(*) from public.sessions_pointage where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and arrivee_at between '2026-08-01T00:00:00+02:00' and '2026-08-31T23:59:59+02:00'),
           (select count(*) from public.pointages p where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and date between '2026-08-01' and '2026-08-31' and not exists (select 1 from public.sessions_pointage sp where sp.pointage_id = p.id)),
           (select count(*) from public.verifications_zone_pointage where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and created_at between '2026-08-01T00:00:00+02:00' and '2026-08-31T23:59:59+02:00')$$,
  '33. parité RLS des compteurs : comptable A');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select results_eq(
  $$select nb_sessions, nb_anciennes_saisies, nb_controles from public.pointages_gestion_compteurs_mois('a0000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31', '2026-08-01T00:00:00+02:00', '2026-08-31T23:59:59+02:00')$$,
  $$select (select count(*) from public.sessions_pointage where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and arrivee_at between '2026-08-01T00:00:00+02:00' and '2026-08-31T23:59:59+02:00'),
           (select count(*) from public.pointages p where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and date between '2026-08-01' and '2026-08-31' and not exists (select 1 from public.sessions_pointage sp where sp.pointage_id = p.id)),
           (select count(*) from public.verifications_zone_pointage where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and created_at between '2026-08-01T00:00:00+02:00' and '2026-08-31T23:59:59+02:00')$$,
  '34. parité RLS des compteurs : dirigeant A');
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select throws_ok($$select * from public.pointages_gestion_compteurs_mois('a0000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31', '2026-08-01T00:00:00+02:00', '2026-08-31T23:59:59+02:00')$$,
  '42501', 'POINTAGES_TOTAUX_REFUSES', '35. compteurs : dirigeant B refusé sur A');
reset role;
select is(has_function_privilege('anon', 'public.pointages_gestion_compteurs_mois(uuid, date, date, timestamptz, timestamptz)', 'execute'), false,
  '36. compteurs : anon n''a pas EXECUTE');

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Page des anciennes saisies (pointages_gestion_anciennes_saisies_ids).
-- ───────────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select results_eq(
  $$select id from public.pointages_gestion_anciennes_saisies_ids('a0000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31', 50, 50)$$,
  $$select p.id from public.pointages p where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and date between '2026-08-01' and '2026-08-31' and not exists (select 1 from public.sessions_pointage sp where sp.pointage_id = p.id) order by date desc, id desc limit 50 offset 50$$,
  '37. anciennes saisies, dirigeant A, page 2 : mêmes identifiants et même ordre que l''anti-jointure sous RLS');
select is(
  (select count(*)::int from (select id from public.pointages_gestion_anciennes_saisies_ids('a0000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31', 200, 0)
     union all select id from public.pointages_gestion_anciennes_saisies_ids('a0000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31', 200, 200)
     union all select id from public.pointages_gestion_anciennes_saisies_ids('a0000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31', 200, 400)) t),
  (select a::int from verite_compteurs),
  '38. anciennes saisies : la pagination parcourt exactement toutes les lignes (aucune perdue ni doublée)');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select results_eq(
  $$select id from public.pointages_gestion_anciennes_saisies_ids('a0000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31', 200, 0)$$,
  $$select p.id from public.pointages p where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and date between '2026-08-01' and '2026-08-31' and not exists (select 1 from public.sessions_pointage sp where sp.pointage_id = p.id) order by date desc, id desc limit 200$$,
  '39. anciennes saisies, ouvrier A : parité RLS (ses seuls pointages)');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select is((select count(*)::int from public.pointages_gestion_anciennes_saisies_ids('a0000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31', 200, 0)), 0,
  '40. anciennes saisies, comptable A : aucune ligne');
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select throws_ok($$select * from public.pointages_gestion_anciennes_saisies_ids('a0000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31', 50, 0)$$,
  '42501', 'POINTAGES_TOTAUX_REFUSES', '41. anciennes saisies : dirigeant B refusé sur A');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select throws_ok($$select * from public.pointages_gestion_anciennes_saisies_ids('a0000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31', 5000, 0)$$,
  '22023', 'POINTAGES_TOTAUX_PERIODE', '42. anciennes saisies : taille de page > 200 refusée');
reset role;
select is(has_function_privilege('anon', 'public.pointages_gestion_anciennes_saisies_ids(uuid, date, date, integer, integer)', 'execute'), false,
  '43. anciennes saisies : anon n''a pas EXECUTE');

select * from finish();
rollback;
