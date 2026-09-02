begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc

select ok(not has_function_privilege('authenticated','public.plateforme_transition_operation_remise(uuid,text,jsonb,text,text)','EXECUTE'),'ancienne transition refusée à authenticated');
select ok(not has_function_privilege('authenticated','public.plateforme_finaliser_operation_remise(uuid,jsonb)','EXECUTE'),'ancienne finalisation refusée à authenticated');
select ok(not has_function_privilege('service_role','public.plateforme_finaliser_operation_remise(uuid,jsonb)','EXECUTE'),'ancienne finalisation également refusée au serveur');
select ok(has_function_privilege('authenticated','public.plateforme_commencer_operation_remise(uuid,uuid,text,text,jsonb)','EXECUTE'),'utilisateur peut créer une intention');
select ok(has_function_privilege('authenticated','public.plateforme_demander_reprise_operation_remise(uuid)','EXECUTE'),'utilisateur peut demander une reprise');
select ok(not has_function_privilege('authenticated','public.plateforme_enregistrer_preuve_stripe_serveur(uuid,uuid,integer,jsonb)','EXECUTE'),'ancienne preuve inaccessible à authenticated');
select ok(not has_function_privilege('service_role','public.plateforme_enregistrer_preuve_stripe_serveur(uuid,uuid,integer,jsonb)','EXECUTE'),'ancienne preuve déclarative retirée à service_role');
select ok(not has_function_privilege('service_role','public.plateforme_finaliser_operation_remise_serveur(uuid,uuid,uuid)','EXECUTE'),'ancien finaliseur retiré à service_role');
select ok(has_function_privilege('service_role','public.plateforme_finaliser_operation_remise_attestee_serveur(uuid,uuid,jsonb,text)','EXECUTE'),'R7.2 expose uniquement le finaliseur attesté');
select ok(not has_function_privilege('authenticated','public.plateforme_finaliser_operation_remise_attestee_serveur(uuid,uuid,jsonb,text)','EXECUTE'),'finaliseur attesté inaccessible à authenticated');
select ok(not has_table_privilege('service_role','public.plateforme_operations_remise','UPDATE'),'service_role sans écriture directe registre');
select ok(not has_table_privilege('service_role','public.plateforme_operations_remise_historique','DELETE'),'service_role sans suppression directe historique');
select is((select relforcerowsecurity from pg_class where oid='public.plateforme_verrous_remise_stripe'::regclass),true,'RLS forcée sur les verrous');
select ok(not has_schema_privilege('service_role','stripe_attestation','USAGE'),'autorité attestation absente de PostgREST/service_role');
select is((select count(*) from information_schema.routine_privileges where specific_schema='public' and routine_name like '%attestee%' and grantee='service_role'),1::bigint,'une seule RPC attestée exposée au serveur');

select * from finish();
rollback;
