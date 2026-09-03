begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc
reset elsatia.capacite_personnes_bypass;

update public.entreprises
set abonnement_offre = 'pro', abonnement_periodicite = 'mensuel',
    stripe_subscription_id = 'sub_test_A', capacite_personnes_supplementaire = 0
where id = 'a0000000-0000-0000-0000-000000000001';
update public.entreprises
set abonnement_offre = 'mini', abonnement_periodicite = 'mensuel',
    stripe_subscription_id = 'sub_test_B', capacite_personnes_supplementaire = 5
where id = 'b0000000-0000-0000-0000-000000000001';

-- ── structure ───────────────────────────────────────────────────────────────
select has_column('public','entreprises','capacite_stripe_sync_evenement_at','marqueur out-of-order');
select has_function('public','synchroniser_capacite_stripe_service','RPC de service présente');
select has_function('public','appliquer_baisse_capacite_planifiee_service','RPC baisse planifiée présente');
select has_function('public','capacite_stripe_operations_a_reprendre','RPC file cron présente');

-- ── lien tenant : subscription non liée → refus ────────────────────────────
select throws_ok($$
  select public.synchroniser_capacite_stripe_service(
    'a0000000-0000-0000-0000-000000000001','hausse',0,5,'pro','mensuel','price_cap_pro_m',
    'sub_AUTRE','si_x','k-bad-sub','completed', null, null, null, null, 'webhook')
$$, '42501', 'Subscription Stripe non liée à cette entreprise',
  'subscription étrangère → refus fail-closed');

-- ── hausse : completed → entitlement effectif immédiat + historique ─────────
select lives_ok($$
  select public.synchroniser_capacite_stripe_service(
    'a0000000-0000-0000-0000-000000000001','hausse',0,5,'pro','mensuel','price_cap_pro_m',
    'sub_test_A','si_cap_A','capacite:hausse:A:sub_test_A:5','completed',
    '{"item":"si_cap_A","quantity":5,"price":"price_cap_pro_m"}'::jsonb, null, null,
    to_timestamp(1000), 'webhook')
$$, 'hausse completed');
select is(
  (select capacite_personnes_supplementaire from public.entreprises where id='a0000000-0000-0000-0000-000000000001'),
  5, 'entitlement effectif = 5 après hausse');
select is(
  (select capacite_personnes_source from public.entreprises where id='a0000000-0000-0000-0000-000000000001'),
  'stripe', 'source de la capacité = stripe après synchronisation');
select is(
  (select count(*) from public.historique_capacite_personnes
   where entreprise_id='a0000000-0000-0000-0000-000000000001' and source='stripe'), 1::bigint,
  'historique capacité (source stripe) écrit');
select ok(
  (select capacite_stripe_sync_evenement_at from public.entreprises where id='a0000000-0000-0000-0000-000000000001') = to_timestamp(1000),
  'marqueur out-of-order mis à jour');

-- rejeu idempotent : même clé, statut completed déjà atteint → no-op
select is(
  public.synchroniser_capacite_stripe_service(
    'a0000000-0000-0000-0000-000000000001','hausse',0,5,'pro','mensuel','price_cap_pro_m',
    'sub_test_A','si_cap_A','capacite:hausse:A:sub_test_A:5','completed', null, null, null, null, 'webhook'),
  (select id from public.operations_capacite_stripe where idempotency_key='capacite:hausse:A:sub_test_A:5'),
  'rejeu idempotent → même opération');
select is((select count(*) from public.operations_capacite_stripe
           where entreprise_id='a0000000-0000-0000-0000-000000000001'), 1::bigint,
  'aucun doublon d''opération');

-- ── baisse programmée : effet fin de période, entitlement effectif inchangé ──
select lives_ok($$
  select public.synchroniser_capacite_stripe_service(
    'b0000000-0000-0000-0000-000000000001','baisse',5,2,'mini','mensuel','price_cap_mini_m',
    'sub_test_B','si_cap_B','capacite:baisse:B:sub_test_B:2','completed', null,
    now() + interval '10 days', null, null, 'webhook')
$$, 'baisse programmée enregistrée');
select is(
  (select capacite_personnes_supplementaire from public.entreprises where id='b0000000-0000-0000-0000-000000000001'),
  5, 'entitlement effectif inchangé (5) tant que non échu');
