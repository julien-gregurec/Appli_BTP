begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc
reset elsatia.capacite_personnes_bypass;

update public.entreprises
set abonnement_offre = 'pro', abonnement_periodicite = 'mensuel',
    stripe_subscription_id = 'sub_test_conv', capacite_personnes_supplementaire = 5
where id = 'a0000000-0000-0000-0000-000000000001';

-- structure + ACL
select has_function('public','capacite_stripe_finaliser_op_convergente','RPC de fermeture présente');
select ok(has_function_privilege('service_role','public.capacite_stripe_finaliser_op_convergente(uuid)','EXECUTE'), 'service_role peut exécuter');
select ok(not has_function_privilege('anon','public.capacite_stripe_finaliser_op_convergente(uuid)','EXECUTE'), 'anon exclu');

-- op needs_reconcile orpheline
insert into public.operations_capacite_stripe(
  entreprise_id, type_operation, ancienne_capacite, nouvelle_capacite,
  plan_code, periodicite, stripe_subscription_id, statut, source, idempotency_key
) values (
  'a0000000-0000-0000-0000-000000000001','hausse',2,5,'pro','mensuel','sub_test_conv',
  'needs_reconcile','systeme','conv-key-1'
) returning id as op_id \gset

select is((select statut from public.operations_capacite_stripe where id = :'op_id'), 'needs_reconcile', 'départ : needs_reconcile');
select ok(
  (select count(*) from public.capacite_stripe_operations_a_reprendre(50) where operation_id = :'op_id') = 1,
  'départ : présente dans la file de reprise');

-- fermeture
select is(public.capacite_stripe_finaliser_op_convergente(:'op_id'), true, 'fermeture effectuée');
select is((select statut from public.operations_capacite_stripe where id = :'op_id'), 'completed', 'op passée à completed');
select is((select erreur_courte from public.operations_capacite_stripe where id = :'op_id'), null, 'erreur_courte nettoyée');
select ok(
  (select count(*) from public.capacite_stripe_operations_a_reprendre(50) where operation_id = :'op_id') = 0,
  'op sortie de la file de reprise');

-- idempotent : second appel → false, statut inchangé
select is(public.capacite_stripe_finaliser_op_convergente(:'op_id'), false, 'second appel : rien à faire (terminal)');
select is((select statut from public.operations_capacite_stripe where id = :'op_id'), 'completed', 'statut terminal préservé');

-- op inexistante → false
select is(public.capacite_stripe_finaliser_op_convergente('00000000-0000-0000-0000-0000000000ff'::uuid), false, 'op inconnue → false');

-- ne ferme jamais une op déjà failed
insert into public.operations_capacite_stripe(
  entreprise_id, type_operation, ancienne_capacite, nouvelle_capacite,
  plan_code, periodicite, stripe_subscription_id, statut, source, idempotency_key
) values (
  'a0000000-0000-0000-0000-000000000001','baisse',5,2,'pro','mensuel','sub_test_conv',
  'failed','systeme','conv-key-2'
) returning id as op_failed \gset
select is(public.capacite_stripe_finaliser_op_convergente(:'op_failed'), false, 'op failed → non touchée');
select is((select statut from public.operations_capacite_stripe where id = :'op_failed'), 'failed', 'failed préservé');

-- ── marqueur out-of-order (avancement monotone via RPC de service) ───────────
select has_function('public','capacite_stripe_avancer_marqueur_evenement','RPC marqueur présente');
select ok(has_function_privilege('service_role','public.capacite_stripe_avancer_marqueur_evenement(uuid,timestamptz)','EXECUTE'), 'service_role peut exécuter le marqueur');
select ok(not has_function_privilege('anon','public.capacite_stripe_avancer_marqueur_evenement(uuid,timestamptz)','EXECUTE'), 'anon exclu du marqueur');

update public.entreprises set capacite_stripe_sync_evenement_at = null where id = 'a0000000-0000-0000-0000-000000000001';
select public.capacite_stripe_avancer_marqueur_evenement('a0000000-0000-0000-0000-000000000001', to_timestamp(1000));
select is((select capacite_stripe_sync_evenement_at from public.entreprises where id='a0000000-0000-0000-0000-000000000001'), to_timestamp(1000), 'marqueur posé');
-- événement plus ancien → marqueur inchangé (monotone)
select public.capacite_stripe_avancer_marqueur_evenement('a0000000-0000-0000-0000-000000000001', to_timestamp(500));
select is((select capacite_stripe_sync_evenement_at from public.entreprises where id='a0000000-0000-0000-0000-000000000001'), to_timestamp(1000), 'événement plus ancien ignoré (greatest)');
-- événement plus récent → marqueur avancé
select public.capacite_stripe_avancer_marqueur_evenement('a0000000-0000-0000-0000-000000000001', to_timestamp(2000));
select is((select capacite_stripe_sync_evenement_at from public.entreprises where id='a0000000-0000-0000-0000-000000000001'), to_timestamp(2000), 'événement plus récent → marqueur avancé');
-- null → no-op
select public.capacite_stripe_avancer_marqueur_evenement('a0000000-0000-0000-0000-000000000001', null);
select is((select capacite_stripe_sync_evenement_at from public.entreprises where id='a0000000-0000-0000-0000-000000000001'), to_timestamp(2000), 'p_evenement_at null → inchangé');

select * from finish();
rollback;
