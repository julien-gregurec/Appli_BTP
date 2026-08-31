begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

\ir fixtures/isolation_multitenant.inc

select has_table('public', 'tools_monetization_subscriptions', 'la table abonnements Tools existe');
select has_table('public', 'tools_monetization_events', 'le journal idempotent existe');
select has_column('public', 'entitlements_utilisateurs_elsatia', 'external_subscription_id', 'R8 conserve la référence fournisseur normalisée');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$insert into public.tools_monetization_subscriptions(user_id,provider,environment,product_sku,external_product_id,external_subscription_id,status)
    values('10000000-0000-0000-0000-000000000002','stripe','test','tools_pro_monthly','price_fake','sub_fake','active')$$,
  '42501', null, 'le client ne crée pas son abonnement'
);
select throws_ok(
  $$update public.entitlements_utilisateurs_elsatia set expire_le = now() + interval '10 years' where utilisateur_id = auth.uid()$$,
  '42501', null, 'le client ne prolonge pas un entitlement'
);
select throws_like(
  $$select public.tools_server_appliquer_abonnement('{"user_id":"10000000-0000-0000-0000-000000000002"}'::jsonb)$$,
  '%permission denied%', 'le client ne peut pas appeler le RPC serveur'
);

reset role;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok($$select public.tools_server_appliquer_abonnement(jsonb_build_object(
  'user_id','10000000-0000-0000-0000-000000000002','provider','stripe','environment','test',
  'product_sku','tools_pro_monthly','external_product_id','price_tools_monthly_test',
  'external_subscription_id','sub_tools_test','external_transaction_id','in_test_1','status','active',
  'raw_status','active','purchased_at',now(),'expires_at',now() + interval '1 month',
  'auto_renews',true,'event_type','customer.subscription.created','external_event_id','evt_1'))$$,
  'le serveur applique un abonnement Stripe validé'
);
select is((select count(*) from public.tools_monetization_subscriptions where provider='stripe'), 1::bigint, 'un abonnement Stripe est stocké une fois');
select is((select status from public.entitlements_utilisateurs_elsatia where source='web'), 'active', 'Stripe alimente la source web R8');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(public.tools_resoudre_entitlements()->>'tier', 'pro', 'Stripe actif résout Tools Pro');
select is(public.tools_resoudre_entitlements()->>'source', 'web', 'la source résolue est web');
select is(jsonb_array_length(public.tools_resoudre_entitlements()->'sources'), 1, 'la liste des sources actives est exposée');

reset role;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok($$select public.tools_server_appliquer_abonnement(jsonb_build_object(
  'user_id','10000000-0000-0000-0000-000000000002','provider','apple','environment','sandbox',
  'product_sku','tools_pro_annual','external_product_id','fr.elsatia.tools.pro.annual',
  'external_subscription_id','2000000000000001','external_transaction_id','2000000000000002',
  'status','active','raw_status','subscribed','purchased_at',now(),'expires_at',now()+interval '1 year',
  'auto_renews',true,'event_type','SUBSCRIBED','external_event_id','apple-notification-1'))$$,
  'une seconde source Apple est acceptée'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(public.tools_resoudre_entitlements()->>'source', 'apple', 'Apple est prioritaire sur Web à droits égaux');
select is(jsonb_array_length(public.tools_resoudre_entitlements()->'sources'), 2, 'les deux sources actives coexistent');

reset role;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok($$select public.tools_server_appliquer_abonnement(jsonb_build_object(
  'user_id','10000000-0000-0000-0000-000000000002','provider','apple','environment','sandbox',
  'product_sku','tools_pro_annual','external_product_id','fr.elsatia.tools.pro.annual',
  'external_subscription_id','2000000000000001','external_transaction_id','2000000000000002',
  'status','revoked','raw_status','revoked','purchased_at',now()-interval '1 month','expires_at',now()+interval '11 months',
  'revoked_at',now(),'auto_renews',false,'event_type','REFUND','external_event_id','apple-notification-2'))$$,
  'la révocation Apple est appliquée'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(public.tools_resoudre_entitlements()->>'tier', 'pro', 'la révocation Apple ne retire pas Stripe actif');
select is(public.tools_resoudre_entitlements()->>'source', 'web', 'la résolution retombe sur Web');

reset role;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok($$select public.tools_server_appliquer_abonnement(jsonb_build_object(
  'user_id','10000000-0000-0000-0000-000000000002','provider','stripe','environment','test',
  'product_sku','tools_pro_monthly','external_product_id','price_tools_monthly_test',
  'external_subscription_id','sub_tools_test','external_transaction_id','in_test_1','status','expired',
  'raw_status','canceled','purchased_at',now()-interval '1 month','expires_at',now()-interval '1 second',
  'auto_renews',false,'event_type','customer.subscription.deleted','external_event_id','evt_2'))$$,
  'l''expiration Stripe est appliquée sans supprimer les données'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(public.tools_resoudre_entitlements()->>'tier', 'free', 'toutes les sources inactives rendent Free');
select is((select count(*) from public.tools_monetization_subscriptions), 2::bigint, 'le propriétaire lit ses deux abonnements historiques');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select count(*) from public.tools_monetization_subscriptions), 0::bigint, 'un autre utilisateur ne lit aucun abonnement');

reset role;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok($$insert into public.tools_monetization_events(provider,environment,external_event_id,event_type,status)
  values('stripe','test','evt_unique','invoice.paid','processed')$$, 'un événement serveur est journalisé');
select throws_ok($$insert into public.tools_monetization_events(provider,environment,external_event_id,event_type)
  values('stripe','test','evt_unique','invoice.paid')$$, '23505', null, 'un événement rejoué est refusé');
select throws_like($$select public.tools_server_appliquer_abonnement(jsonb_build_object(
  'user_id','10000000-0000-0000-0000-000000000002','provider','google','environment','sandbox',
  'product_sku','lifetime','external_product_id','bad','external_subscription_id','bad','status','active'))$$,
  '%invalide%', 'un SKU non canonique est refusé');
select cmp_ok((select count(*) from public.historique_entitlements_elsatia where utilisateur_id='10000000-0000-0000-0000-000000000002'), '>=', 4::bigint, 'chaque transition fournisseur est auditée');

reset role;
select * from finish();
rollback;
