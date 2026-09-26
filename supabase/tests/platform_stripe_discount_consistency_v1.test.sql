begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc

update public.entreprises set stripe_subscription_id='sub-saga-a'
where id='a0000000-0000-0000-0000-000000000001';
insert into public.abonnements_entreprises(
  entreprise_id,code_offre,version_tarif,periodicite,prix_contractuel_ht,statut,stripe_subscription_id
) values('a0000000-0000-0000-0000-000000000001','pro',1,'mensuel',199,'actif','sub-saga-a')
on conflict(entreprise_id) do update set stripe_subscription_id=excluded.stripe_subscription_id;

select ok(not has_table_privilege('authenticated','public.plateforme_operations_remise','SELECT'), 'authenticated sans lecture directe du registre');
select ok(not has_table_privilege('authenticated','public.plateforme_operations_remise','INSERT'), 'authenticated sans écriture directe du registre');
select ok(not has_table_privilege('anon','public.plateforme_operations_remise','SELECT'), 'anon sans lecture du registre');
select ok(not has_table_privilege('anon','public.plateforme_operations_remise_historique','INSERT'), 'anon sans écriture historique');
select ok(has_function_privilege('authenticated','public.plateforme_commencer_operation_remise(uuid,uuid,text,text,jsonb)','EXECUTE'), 'RPC de démarrage disponible à authenticated');
select ok(not has_function_privilege('anon','public.plateforme_commencer_operation_remise(uuid,uuid,text,text,jsonb)','EXECUTE'), 'RPC de démarrage refusée à anon');
select is((select relrowsecurity from pg_class where oid='public.plateforme_operations_remise'::regclass),true,'RLS registre activée');
select is((select relrowsecurity from pg_class where oid='public.plateforme_operations_remise_historique'::regclass),true,'RLS historique activée');

set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}',true);
select throws_like(
  $$select public.plateforme_commencer_operation_remise('a0000000-0000-0000-0000-000000000001','f3000000-0000-4000-8000-000000000001','sub-saga-a','application','{"active":true,"type":"pourcentage","valeur":10,"description":"10 %","motif_interne":"test","duree":"forever"}'::jsonb)$$,
  '%AAL2%','total AAL1 refusé avant création d’intention'
);

select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
select set_config('test.operation_remise_id',
  (public.plateforme_commencer_operation_remise('a0000000-0000-0000-0000-000000000001','f3000000-0000-4000-8000-000000000001','sub-saga-a','application','{"active":true,"type":"pourcentage","valeur":10,"description":"10 %","motif_interne":"test","duree":"forever","duree_mois":null}'::jsonb)->>'id'),true);
select ok(current_setting('test.operation_remise_id')::uuid is not null,'total AAL2 crée l’intention persistante');
select is(
  (public.plateforme_commencer_operation_remise('a0000000-0000-0000-0000-000000000001','f3000000-0000-4000-8000-000000000001','sub-saga-a','application','{"active":true,"type":"pourcentage","valeur":10,"description":"10 %","motif_interne":"test","duree":"forever","duree_mois":null}'::jsonb)->>'id'),
  current_setting('test.operation_remise_id'),'double clic reprend la même opération'
);
select throws_like(
  $$select public.plateforme_commencer_operation_remise('a0000000-0000-0000-0000-000000000001','f3000000-0000-4000-8000-000000000002','sub-saga-a','retrait','{"active":false}'::jsonb)$$,
  '%incompatible%','intention concurrente incompatible refusée'
);
select throws_like(
  $$select public.plateforme_transition_operation_remise(current_setting('test.operation_remise_id')::uuid,'completed','{"coupon_id":"coupon-saga"}'::jsonb,'coupon-saga',null)$$,
  '%permission denied%','ancien moteur de transition retiré aux sessions utilisateur'
);
select throws_like(
  $$select public.plateforme_enregistrer_coupon_operation_remise(current_setting('test.operation_remise_id')::uuid,'coupon-saga')$$,
  '%permission denied%','ancien checkpoint coupon retiré aux sessions utilisateur'
);
select throws_like(
  $$select public.plateforme_finaliser_operation_remise(current_setting('test.operation_remise_id')::uuid,'{"coupon_id":"coupon-saga"}'::jsonb)$$,
  '%permission denied%','ancien finaliseur retiré aux sessions utilisateur'
);
select throws_like(
  $$select public.plateforme_transition_operation_remise_serveur(current_setting('test.operation_remise_id')::uuid,'00000000-0000-0000-0000-000000000001','stripe_in_progress',null)$$,
  '%permission denied%','transition serveur inaccessible à authenticated'
);
select throws_like(
  $$select public.plateforme_enregistrer_preuve_stripe_serveur(current_setting('test.operation_remise_id')::uuid,'00000000-0000-0000-0000-000000000001',1,'{"coupon_id":"coupon-saga"}'::jsonb)$$,
  '%permission denied%','preuve Stripe serveur inaccessible à authenticated'
);
select throws_like(
  $$select public.plateforme_finaliser_operation_remise_serveur(current_setting('test.operation_remise_id')::uuid,'00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002')$$,
  '%permission denied%','finaliseur serveur inaccessible à authenticated'
);
select lives_ok(
  $$select public.plateforme_demander_reprise_operation_remise(current_setting('test.operation_remise_id')::uuid)$$,
  'utilisateur autorisé à demander une reprise sans fournir de preuve'
);
reset role;

select isnt((select statut from public.plateforme_operations_remise where stripe_subscription_id='sub-saga-a'),'completed','aucune finalisation sans preuve serveur');
select is((select remise_stripe_coupon_id from public.entreprises where id='a0000000-0000-0000-0000-000000000001'),null,'état métier inchangé après tentative forgée');

select ok((select count(*)>=1 from public.plateforme_operations_remise_historique h join public.plateforme_operations_remise o on o.id=h.operation_id where o.stripe_subscription_id='sub-saga-a'),'création de l’intention journalisée');
select throws_like(
  $$update public.plateforme_operations_remise_historique set statut_apres='cancelled' where operation_id=(select id from public.plateforme_operations_remise where stripe_subscription_id='sub-saga-a')$$,
  '%immuable%','historique append-only'
);
select is((select count(*) from pg_policies where schemaname='public' and tablename in ('plateforme_operations_remise','plateforme_operations_remise_historique') and roles && array['anon']::name[]),0::bigint,'aucune policy anon');
select is((select count(*) from pg_proc p where p.proname like 'plateforme_%operation_remise%' and p.prosecdef and not exists(select 1 from unnest(coalesce(p.proconfig,array[]::text[])) c where c like 'search_path=public%')),0::bigint,'SECURITY DEFINER avec search_path sûr');

select * from finish();
rollback;
