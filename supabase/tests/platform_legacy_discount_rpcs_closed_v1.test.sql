begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc

update public.entreprises set stripe_subscription_id='sub-r7-canonique'
where id='a0000000-0000-0000-0000-000000000001';
insert into public.abonnements_entreprises(
  entreprise_id,code_offre,version_tarif,periodicite,prix_contractuel_ht,statut,stripe_subscription_id
) values('a0000000-0000-0000-0000-000000000001','pro',1,'mensuel',199,'actif','sub-r7-canonique')
on conflict(entreprise_id) do update set stripe_subscription_id=excluded.stripe_subscription_id;

select ok(not exists(select 1 from information_schema.routine_privileges where specific_schema='public' and routine_name='plateforme_appliquer_remise' and grantee='PUBLIC' and privilege_type='EXECUTE'),'PUBLIC ne peut plus appliquer une remise legacy');
select ok(not has_function_privilege('anon','public.plateforme_appliquer_remise(uuid,text,text,text,integer,text,numeric)','EXECUTE'),'anon ne peut plus appliquer une remise legacy');
select ok(not has_function_privilege('authenticated','public.plateforme_appliquer_remise(uuid,text,text,text,integer,text,numeric)','EXECUTE'),'authenticated ne peut plus appliquer une remise legacy');
select ok(not has_function_privilege('service_role','public.plateforme_appliquer_remise(uuid,text,text,text,integer,text,numeric)','EXECUTE'),'service_role ne dispose d’aucun raccourci legacy d’application');
select ok(not exists(select 1 from information_schema.routine_privileges where specific_schema='public' and routine_name='plateforme_retirer_remise' and grantee='PUBLIC' and privilege_type='EXECUTE'),'PUBLIC ne peut plus retirer une remise legacy');
select ok(not has_function_privilege('anon','public.plateforme_retirer_remise(uuid)','EXECUTE'),'anon ne peut plus retirer une remise legacy');
select ok(not has_function_privilege('authenticated','public.plateforme_retirer_remise(uuid)','EXECUTE'),'authenticated ne peut plus retirer une remise legacy');
select ok(not has_function_privilege('service_role','public.plateforme_retirer_remise(uuid)','EXECUTE'),'service_role ne dispose d’aucun raccourci legacy de retrait');

set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
select throws_like(
  $$select public.plateforme_appliquer_remise('a0000000-0000-0000-0000-000000000001','coupon-r7-faux','Fausse remise R7','contournement',null,'pourcentage',42)$$,
  '%permission denied%','total AAL2 ne peut plus appliquer directement une fausse remise'
);
select throws_like(
  $$select public.plateforme_retirer_remise('a0000000-0000-0000-0000-000000000001')$$,
  '%permission denied%','total AAL2 ne peut plus retirer directement une remise'
);

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
select throws_like(
  $$select public.plateforme_appliquer_remise('a0000000-0000-0000-0000-000000000001','coupon-r7-non-total','Fausse remise','contournement',null,'pourcentage',42)$$,
  '%permission denied%','authenticated non-total est également refusé par privilège'
);
reset role;

set local role anon;
select throws_like(
  $$select public.plateforme_appliquer_remise('a0000000-0000-0000-0000-000000000001','coupon-r7-anon','Fausse remise','contournement',null,'pourcentage',42)$$,
  '%permission denied%','anon est refusé à l’exécution réelle de la RPC legacy'
);
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select throws_like(
  $$select public.plateforme_appliquer_remise('a0000000-0000-0000-0000-000000000001','coupon-r7-service','Fausse remise','contournement',null,'pourcentage',42)$$,
  '%permission denied%','service_role ne peut pas utiliser le raccourci legacy d’application'
);
select throws_like(
  $$select public.plateforme_retirer_remise('a0000000-0000-0000-0000-000000000001')$$,
  '%permission denied%','service_role ne peut pas utiliser le raccourci legacy de retrait'
);
reset role;

select is((select remise_stripe_coupon_id from public.entreprises where id='a0000000-0000-0000-0000-000000000001'),null,'aucun coupon falsifié après les appels refusés');
select is((select count(*) from public.historique_tarification where entreprise_id='a0000000-0000-0000-0000-000000000001' and action in ('remise_appliquee','remise_retiree')),0::bigint,'aucun faux historique après les appels refusés');
select is((select count(*) from public.plateforme_operations_remise where entreprise_id='a0000000-0000-0000-0000-000000000001'),0::bigint,'un appel legacy refusé ne crée aucune saga');

