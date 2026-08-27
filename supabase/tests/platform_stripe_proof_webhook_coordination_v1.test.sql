begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc

update public.entreprises set stripe_subscription_id='sub-f4-a'
where id='a0000000-0000-0000-0000-000000000001';

select ok(not has_function_privilege('authenticated','public.plateforme_transition_operation_remise(uuid,text,jsonb,text,text)','EXECUTE'),'ancienne transition refusée à authenticated');
select ok(not has_function_privilege('authenticated','public.plateforme_finaliser_operation_remise(uuid,jsonb)','EXECUTE'),'ancienne finalisation refusée à authenticated');
select ok(not has_function_privilege('service_role','public.plateforme_finaliser_operation_remise(uuid,jsonb)','EXECUTE'),'ancienne finalisation également refusée au serveur');
select ok(has_function_privilege('authenticated','public.plateforme_commencer_operation_remise(uuid,uuid,text,text,jsonb)','EXECUTE'),'utilisateur peut créer une intention');
select ok(has_function_privilege('authenticated','public.plateforme_demander_reprise_operation_remise(uuid)','EXECUTE'),'utilisateur peut demander une reprise');
select ok(not has_function_privilege('authenticated','public.plateforme_enregistrer_preuve_stripe_serveur(uuid,uuid,integer,jsonb)','EXECUTE'),'preuve serveur inaccessible à authenticated');
select ok(has_function_privilege('service_role','public.plateforme_enregistrer_preuve_stripe_serveur(uuid,uuid,integer,jsonb)','EXECUTE'),'preuve réservée à service_role');
select ok(not has_table_privilege('service_role','public.plateforme_operations_remise','UPDATE'),'service_role sans écriture directe registre');
select ok(not has_table_privilege('service_role','public.plateforme_operations_remise_historique','DELETE'),'service_role sans suppression directe historique');
select is((select relforcerowsecurity from pg_class where oid='public.plateforme_verrous_remise_stripe'::regclass),true,'RLS forcée sur les verrous');

set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
select set_config('test.f4_operation',(
  public.plateforme_commencer_operation_remise(
    'a0000000-0000-0000-0000-000000000001','f4100000-0000-4000-8000-000000000001','sub-f4-a','application',
    '{"active":true,"type":"pourcentage","valeur":10,"description":"10 %","motif_interne":"test","duree":"forever","duree_mois":null}'::jsonb
  )->>'id'
),true);
select throws_like(
  $$select public.plateforme_transition_operation_remise(current_setting('test.f4_operation')::uuid,'reconciliation_required','{"coupon_id":"faux"}'::jsonb,'faux',null)$$,
  '%permission denied%','total AAL2 ne peut injecter un checkpoint'
);
select throws_like(
  $$select public.plateforme_finaliser_operation_remise(current_setting('test.f4_operation')::uuid,'{"coupon_id":"faux"}'::jsonb)$$,
  '%permission denied%','total AAL2 ne peut finaliser'
);
reset role;
select is((select statut from public.plateforme_operations_remise where id=current_setting('test.f4_operation')::uuid),'pending','la fausse preuve laisse la saga pending');
select is((select remise_stripe_coupon_id from public.entreprises where id='a0000000-0000-0000-0000-000000000001'),null,'aucune remise falsifiée');
select is((select count(*) from public.plateforme_operations_remise_historique where operation_id=current_setting('test.f4_operation')::uuid),1::bigint,'aucun faux historique');

set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('test.f4_lock',public.plateforme_acquerir_verrou_remise_serveur('sub-f4-a','test:f4')::text,true);
select ok(current_setting('test.f4_lock')::uuid is not null,'serveur acquiert le verrou commun');
select is(public.plateforme_acquerir_verrou_remise_serveur('sub-f4-a','test:concurrent'),null,'un second acteur ne peut acquérir le verrou');
select lives_ok(format(
  $$select public.plateforme_transition_operation_remise_serveur('%s','%s','stripe_in_progress',null)$$,
  current_setting('test.f4_operation'),current_setting('test.f4_lock')
),'serveur démarre la tentative sous verrou');
select lives_ok(format(
  $$select public.plateforme_enregistrer_coupon_operation_remise_serveur('%s','%s','coupon-f4')$$,
  current_setting('test.f4_operation'),current_setting('test.f4_lock')
),'serveur lie le coupon à la tentative');
select lives_ok(format(
  $$select public.plateforme_preparer_post_application_remise_serveur('%s','%s')$$,
  current_setting('test.f4_operation'),current_setting('test.f4_lock')
),'clé POST préparée côté serveur');
select throws_like(format(
  $$select public.plateforme_enregistrer_preuve_stripe_serveur('%s','%s',99,'{"coupon_id":"coupon-f4"}'::jsonb)$$,
  current_setting('test.f4_operation'),current_setting('test.f4_lock')
),'%Tentative obsolète%','une tentative falsifiée est refusée');
select set_config('test.f4_proof',(
  public.plateforme_enregistrer_preuve_stripe_serveur(
    current_setting('test.f4_operation')::uuid,current_setting('test.f4_lock')::uuid,1,'{"coupon_id":"coupon-f4"}'::jsonb
  )->>'preuve_serveur_id'
),true);
select ok(current_setting('test.f4_proof')::uuid is not null,'checkpoint serveur persistant créé');
select lives_ok(format(
  $$select public.plateforme_finaliser_operation_remise_serveur('%s','%s','%s')$$,
  current_setting('test.f4_operation'),current_setting('test.f4_lock'),current_setting('test.f4_proof')
),'finalisation consomme la preuve liée');
select lives_ok(format(
  $$select public.plateforme_finaliser_operation_remise_serveur('%s','%s','%s')$$,
  current_setting('test.f4_operation'),current_setting('test.f4_lock'),current_setting('test.f4_proof')
),'même preuve sur opération completed reste idempotente');
select ok(public.plateforme_relacher_verrou_remise_serveur('sub-f4-a',current_setting('test.f4_lock')::uuid),'verrou libéré explicitement');
reset role;

select is((select statut from public.plateforme_operations_remise where id=current_setting('test.f4_operation')::uuid),'completed','saga finalisée seulement après preuve serveur');
select is((select remise_stripe_coupon_id from public.entreprises where id='a0000000-0000-0000-0000-000000000001'),'coupon-f4','état métier correspond au checkpoint serveur');
select ok((select preuve_intention_id=intention_id and preuve_stripe_subscription_id=stripe_subscription_id and preuve_numero_tentative=nombre_tentatives from public.plateforme_operations_remise where id=current_setting('test.f4_operation')::uuid),'preuve liée à intention, abonnement et tentative');
select throws_like(
  $$delete from public.plateforme_operations_remise_historique where operation_id=current_setting('test.f4_operation')::uuid$$,
  '%immuable%','historique reste append-only'
);
select is((select count(*) from pg_policies where schemaname='public' and tablename in ('plateforme_operations_remise','plateforme_operations_remise_historique','plateforme_verrous_remise_stripe')),0::bigint,'aucune policy applicative sur les registres privés');

select * from finish();
rollback;