select is(
  (select capacite_personnes_supplementaire_planifiee from public.entreprises where id='b0000000-0000-0000-0000-000000000001'),
  2, 'capacité planifiée = 2');
select is(
  (select statut from public.operations_capacite_stripe where idempotency_key='capacite:baisse:B:sub_test_B:2'),
  'scheduled', 'opération repassée en scheduled');

-- pas encore à échéance → appliquer = false, rien ne bouge
select is(public.appliquer_baisse_capacite_planifiee_service('b0000000-0000-0000-0000-000000000001'), false,
  'baisse non appliquée avant échéance');

-- forcer l'échéance et appliquer
update public.entreprises set capacite_personnes_planifiee_effet_at = now() - interval '1 minute'
where id='b0000000-0000-0000-0000-000000000001';
select is(public.appliquer_baisse_capacite_planifiee_service('b0000000-0000-0000-0000-000000000001'), true,
  'baisse appliquée à échéance');
select is(
  (select capacite_personnes_supplementaire from public.entreprises where id='b0000000-0000-0000-0000-000000000001'),
  2, 'entitlement effectif = 2 après application');
select is(
  (select capacite_personnes_supplementaire_planifiee from public.entreprises where id='b0000000-0000-0000-0000-000000000001'),
  null, 'planification nettoyée');
select is(
  (select statut from public.operations_capacite_stripe where idempotency_key='capacite:baisse:B:sub_test_B:2'),
  'completed', 'opération de baisse finalisée');

-- ── needs_reconcile : ne modifie pas l'entitlement, entre dans la file cron ──
select lives_ok($$
  select public.synchroniser_capacite_stripe_service(
    'a0000000-0000-0000-0000-000000000001','hausse',5,7,'pro','mensuel','price_cap_pro_m',
    'sub_test_A','si_cap_A','capacite:hausse:A:sub_test_A:7','needs_reconcile',
    null, null, 'observation incohérente', null, 'webhook')
$$, 'opération needs_reconcile enregistrée');
select is(
  (select capacite_personnes_supplementaire from public.entreprises where id='a0000000-0000-0000-0000-000000000001'),
  5, 'entitlement inchangé tant que needs_reconcile');
select ok(
  (select count(*) from public.capacite_stripe_operations_a_reprendre(50)
   where entreprise_id='a0000000-0000-0000-0000-000000000001' and statut='needs_reconcile') = 1,
  'needs_reconcile visible dans la file de reprise');

-- ── état terminal figé : completed ne se ré-ouvre pas ──────────────────────
select is(
  public.synchroniser_capacite_stripe_service(
    'b0000000-0000-0000-0000-000000000001','baisse',5,2,'mini','mensuel','price_cap_mini_m',
    'sub_test_B','si_cap_B','capacite:baisse:B:sub_test_B:2','failed', null, null, null, null, 'webhook'),
  (select id from public.operations_capacite_stripe where idempotency_key='capacite:baisse:B:sub_test_B:2'),
  'opération terminale : rejeu renvoie l''op sans changer son état');
select is(
  (select statut from public.operations_capacite_stripe where idempotency_key='capacite:baisse:B:sub_test_B:2'),
  'completed', 'statut terminal préservé (completed, pas failed)');

-- ── ACL ────────────────────────────────────────────────────────────────────
select ok(
  has_function_privilege('service_role','public.synchroniser_capacite_stripe_service(uuid,text,integer,integer,text,text,text,text,text,text,text,jsonb,timestamptz,text,timestamptz,text)','EXECUTE')
  and has_function_privilege('authenticated','public.appliquer_baisse_capacite_planifiee_service(uuid)','EXECUTE'),
  'RPC de service exposées à service_role + authenticated (webhook/cron/action)');
select ok(
  not has_function_privilege('anon','public.synchroniser_capacite_stripe_service(uuid,text,integer,integer,text,text,text,text,text,text,text,jsonb,timestamptz,text,timestamptz,text)','EXECUTE'),
  'anon exclu');

select * from finish();
rollback;
