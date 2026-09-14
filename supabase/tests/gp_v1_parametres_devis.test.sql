-- PREUVE pgTAP — GP V1, réglages de devis par entreprise (migration 20260913000295).
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();
\ir fixtures/isolation_multitenant.inc
create or replace function pg_temp.jwt(p_sub uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', p_sub::text, true); perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true); end $$;

select has_table('public', 'parametres_devis', 'table des réglages de devis');
-- Dirigeant de A (gerer_parametres) écrit ; le conducteur de A (sans) ne peut pas ; B ne voit pas A.
select pg_temp.jwt('10000000-0000-0000-0000-000000000006');
set local role authenticated;
select lives_ok($$insert into public.parametres_devis (entreprise_id, validite_jours, conditions_defaut, unite_defaut, taux_tva_defaut, rappel_sauvegarde_actif, rappel_sauvegarde_minutes)
  values ('a0000000-0000-0000-0000-000000000001', 45, 'Devis valable 45 jours.', 'm²', 10, true, 5)$$, 'A : le dirigeant enregistre ses réglages');
select is((select validite_jours from public.parametres_devis where entreprise_id = 'a0000000-0000-0000-0000-000000000001'), 45, 'A relit ses réglages');
select throws_ok($$update public.parametres_devis set rappel_sauvegarde_minutes = 0 where entreprise_id = 'a0000000-0000-0000-0000-000000000001'$$, '23514', null, 'fréquence < 1 min refusée');
select throws_ok($$update public.parametres_devis set validite_jours = 400 where entreprise_id = 'a0000000-0000-0000-0000-000000000001'$$, '23514', null, 'validité > 365 jours refusée');
select throws_ok($$update public.parametres_devis set taux_tva_defaut = 101 where entreprise_id = 'a0000000-0000-0000-0000-000000000001'$$, '23514', null, 'TVA > 100 refusée');
reset role;
select pg_temp.jwt('10000000-0000-0000-0000-000000000004');
set local role authenticated;
select is((select count(*)::int from public.parametres_devis where entreprise_id = 'a0000000-0000-0000-0000-000000000001'), 1, 'le conducteur de A lit les réglages de A');
update public.parametres_devis set validite_jours = 60 where entreprise_id = 'a0000000-0000-0000-0000-000000000001';
select is((select validite_jours from public.parametres_devis where entreprise_id = 'a0000000-0000-0000-0000-000000000001'), 45, 'le conducteur de A ne modifie pas (la politique RLS ignore sa mise à jour)');
reset role;
select pg_temp.jwt('20000000-0000-0000-0000-000000000006');
set local role authenticated;
select is((select count(*)::int from public.parametres_devis where entreprise_id = 'a0000000-0000-0000-0000-000000000001'), 0, 'B ne voit pas les réglages de A');
select throws_ok($$insert into public.parametres_devis (entreprise_id) values ('a0000000-0000-0000-0000-000000000001')$$, '42501', null, 'B ne peut pas écrire pour A');
reset role;
select * from finish();
rollback;
