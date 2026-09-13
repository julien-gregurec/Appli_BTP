-- =====================================================================================================
-- PREUVE pgTAP — GP V1, `enregistrer_devis_brouillon_v2` en SECURITY DEFINER (migration 20260913000293) :
-- gardes explicites d'appartenance (membre, devis, client, chantier), `anon` / `service_role` révoqués.
-- =====================================================================================================
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

\ir fixtures/isolation_multitenant.inc

create or replace function pg_temp.jwt(p_sub uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_sub::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
end $$;

insert into public.devis (id, entreprise_id, numero, client_id, chantier_id, statut, montant_ht, montant_tva, montant_ttc)
values ('a9000000-0000-0000-0000-000000000293', 'a0000000-0000-0000-0000-000000000001', 'PGTAP-A-293', 'a3000000-0000-0000-0000-000000000001', null, 'brouillon', 0, 0, 0);

select is((select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'enregistrer_devis_brouillon_v2'), true, 'la RPC est SECURITY DEFINER');
select ok((select 'search_path=public' = any(proconfig) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'enregistrer_devis_brouillon_v2'), 'search_path figé');
select is(has_function_privilege('anon', 'public.enregistrer_devis_brouillon_v2(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer)', 'execute'), false, 'anon ne peut pas appeler la RPC');
select is(has_function_privilege('service_role', 'public.enregistrer_devis_brouillon_v2(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer)', 'execute'), false, 'service_role ne peut pas appeler la RPC');
select is(has_function_privilege('authenticated', 'public.enregistrer_devis_brouillon_v2(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer)', 'execute'), true, 'authenticated peut appeler la RPC');

-- Dirigeant de A : enregistrement de son brouillon.
select pg_temp.jwt('10000000-0000-0000-0000-000000000006');
select lives_ok($$select public.enregistrer_devis_brouillon_v2('a0000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000293',
  '{"client_id":"a3000000-0000-0000-0000-000000000001","remise_globale":0}'::jsonb, '[]'::jsonb,
  '[{"cle_ligne":"l1","designation":"Ligne A","quantite":2,"prix_unitaire_ht":10,"taux_tva":20,"ordre":1000,"type_ligne":"libre"}]'::jsonb, '[]'::jsonb, 0)$$,
  'A enregistre son propre brouillon');
select is((select montant_ht from public.devis where id = 'a9000000-0000-0000-0000-000000000293'), 20.00::numeric, 'totaux recalculés (20 HT)');

-- Dirigeant de B : le devis de A est introuvable, même en annonçant l'entreprise A ou B.
select pg_temp.jwt('20000000-0000-0000-0000-000000000006');
select throws_ok($$select public.enregistrer_devis_brouillon_v2('b0000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000293',
  '{"client_id":"b3000000-0000-0000-0000-000000000001","remise_globale":0}'::jsonb, '[]'::jsonb,
  '[{"cle_ligne":"x","designation":"Forgé","quantite":1,"prix_unitaire_ht":1,"taux_tva":20,"ordre":1000,"type_ligne":"libre"}]'::jsonb, '[]'::jsonb, null)$$,
  'Devis introuvable', 'B ne peut pas réécrire un devis de A');
select throws_ok($$select public.enregistrer_devis_brouillon_v2('a0000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000293',
  '{"client_id":"a3000000-0000-0000-0000-000000000001","remise_globale":0}'::jsonb, '[]'::jsonb,
  '[{"cle_ligne":"x","designation":"Forgé","quantite":1,"prix_unitaire_ht":1,"taux_tva":20,"ordre":1000,"type_ligne":"libre"}]'::jsonb, '[]'::jsonb, null)$$,
  '42501', null, 'B ne peut pas se faire passer pour A');
-- B ne peut pas rattacher un client de A à son propre devis.
select throws_ok($$select public.enregistrer_devis_brouillon_v2('b0000000-0000-0000-0000-000000000001', null,
  '{"client_id":"a3000000-0000-0000-0000-000000000001","remise_globale":0}'::jsonb, '[]'::jsonb,
  '[{"cle_ligne":"x","designation":"Ligne B","quantite":1,"prix_unitaire_ht":1,"taux_tva":20,"ordre":1000,"type_ligne":"libre"}]'::jsonb, '[]'::jsonb, null)$$,
  'Client introuvable dans cette entreprise.', 'B ne peut pas viser un client de A');
select is((select count(*)::int from public.lignes_devis where devis_id = 'a9000000-0000-0000-0000-000000000293'), 1, 'le devis de A est intact (1 ligne)');

select * from finish();
rollback;
