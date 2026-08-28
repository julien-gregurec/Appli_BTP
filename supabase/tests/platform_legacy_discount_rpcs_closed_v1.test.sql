begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc

select ok(not exists(select 1 from information_schema.routine_privileges where specific_schema='public' and routine_name='plateforme_appliquer_remise' and grantee='PUBLIC' and privilege_type='EXECUTE'),'PUBLIC ne peut plus appliquer une remise legacy');
select ok(not has_function_privilege('anon','public.plateforme_appliquer_remise(uuid,text,text,text,integer,text,numeric)','EXECUTE'),'anon ne peut plus appliquer une remise legacy');
select ok(not has_function_privilege('authenticated','public.plateforme_appliquer_remise(uuid,text,text,text,integer,text,numeric)','EXECUTE'),'authenticated ne peut plus appliquer une remise legacy');
select ok(not has_function_privilege('service_role','public.plateforme_appliquer_remise(uuid,text,text,text,integer,text,numeric)','EXECUTE'),'service_role sans raccourci legacy application');
select ok(not exists(select 1 from information_schema.routine_privileges where specific_schema='public' and routine_name='plateforme_retirer_remise' and grantee='PUBLIC' and privilege_type='EXECUTE'),'PUBLIC ne peut plus retirer une remise legacy');
select ok(not has_function_privilege('anon','public.plateforme_retirer_remise(uuid)','EXECUTE'),'anon ne peut plus retirer une remise legacy');
select ok(not has_function_privilege('authenticated','public.plateforme_retirer_remise(uuid)','EXECUTE'),'authenticated ne peut plus retirer une remise legacy');
select ok(not has_function_privilege('service_role','public.plateforme_retirer_remise(uuid)','EXECUTE'),'service_role sans raccourci legacy retrait');

set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
select throws_like(
  $$select public.plateforme_appliquer_remise('a0000000-0000-0000-0000-000000000001','coupon-r7-faux','Fausse remise','contournement',null,'pourcentage',42)$$,
  '%permission denied%','total AAL2 ne peut plus appliquer directement une fausse remise'
);
select throws_like(
  $$select public.plateforme_retirer_remise('a0000000-0000-0000-0000-000000000001')$$,
  '%permission denied%','total AAL2 ne peut plus retirer directement une remise'
);
reset role;

set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select throws_like(
  $$select public.plateforme_appliquer_remise('a0000000-0000-0000-0000-000000000001','coupon-r7-service','Fausse remise','contournement',null,'pourcentage',42)$$,
  '%permission denied%','service_role ne peut pas utiliser le raccourci legacy'
);
select throws_like(
  $$select public.plateforme_enregistrer_preuve_stripe_serveur('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',1,'{"coupon_id":"faux"}'::jsonb)$$,
  '%permission denied%','service_role ne peut plus transformer un JSON en preuve'
);
reset role;

select is((select remise_stripe_coupon_id from public.entreprises where id='a0000000-0000-0000-0000-000000000001'),null,'aucun coupon falsifié après appels refusés');
select is((select count(*) from public.historique_tarification where entreprise_id='a0000000-0000-0000-0000-000000000001' and action in ('remise_appliquee','remise_retiree')),0::bigint,'aucun faux historique après appels refusés');
select is((select count(*) from public.plateforme_operations_remise where entreprise_id='a0000000-0000-0000-0000-000000000001'),0::bigint,'aucune saga créée par appel legacy refusé');
select ok(has_function_privilege('service_role','public.plateforme_finaliser_operation_remise_attestee_serveur(uuid,uuid,jsonb,text)','EXECUTE'),'seul chemin canonique R7.2 attesté disponible');

select * from finish();
rollback;
