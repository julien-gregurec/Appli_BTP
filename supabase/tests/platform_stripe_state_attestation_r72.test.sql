begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc

-- Clé Ed25519 exclusivement réservée à ce test transactionnel.
insert into stripe_attestation.configuration(singleton,environment) values(true,'test');
insert into stripe_attestation.public_keys(key_id,environment,public_key,active_from)
values(
  'test-r72-v1','test',
  decode('3632f3c67fde5945a2cf79ecfd6bf632723581544400556ebc5f860d541bc209','hex'),
  '2026-01-01T00:00:00Z'
);

update public.entreprises set
  stripe_subscription_id='sub_r72_a',stripe_customer_id='cus_r72_a'
where id='a0000000-0000-0000-0000-000000000001';
insert into public.abonnements_entreprises(
  entreprise_id,code_offre,version_tarif,periodicite,prix_contractuel_ht,statut,stripe_subscription_id
) values(
  'a0000000-0000-0000-0000-000000000001','pro',1,'mensuel',199,'actif','sub_r72_a'
) on conflict(entreprise_id) do update set stripe_subscription_id=excluded.stripe_subscription_id;

create function pg_temp.r72_payload(
  p_operation uuid,p_action text,p_coupon text,p_jti uuid,
  p_observed_at timestamptz default clock_timestamp(),
  p_expires_at timestamptz default clock_timestamp()+interval '60 seconds'
) returns jsonb language plpgsql as $$
declare o public.plateforme_operations_remise%rowtype; e public.entreprises%rowtype;
begin
  select * into strict o from public.plateforme_operations_remise where id=p_operation;
  select * into strict e from public.entreprises where id=o.entreprise_id;
  return jsonb_build_object(
    'version',1,'key_id','test-r72-v1','environment','test','action',p_action,
    'operation_id',o.id,'intention_id',o.intention_id,'entreprise_id',o.entreprise_id,
    'abonnement_entreprise_id',o.abonnement_entreprise_id,
    'stripe_subscription_id',o.stripe_subscription_id,'stripe_customer_id',e.stripe_customer_id,
    'tentative',o.nombre_tentatives,'generation',o.numero_posts_application,
    'coupon_id',p_coupon,
    'discount_type',case when o.type_operation='application' then o.etat_souhaite->>'type' end,
    'discount_value',case when o.type_operation='application' then (o.etat_souhaite->>'valeur')::numeric end,
    'discount_duration',case when o.type_operation='application' then o.etat_souhaite->>'duree' end,
    'discount_duration_months',case when o.type_operation='application' then (o.etat_souhaite->>'duree_mois')::integer end,
    'observed_at',to_char(p_observed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'expires_at',to_char(p_expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'jti',p_jti
  );
end;
$$;

create function pg_temp.r72_signature(p_payload jsonb)
returns text language sql as $$
  select encode(
    pgsodium.crypto_sign_detached(
      convert_to(stripe_attestation.canonical_payload(p_payload),'UTF8'),
      decode('1444606f985af6d9643a15fd434319a07c5904cc894cb6ecf438ad01227199683632f3c67fde5945a2cf79ecfd6bf632723581544400556ebc5f860d541bc209','hex')
    ),'base64'
  )
$$;

select ok(not has_function_privilege('service_role','public.plateforme_enregistrer_preuve_stripe_serveur(uuid,uuid,integer,jsonb)','EXECUTE'),'ancienne émission JSON retirée à service_role');
select ok(not has_function_privilege('service_role','public.plateforme_finaliser_operation_remise_serveur(uuid,uuid,uuid)','EXECUTE'),'ancien finaliseur retiré à service_role');
select ok(has_function_privilege('service_role','public.plateforme_finaliser_operation_remise_attestee_serveur(uuid,uuid,jsonb,text)','EXECUTE'),'nouveau finaliseur attesté disponible à service_role');
select ok(not has_function_privilege('authenticated','public.plateforme_finaliser_operation_remise_attestee_serveur(uuid,uuid,jsonb,text)','EXECUTE'),'finaliseur attesté interdit à authenticated');
select ok(not has_schema_privilege('service_role','stripe_attestation','USAGE'),'registre de clés invisible à service_role');
select ok(not has_table_privilege('service_role','stripe_attestation.public_keys','SELECT'),'clés publiques hors surface service_role');
select ok(not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname like '%sign%attestation%'),'aucun oracle de signature dans le schéma PostgREST');
select is((select pg_get_userbyid(proowner) from pg_proc where oid='public.plateforme_finaliser_operation_remise_attestee_serveur(uuid,uuid,jsonb,text)'::regprocedure),'elsatia_discount_f4_writer','finaliseur attesté détenu par F4');

-- Intention APPLY légitime, puis orchestration forgeable identique à R7.1.
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
select set_config('test.r72_apply_op',(
  public.plateforme_commencer_operation_remise(
    'a0000000-0000-0000-0000-000000000001','72000000-0000-4000-8000-000000000001',
    'sub_r72_a','application',
    '{"active":true,"type":"pourcentage","valeur":73,"description":"R72 73 %","motif_interne":"test hostile","duree":"once","duree_mois":null}'::jsonb
  )->>'id'),true);
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('test.r72_apply_lock',public.plateforme_acquerir_verrou_remise_serveur('sub_r72_a','r72:apply')::text,true);
select public.plateforme_transition_operation_remise_serveur(current_setting('test.r72_apply_op')::uuid,current_setting('test.r72_apply_lock')::uuid,'stripe_in_progress',null);
select public.plateforme_enregistrer_coupon_operation_remise_serveur(current_setting('test.r72_apply_op')::uuid,current_setting('test.r72_apply_lock')::uuid,'coupon_r72_73');
select public.plateforme_preparer_post_application_remise_serveur(current_setting('test.r72_apply_op')::uuid,current_setting('test.r72_apply_lock')::uuid);
select public.plateforme_transition_operation_remise_serveur(current_setting('test.r72_apply_op')::uuid,current_setting('test.r72_apply_lock')::uuid,'stripe_applied',null);
select throws_like(format(
  'select public.plateforme_enregistrer_preuve_stripe_serveur(%L::uuid,%L::uuid,1,%L::jsonb)',
  current_setting('test.r72_apply_op'),current_setting('test.r72_apply_lock'),'{"coupon_id":"coupon_r72_73"}'
),'%permission denied%','service_role seul ne peut plus émettre la fausse preuve R7.1');
reset role;

select set_config('test.r72_apply_payload',pg_temp.r72_payload(
  current_setting('test.r72_apply_op')::uuid,'APPLY','coupon_r72_73',
  '72000000-0000-4000-8000-000000000011'
)::text,true);
select set_config('test.r72_apply_signature',pg_temp.r72_signature(current_setting('test.r72_apply_payload')::jsonb),true);

set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select throws_like(format(
  'select public.plateforme_finaliser_operation_remise_attestee_serveur(%L::uuid,%L::uuid,%L::jsonb,%L)',
  current_setting('test.r72_apply_op'),current_setting('test.r72_apply_lock'),current_setting('test.r72_apply_payload'),'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=='
),'%Signature Stripe invalide%','signature forgée refusée');
select throws_like(format(
  'select public.plateforme_finaliser_operation_remise_attestee_serveur(%L::uuid,%L::uuid,%L::jsonb,%L)',
  current_setting('test.r72_apply_op'),current_setting('test.r72_apply_lock'),
  jsonb_set(current_setting('test.r72_apply_payload')::jsonb,'{discount_value}','74'::jsonb)::text,
  current_setting('test.r72_apply_signature')
),'%incohérente%','montant falsifié refusé');
select throws_like(format(
  'select public.plateforme_finaliser_operation_remise_attestee_serveur(%L::uuid,%L::uuid,%L::jsonb,%L)',
  current_setting('test.r72_apply_op'),current_setting('test.r72_apply_lock'),
  jsonb_set(current_setting('test.r72_apply_payload')::jsonb,'{operation_id}','"72000000-0000-4000-8000-000000000099"'::jsonb)::text,
  current_setting('test.r72_apply_signature')
),'%autre saga%','preuve croisée refusée');
reset role;

select set_config('test.r72_expired_payload',pg_temp.r72_payload(
  current_setting('test.r72_apply_op')::uuid,'APPLY','coupon_r72_73',
  '72000000-0000-4000-8000-000000000012',clock_timestamp()-interval '3 minutes',clock_timestamp()-interval '2 minutes'
)::text,true);
select set_config('test.r72_expired_signature',pg_temp.r72_signature(current_setting('test.r72_expired_payload')::jsonb),true);
select set_config('test.r72_wrong_env_payload',jsonb_set(
  current_setting('test.r72_apply_payload')::jsonb,'{environment}','"live"'::jsonb
)::text,true);
select set_config('test.r72_wrong_env_signature',pg_temp.r72_signature(current_setting('test.r72_wrong_env_payload')::jsonb),true);
select set_config('test.r72_wrong_action_payload',jsonb_set(
  current_setting('test.r72_apply_payload')::jsonb,'{action}','"REMOVE"'::jsonb
)::text,true);
select set_config('test.r72_wrong_action_signature',pg_temp.r72_signature(current_setting('test.r72_wrong_action_payload')::jsonb),true);

set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select throws_like(format(
  'select public.plateforme_finaliser_operation_remise_attestee_serveur(%L::uuid,%L::uuid,%L::jsonb,%L)',
  current_setting('test.r72_apply_op'),current_setting('test.r72_apply_lock'),current_setting('test.r72_expired_payload'),current_setting('test.r72_expired_signature')
),'%expirée%','preuve expirée refusée');
select throws_like(format(
  'select public.plateforme_finaliser_operation_remise_attestee_serveur(%L::uuid,%L::uuid,%L::jsonb,%L)',
  current_setting('test.r72_apply_op'),current_setting('test.r72_apply_lock'),current_setting('test.r72_wrong_env_payload'),current_setting('test.r72_wrong_env_signature')
),'%Environnement%','preuve test/live croisée refusée');
select throws_like(format(
  'select public.plateforme_finaliser_operation_remise_attestee_serveur(%L::uuid,%L::uuid,%L::jsonb,%L)',
  current_setting('test.r72_apply_op'),current_setting('test.r72_apply_lock'),current_setting('test.r72_wrong_action_payload'),current_setting('test.r72_wrong_action_signature')
),'%Action%','preuve APPLY réutilisée pour REMOVE refusée');
select lives_ok(format(
  'select public.plateforme_finaliser_operation_remise_attestee_serveur(%L::uuid,%L::uuid,%L::jsonb,%L)',
  current_setting('test.r72_apply_op'),current_setting('test.r72_apply_lock'),current_setting('test.r72_apply_payload'),current_setting('test.r72_apply_signature')
),'APPLY nominal finalisé avec attestation valide');
reset role;
select set_config('test.r72_history_after_apply',(select count(*)::text from public.plateforme_operations_remise_historique where operation_id=current_setting('test.r72_apply_op')::uuid),true);
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select lives_ok(format(
  'select public.plateforme_finaliser_operation_remise_attestee_serveur(%L::uuid,%L::uuid,%L::jsonb,%L)',
  current_setting('test.r72_apply_op'),current_setting('test.r72_apply_lock'),current_setting('test.r72_apply_payload'),current_setting('test.r72_apply_signature')
),'replay exact retourne idempotemment le résultat');
select ok(public.plateforme_relacher_verrou_remise_serveur('sub_r72_a',current_setting('test.r72_apply_lock')::uuid),'verrou APPLY libéré');
reset role;

select is((select remise_stripe_coupon_id from public.entreprises where id='a0000000-0000-0000-0000-000000000001'),'coupon_r72_73','coupon attesté réellement persisté');
select is((select remise_valeur from public.entreprises where id='a0000000-0000-0000-0000-000000000001'),73::numeric,'montant attesté réellement persisté');
select is((select statut from public.plateforme_operations_remise where id=current_setting('test.r72_apply_op')::uuid),'completed','completed seulement après persistence');
select is((select count(*) from public.plateforme_operations_remise_historique where operation_id=current_setting('test.r72_apply_op')::uuid),current_setting('test.r72_history_after_apply')::bigint,'replay sans second historique');
select is((select count(*) from stripe_attestation.consumed_attestations where operation_id=current_setting('test.r72_apply_op')::uuid),1::bigint,'jti consommé exactement une fois');

-- REMOVE nominal utilise une nouvelle action et une nouvelle attestation.
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
select set_config('test.r72_remove_op',(
  public.plateforme_commencer_operation_remise(
    'a0000000-0000-0000-0000-000000000001','72000000-0000-4000-8000-000000000002',
    'sub_r72_a','retrait','{"active":false}'::jsonb
  )->>'id'),true);
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('test.r72_remove_lock',public.plateforme_acquerir_verrou_remise_serveur('sub_r72_a','r72:remove')::text,true);
select public.plateforme_transition_operation_remise_serveur(current_setting('test.r72_remove_op')::uuid,current_setting('test.r72_remove_lock')::uuid,'stripe_in_progress',null);
select public.plateforme_transition_operation_remise_serveur(current_setting('test.r72_remove_op')::uuid,current_setting('test.r72_remove_lock')::uuid,'stripe_removed',null);
reset role;
select set_config('test.r72_remove_payload',pg_temp.r72_payload(
  current_setting('test.r72_remove_op')::uuid,'REMOVE',null,'72000000-0000-4000-8000-000000000021'
)::text,true);
select set_config('test.r72_remove_signature',pg_temp.r72_signature(current_setting('test.r72_remove_payload')::jsonb),true);
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select lives_ok(format(
  'select public.plateforme_finaliser_operation_remise_attestee_serveur(%L::uuid,%L::uuid,%L::jsonb,%L)',
  current_setting('test.r72_remove_op'),current_setting('test.r72_remove_lock'),current_setting('test.r72_remove_payload'),current_setting('test.r72_remove_signature')
),'REMOVE nominal finalisé avec sa propre attestation');
select ok(public.plateforme_relacher_verrou_remise_serveur('sub_r72_a',current_setting('test.r72_remove_lock')::uuid),'verrou REMOVE libéré');
reset role;
select is((select remise_stripe_coupon_id from public.entreprises where id='a0000000-0000-0000-0000-000000000001'),null,'REMOVE attesté converge en SQL');
select is((select statut from public.plateforme_operations_remise where id=current_setting('test.r72_remove_op')::uuid),'completed','saga REMOVE completed');
select is((select count(*) from public.historique_tarification where entreprise_id='a0000000-0000-0000-0000-000000000001' and action='remise_retiree'),1::bigint,'REMOVE historisé une seule fois');

-- Une nouvelle application permet ensuite de vérifier EXPIRATION_SYNC sans
-- aucune frontière webhook plus faible.
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
select set_config('test.r72_apply2_op',(
  public.plateforme_commencer_operation_remise(
    'a0000000-0000-0000-0000-000000000001','72000000-0000-4000-8000-000000000003',
    'sub_r72_a','application',
    '{"active":true,"type":"pourcentage","valeur":10,"description":"Expiration","motif_interne":"test expiration","duree":"forever","duree_mois":null}'::jsonb
  )->>'id'),true);
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('test.r72_apply2_lock',public.plateforme_acquerir_verrou_remise_serveur('sub_r72_a','r72:apply2')::text,true);
select public.plateforme_transition_operation_remise_serveur(current_setting('test.r72_apply2_op')::uuid,current_setting('test.r72_apply2_lock')::uuid,'stripe_in_progress',null);
select public.plateforme_enregistrer_coupon_operation_remise_serveur(current_setting('test.r72_apply2_op')::uuid,current_setting('test.r72_apply2_lock')::uuid,'coupon_r72_expiration');
select public.plateforme_preparer_post_application_remise_serveur(current_setting('test.r72_apply2_op')::uuid,current_setting('test.r72_apply2_lock')::uuid);
select public.plateforme_transition_operation_remise_serveur(current_setting('test.r72_apply2_op')::uuid,current_setting('test.r72_apply2_lock')::uuid,'stripe_applied',null);
reset role;
select set_config('test.r72_apply2_payload',pg_temp.r72_payload(current_setting('test.r72_apply2_op')::uuid,'APPLY','coupon_r72_expiration','72000000-0000-4000-8000-000000000031')::text,true);
select set_config('test.r72_apply2_signature',pg_temp.r72_signature(current_setting('test.r72_apply2_payload')::jsonb),true);
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select lives_ok(format(
  'select public.plateforme_finaliser_operation_remise_attestee_serveur(%L::uuid,%L::uuid,%L::jsonb,%L)',
  current_setting('test.r72_apply2_op'),current_setting('test.r72_apply2_lock'),current_setting('test.r72_apply2_payload'),current_setting('test.r72_apply2_signature')
),'seconde application attestée pour préparer expiration');
select ok(public.plateforme_relacher_verrou_remise_serveur('sub_r72_a',current_setting('test.r72_apply2_lock')::uuid),'verrou seconde application libéré');

select set_config('test.r72_exp_lock',public.plateforme_acquerir_verrou_remise_serveur('sub_r72_a','r72:expiration')::text,true);
select set_config('test.r72_exp_op',(
  public.plateforme_commencer_expiration_remise_serveur(
    'a0000000-0000-0000-0000-000000000001','sub_r72_a',current_setting('test.r72_exp_lock')::uuid
  )->>'id'),true);
select public.plateforme_transition_operation_remise_serveur(current_setting('test.r72_exp_op')::uuid,current_setting('test.r72_exp_lock')::uuid,'stripe_in_progress',null);
select public.plateforme_transition_operation_remise_serveur(current_setting('test.r72_exp_op')::uuid,current_setting('test.r72_exp_lock')::uuid,'stripe_removed',null);
reset role;
select set_config('test.r72_exp_payload',pg_temp.r72_payload(current_setting('test.r72_exp_op')::uuid,'EXPIRATION_SYNC',null,'72000000-0000-4000-8000-000000000032')::text,true);
select set_config('test.r72_exp_signature',pg_temp.r72_signature(current_setting('test.r72_exp_payload')::jsonb),true);
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select lives_ok(format(
  'select public.plateforme_finaliser_operation_remise_attestee_serveur(%L::uuid,%L::uuid,%L::jsonb,%L)',
  current_setting('test.r72_exp_op'),current_setting('test.r72_exp_lock'),current_setting('test.r72_exp_payload'),current_setting('test.r72_exp_signature')
),'EXPIRATION_SYNC passe par le même finaliseur attesté');
select ok(public.plateforme_relacher_verrou_remise_serveur('sub_r72_a',current_setting('test.r72_exp_lock')::uuid),'verrou expiration libéré');
reset role;
select is((select remise_stripe_coupon_id from public.entreprises where id='a0000000-0000-0000-0000-000000000001'),null,'expiration attestée converge en SQL');
select is((select statut from public.plateforme_operations_remise where id=current_setting('test.r72_exp_op')::uuid),'completed','saga expiration completed après persistence');
select is((select count(*) from public.historique_tarification where entreprise_id='a0000000-0000-0000-0000-000000000001' and action='remise_expiree'),1::bigint,'expiration attestée historisée une seule fois');

select * from finish();
rollback;