-- Application canonique : demande utilisateur minimale, puis traitement serveur
-- sous verrou avec checkpoint Stripe lié avant finalisation.
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
select set_config('test.r7_apply_op',(
  public.plateforme_commencer_operation_remise(
    'a0000000-0000-0000-0000-000000000001','f7000000-0000-4000-8000-000000000001',
    'sub-r7-canonique','application',
    '{"active":true,"type":"pourcentage","valeur":10,"description":"10 %","motif_interne":"R7","duree":"forever"}'::jsonb
  )->>'id'),true);
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('test.r7_apply_lock',public.plateforme_acquerir_verrou_remise_serveur('sub-r7-canonique','r7:application')::text,true);
select public.plateforme_transition_operation_remise_serveur(current_setting('test.r7_apply_op')::uuid,current_setting('test.r7_apply_lock')::uuid,'stripe_in_progress',null);
select public.plateforme_enregistrer_coupon_operation_remise_serveur(current_setting('test.r7_apply_op')::uuid,current_setting('test.r7_apply_lock')::uuid,'coupon-r7-canonique');
select public.plateforme_transition_operation_remise_serveur(current_setting('test.r7_apply_op')::uuid,current_setting('test.r7_apply_lock')::uuid,'stripe_applied',null);
select set_config('test.r7_apply_proof',(
  public.plateforme_enregistrer_preuve_stripe_serveur(
    current_setting('test.r7_apply_op')::uuid,current_setting('test.r7_apply_lock')::uuid,1,
    '{"coupon_id":"coupon-r7-canonique"}'::jsonb
  )->>'preuve_serveur_id'),true);
select lives_ok(format(
  'select public.plateforme_finaliser_operation_remise_serveur(%L::uuid,%L::uuid,%L::uuid)',
  current_setting('test.r7_apply_op'),current_setting('test.r7_apply_lock'),current_setting('test.r7_apply_proof')
),'application canonique finalisée par preuve serveur');
select public.plateforme_relacher_verrou_remise_serveur('sub-r7-canonique',current_setting('test.r7_apply_lock')::uuid);
reset role;
select is((select remise_stripe_coupon_id from public.entreprises where id='a0000000-0000-0000-0000-000000000001'),'coupon-r7-canonique','application canonique persiste uniquement le coupon prouvé');
select is((select statut from public.plateforme_operations_remise where id=current_setting('test.r7_apply_op')::uuid),'completed','saga d’application canonique terminée');

-- Retrait canonique par une nouvelle intention et une preuve serveur d’absence.
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
select set_config('test.r7_remove_op',(
  public.plateforme_commencer_operation_remise(
    'a0000000-0000-0000-0000-000000000001','f7000000-0000-4000-8000-000000000002',
    'sub-r7-canonique','retrait','{"active":false}'::jsonb
  )->>'id'),true);
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('test.r7_remove_lock',public.plateforme_acquerir_verrou_remise_serveur('sub-r7-canonique','r7:retrait')::text,true);
select public.plateforme_transition_operation_remise_serveur(current_setting('test.r7_remove_op')::uuid,current_setting('test.r7_remove_lock')::uuid,'stripe_in_progress',null);
select public.plateforme_transition_operation_remise_serveur(current_setting('test.r7_remove_op')::uuid,current_setting('test.r7_remove_lock')::uuid,'stripe_removed',null);
select set_config('test.r7_remove_proof',(
  public.plateforme_enregistrer_preuve_stripe_serveur(
    current_setting('test.r7_remove_op')::uuid,current_setting('test.r7_remove_lock')::uuid,1,
    '{"coupon_id":null}'::jsonb
  )->>'preuve_serveur_id'),true);
select lives_ok(format(
  'select public.plateforme_finaliser_operation_remise_serveur(%L::uuid,%L::uuid,%L::uuid)',
  current_setting('test.r7_remove_op'),current_setting('test.r7_remove_lock'),current_setting('test.r7_remove_proof')
),'retrait canonique finalisé par preuve serveur');
select public.plateforme_relacher_verrou_remise_serveur('sub-r7-canonique',current_setting('test.r7_remove_lock')::uuid);
reset role;
select is((select remise_stripe_coupon_id from public.entreprises where id='a0000000-0000-0000-0000-000000000001'),null,'retrait canonique persiste uniquement l’absence prouvée');
select is((select statut from public.plateforme_operations_remise where id=current_setting('test.r7_remove_op')::uuid),'completed','saga de retrait canonique terminée');
select is((select count(*) from public.historique_tarification where entreprise_id='a0000000-0000-0000-0000-000000000001' and action='remise_appliquee'),1::bigint,'un seul historique d’application canonique');
select is((select count(*) from public.historique_tarification where entreprise_id='a0000000-0000-0000-0000-000000000001' and action='remise_retiree'),1::bigint,'un seul historique de retrait canonique');

select ok(has_function_privilege('service_role','public.plateforme_enregistrer_preuve_stripe_serveur(uuid,uuid,integer,jsonb)','EXECUTE'),'checkpoint F4 reste service_role only');
select ok(not has_function_privilege('authenticated','public.plateforme_enregistrer_preuve_stripe_serveur(uuid,uuid,integer,jsonb)','EXECUTE'),'checkpoint F4 reste interdit à authenticated');
select ok(has_function_privilege('service_role','public.plateforme_finaliser_operation_remise_serveur(uuid,uuid,uuid)','EXECUTE'),'finaliseur F4 reste service_role only');
select ok(not has_function_privilege('authenticated','public.plateforme_finaliser_operation_remise_serveur(uuid,uuid,uuid)','EXECUTE'),'finaliseur F4 reste interdit à authenticated');

select * from finish();
rollback;
