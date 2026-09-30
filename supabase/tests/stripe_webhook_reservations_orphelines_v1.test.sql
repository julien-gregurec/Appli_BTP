-- ELSATIA — INCIDENT RESPONSE V1 : reprise des réservations de webhook Stripe orphelines
-- (migration 20260928000702). Scénario : la base tombe entre la réservation d'un
-- événement et sa finalisation ; la libération échoue aussi. Avant : chaque
-- re-livraison Stripe était avalée comme doublon (événement perdu en silence).
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ═════ Journal SaaS : abonnement_evenements ═════
select has_column('public', 'abonnement_evenements', 'finalise_at', 'marqueur de finalisation');
select is(public.reserver_evenement_abonnement_service('evt_ok', null, 'invoice.paid', '{}'), 'reserve', 'première livraison réservée');
select is(public.reserver_evenement_abonnement_service('evt_ok', null, 'invoice.paid', '{}'), 'duplicate', 'livraison concurrente (en cours) = doublon');
select lives_ok($$select public.finaliser_evenement_abonnement_service('evt_ok', 'actif')$$, 'finalisation');
select isnt((select finalise_at from public.abonnement_evenements where stripe_event_id = 'evt_ok'), null, 'finalise_at posé');
update public.abonnement_evenements set created_at = now() - interval '1 day' where stripe_event_id = 'evt_ok';
select is(public.reserver_evenement_abonnement_service('evt_ok', null, 'invoice.paid', '{}'), 'duplicate',
  'événement FINALISÉ, même ancien : jamais retraité (pas de doublon)');

-- Orpheline : réservée puis traitement interrompu (ni finalisée ni libérée).
select is(public.reserver_evenement_abonnement_service('evt_orphelin', null, 'customer.subscription.updated', '{}'), 'reserve', 'réservation');
select is(public.reserver_evenement_abonnement_service('evt_orphelin', null, 'customer.subscription.updated', '{}'), 'duplicate',
  'moins de 5 min : encore en cours, doublon');
update public.abonnement_evenements set created_at = now() - interval '6 minutes' where stripe_event_id = 'evt_orphelin';
select is((select count(*)::int from public.incident_webhooks_stripe_orphelins() where stripe_event_id = 'evt_orphelin'), 1,
  'détection opérateur : orpheline listée');
select is(public.reserver_evenement_abonnement_service('evt_orphelin', null, 'customer.subscription.updated', '{}'), 'reserve',
  'orpheline de plus de 5 min REPRISE par la re-livraison (plus de perte silencieuse)');
select is((select reprises_orphelines from public.abonnement_evenements where stripe_event_id = 'evt_orphelin'), 1, 'reprise comptée');
select is(public.reserver_evenement_abonnement_service('evt_orphelin', null, 'customer.subscription.updated', '{}'), 'duplicate',
  'une fois reprise, une livraison concurrente redevient un doublon');
select is((select count(*)::int from public.abonnement_evenements where stripe_event_id = 'evt_orphelin'), 1, 'toujours une seule ligne');
select lives_ok($$select public.finaliser_evenement_abonnement_service('evt_orphelin', 'actif')$$, 'finalisation après reprise');
select is((select count(*)::int from public.incident_webhooks_stripe_orphelins()), 0, 'plus aucune orpheline');

-- Rollback (échec métier) : inchangé, l'événement redevient rejouable immédiatement.
select is(public.reserver_evenement_abonnement_service('evt_echec', null, 'invoice.paid', '{}'), 'reserve', 'réservation');
select lives_ok($$select public.annuler_evenement_abonnement_service('evt_echec')$$, 'libération après échec');
select is(public.reserver_evenement_abonnement_service('evt_echec', null, 'invoice.paid', '{}'), 'reserve', 'rejeu immédiat après libération');

-- ═════ Journal Connect / boutique : stripe_webhook_events ═════
insert into public.stripe_webhook_events(id, event_type) values ('evt_c1', 'checkout.session.completed');
select throws_ok($$insert into public.stripe_webhook_events(id, event_type) values ('evt_c1', 'checkout.session.completed')$$,
  '23505', null, 'doublon en cours : 23505 (contrat des routes inchangé)');
update public.stripe_webhook_events set created_at = now() - interval '6 minutes' where id = 'evt_c1';
select lives_ok($$insert into public.stripe_webhook_events(id, event_type) values ('evt_c1', 'checkout.session.completed')$$,
  'orpheline de plus de 5 min : la re-livraison est acceptée');
select is((select reprises_orphelines from public.stripe_webhook_events where id = 'evt_c1'), 1, 'reprise comptée');
select lives_ok($$select public.finaliser_evenement_webhook_stripe_service('evt_c1')$$, 'finalisation');
update public.stripe_webhook_events set created_at = now() - interval '2 days' where id = 'evt_c1';
select throws_ok($$insert into public.stripe_webhook_events(id, event_type) values ('evt_c1', 'checkout.session.completed')$$,
  '23505', null, 'finalisé : jamais retraité, même ancien');
select is((select count(*)::int from public.stripe_webhook_events where id = 'evt_c1'), 1, 'une seule ligne');
insert into public.stripe_webhook_events(id, event_type, finalise_at) values ('evt_c3', 'x', now());
select is((select finalise_at from public.stripe_webhook_events where id = 'evt_c3'), null,
  'une insertion ne peut jamais se déclarer finalisée d''avance');

-- ═════ ACL ═════
select ok(has_function_privilege('service_role', 'public.finaliser_evenement_webhook_stripe_service(text)', 'EXECUTE'), 'finalisation : service_role');
select ok(not has_function_privilege('authenticated', 'public.finaliser_evenement_webhook_stripe_service(text)', 'EXECUTE'), 'finalisation : pas authenticated');
select ok(not has_function_privilege('anon', 'public.finaliser_evenement_webhook_stripe_service(text)', 'EXECUTE'), 'finalisation : pas anon');
select ok(not has_function_privilege('service_role', 'public.incident_webhooks_stripe_orphelins()', 'EXECUTE'), 'détection : opérateur SQL uniquement');

-- ═════ Historique ═════
select is((select count(*)::int from public.abonnement_evenements where finalise_at is null and created_at < now() - interval '5 minutes'), 0,
  'aucune ligne historique rendue reprenable par la migration (rétro-remplissage)');

select * from finish();
rollback;
