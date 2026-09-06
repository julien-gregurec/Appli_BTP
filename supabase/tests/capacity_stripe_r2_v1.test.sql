begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public','operations_capacite_stripe','registre durable présent');
select has_column('public','entreprises','capacite_personnes_future','quantité future exposable à l UX');
select has_column('public','entreprises','capacite_personnes_future_at','date d effet future présente');
select has_function('public','plateforme_commencer_operation_capacite_stripe_serveur',array['uuid','uuid','integer','text','text','text','uuid','timestamp with time zone'],'RPC de création serveur présente');
select has_function('public','plateforme_synchroniser_capacite_personnes_stripe_serveur',array['uuid','text','text','text','integer','text','text'],'RPC webhook présente');

select ok(has_function_privilege('service_role','public.plateforme_synchroniser_capacite_personnes_stripe_serveur(uuid,text,text,text,integer,text,text)','EXECUTE'),'service_role peut synchroniser via RPC bornée');
select ok(not has_function_privilege('authenticated','public.plateforme_synchroniser_capacite_personnes_stripe_serveur(uuid,text,text,text,integer,text,text)','EXECUTE'),'authenticated ne peut pas appeler la RPC webhook');
select ok(not has_table_privilege('authenticated','public.operations_capacite_stripe','SELECT'),'registre privé pour authenticated');
select ok(not has_table_privilege('service_role','public.operations_capacite_stripe','SELECT'),'service_role passe uniquement par RPC');

select matches(pg_get_functiondef('public.plateforme_commencer_operation_capacite_stripe_serveur(uuid,uuid,integer,text,text,text,uuid,timestamp with time zone)'::regprocedure),'pg_advisory_xact_lock','création sérialisée par entreprise');
select matches(pg_get_indexdef('public.operations_capacite_stripe_active_entreprise_idx'::regclass),'WHERE.*statut','une seule opération active par entreprise');
select matches(pg_get_functiondef('public.plateforme_synchroniser_capacite_personnes_stripe_serveur(uuid,text,text,text,integer,text,text)'::regprocedure),'plateforme_definir_capacite_personnes_supplementaire','webhook finalise via la RPC R1');

\ir fixtures/isolation_multitenant.inc
update public.entreprises set stripe_subscription_id='sub_capacity_test',capacite_personnes_supplementaire=2
where id='a0000000-0000-0000-0000-000000000001';

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select lives_ok($$select public.plateforme_commencer_operation_capacite_stripe_serveur(
  '25700000-0000-4000-8000-000000000001','a0000000-0000-0000-0000-000000000001',5,
  'sub_capacity_test','price_capacity_mini','utilisateur','10000000-0000-0000-0000-000000000001',null
)$$,'hausse durable créée');
reset role;
select is((select statut from public.operations_capacite_stripe where id='25700000-0000-4000-8000-000000000001'),'en_attente','hausse en attente avant Stripe');
set local role service_role;
select throws_ok($$select public.plateforme_commencer_operation_capacite_stripe_serveur(
  '25700000-0000-4000-8000-000000000002','a0000000-0000-0000-0000-000000000001',6,
  'sub_capacity_test','price_capacity_mini','utilisateur','10000000-0000-0000-0000-000000000001',null
)$$,'55P03',null,'concurrence refusée par opération active');
select lives_ok($$select public.plateforme_synchroniser_capacite_personnes_stripe_serveur(
  'a0000000-0000-0000-0000-000000000001','sub_capacity_test','si_capacity','price_capacity_mini',5,'evt_capacity','active'
)$$,'observation Stripe conforme finalisée');
reset role;
select is((select capacite_personnes_supplementaire from public.entreprises where id='a0000000-0000-0000-0000-000000000001'),5,'capacité DB finalisée après Stripe');
select is((select statut from public.operations_capacite_stripe where id='25700000-0000-4000-8000-000000000001'),'appliquee','opération finalisée');
select is((select count(*) from public.historique_capacite_personnes where reference_externe='si_capacity'),1::bigint,'historique écrit une seule fois');
set local role service_role;
select lives_ok($$select public.plateforme_commencer_operation_capacite_stripe_serveur(
  '25700000-0000-4000-8000-000000000003','a0000000-0000-0000-0000-000000000001',1,
  'sub_capacity_test','price_capacity_mini','utilisateur','10000000-0000-0000-0000-000000000001',now()+interval '1 day'
)$$,'baisse différée créée');
reset role;
select is((select capacite_personnes_future from public.entreprises where id='a0000000-0000-0000-0000-000000000001'),1,'baisse future visible sans réduire la capacité courante');
select is((select capacite_personnes_supplementaire from public.entreprises where id='a0000000-0000-0000-0000-000000000001'),5,'personnes et capacité courante conservées avant échéance');

select * from finish();
rollback;
