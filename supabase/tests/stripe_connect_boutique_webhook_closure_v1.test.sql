begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

-- ELSATIA-STRIPE-CONNECT-BOUTIQUE-WEBHOOK-CLOSURE-V1 — non-régression pour
-- 20260922000324. Ferme, pour le webhook Stripe Connect (factures clients) et
-- le webhook Boutique, le P1 confirmé par
-- docs/qualification/ELSATIA_SECURITY_TENANT_RED_TEAM_V3.md §6 : les deux
-- routes échouaient en 42501 dès leur première écriture
-- (public.stripe_webhook_events), et le webhook Connect appelait deux RPC
-- absentes de toute migration appliquée.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Grants au catalogue — la surface exacte requise par les deux webhooks,
--    rien de plus (service_role ne regagne ni SELECT ni UPDATE ni DELETE sur
--    stripe_webhook_events : le journal de dé-duplication reste en écriture
--    seule, à l'identique du reste de l'ACL canonique).
-- ─────────────────────────────────────────────────────────────────────────

select ok(
  has_column_privilege('service_role', 'public.stripe_webhook_events', 'id', 'INSERT')
  and has_column_privilege('service_role', 'public.stripe_webhook_events', 'event_type', 'INSERT')
  and has_column_privilege('service_role', 'public.stripe_webhook_events', 'livemode', 'INSERT')
  and has_column_privilege('service_role', 'public.stripe_webhook_events', 'facture_id', 'INSERT'),
  'service_role peut de nouveau réserver un évènement webhook (INSERT sur les 4 colonnes écrites par le code)'
);
select ok(
  not has_table_privilege('service_role', 'public.stripe_webhook_events', 'SELECT'),
  'service_role ne regagne pas SELECT sur stripe_webhook_events (moindre privilège, inchangé)'
);
select ok(
  not has_table_privilege('authenticated', 'public.stripe_webhook_events', 'INSERT')
  and not has_table_privilege('anon', 'public.stripe_webhook_events', 'INSERT'),
  'authenticated/anon ne peuvent toujours pas écrire dans stripe_webhook_events'
);

select has_function('public', 'stripe_connect_encaisser_facture_service', array['uuid','uuid','text','text','bigint','text'], 'stripe_connect_encaisser_facture_service existe');
select has_function('public', 'stripe_connect_expirer_checkout_facture_service', array['uuid','text'], 'stripe_connect_expirer_checkout_facture_service existe');
select has_function('public', 'boutique_expirer_commande_service', array['uuid','text'], 'boutique_expirer_commande_service existe');

select ok(
  has_function_privilege('service_role', 'public.stripe_connect_encaisser_facture_service(uuid,uuid,text,text,bigint,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.stripe_connect_encaisser_facture_service(uuid,uuid,text,text,bigint,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.stripe_connect_encaisser_facture_service(uuid,uuid,text,text,bigint,text)', 'EXECUTE'),
  'stripe_connect_encaisser_facture_service : service_role seul'
);
select ok(
  has_function_privilege('service_role', 'public.stripe_connect_expirer_checkout_facture_service(uuid,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.stripe_connect_expirer_checkout_facture_service(uuid,text)', 'EXECUTE'),
  'stripe_connect_expirer_checkout_facture_service : service_role seul'
);
select ok(
  has_function_privilege('service_role', 'public.boutique_expirer_commande_service(uuid,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.boutique_expirer_commande_service(uuid,text)', 'EXECUTE'),
  'boutique_expirer_commande_service : service_role seul'
);

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Témoins sur données réelles (fixture d'isolation multitenant standard).
-- ─────────────────────────────────────────────────────────────────────────
\ir fixtures/isolation_multitenant.inc

update public.entreprises set stripe_account_id = 'acct_test_A' where id = 'a0000000-0000-0000-0000-000000000001';
update public.entreprises set stripe_account_id = 'acct_test_B' where id = 'b0000000-0000-0000-0000-000000000001';
update public.factures set stripe_checkout_id = 'cs_closure_A_1' where id = 'aa000000-0000-0000-0000-000000000001';

insert into public.boutique_commandes (id, entreprise_id, statut, montant_ht, montant_tva, montant_ttc, stripe_checkout_id)
values ('c0000000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000001', 'en_attente_paiement', 100, 20, 120, 'cs_closure_boutique_A_1');

-- Négatif : authenticated ne peut pas réserver un évènement lui-même (le
-- webhook seul écrit ce journal — un client ne doit jamais pouvoir forger sa
-- propre dé-duplication ni un facture_id arbitraire).
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_like(
  $$insert into public.stripe_webhook_events(id, event_type, livemode, facture_id) values ('evt_forged_by_client', 'checkout.session.completed', false, null)$$,
  '%permission denied%',
  'authenticated ne peut pas écrire directement dans stripe_webhook_events'
);
select throws_like(
  $$select public.stripe_connect_encaisser_facture_service('aa000000-0000-0000-0000-000000000001'::uuid,'a0000000-0000-0000-0000-000000000001'::uuid,'cs_closure_A_1','acct_test_A',12000,null)$$,
  '%permission denied%',
  'authenticated ne peut pas appeler stripe_connect_encaisser_facture_service directement (pas de contournement du webhook)'
);
select throws_like(
  $$select public.boutique_expirer_commande_service('c0000000-0000-0000-0000-000000000020'::uuid,'cs_closure_boutique_A_1')$$,
  '%permission denied%',
  'authenticated ne peut pas appeler boutique_expirer_commande_service directement'
);
reset role;

-- Positif : le chemin serveur (service_role, après vérification de signature
-- et de mode par la route) reste — désormais — fonctionnel de bout en bout.
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select lives_ok(
  $$insert into public.stripe_webhook_events(id, event_type, livemode, facture_id) values ('evt_closure_connect_1', 'checkout.session.completed', false, 'aa000000-0000-0000-0000-000000000001')$$,
  'service_role peut réserver un évènement webhook Connect (dé-duplication fonctionnelle)'
);
select throws_like(
  $$insert into public.stripe_webhook_events(id, event_type, livemode, facture_id) values ('evt_closure_connect_1', 'checkout.session.completed', false, 'aa000000-0000-0000-0000-000000000001')$$,
  '%duplicate key value%',
  'un évènement déjà reçu lève 23505 (la route renvoie {duplicate:true} sans retraiter) — dé-duplication après succès intacte'
);

select is(
  public.stripe_connect_encaisser_facture_service('aa000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'cs_closure_A_1', 'acct_test_A', 12000, 'pi_closure_1'),
  'encaissee',
  'encaissement légitime : la RPC de service traite l''évènement (facture, checkout et compte Connect cohérents)'
);
-- Les vérifications lisent en tant que postgres (superutilisateur) : service_role n'a lui-même
-- aucun SELECT sur factures/paiements/boutique_commandes (moindre privilège inchangé, cf. test 2)
-- — seule la fonction SECURITY DEFINER, propriétaire de ces lectures, y accède.
reset role;
select is((select stripe_payment_status from public.factures where id = 'aa000000-0000-0000-0000-000000000001'), 'paid', 'la facture passe à paid');
select is((select montant_paye from public.factures where id = 'aa000000-0000-0000-0000-000000000001')::numeric, 120.00::numeric, 'montant_paye = reste dû plafonné (120 dus, 120 reçus)');
select is((select count(*) from public.paiements where facture_id = 'aa000000-0000-0000-0000-000000000001' and stripe_session_id = 'cs_closure_A_1')::int, 1, 'un seul paiement enregistré pour cette session Checkout');

-- Rejeu du même évènement (retry Stripe après un 200 déjà renvoyé, ou double
-- livraison réseau) : la RPC elle-même reste idempotente sur la session
-- Checkout (contrainte unique paiements.stripe_session_id), indépendamment de
-- la dé-duplication au niveau de la table stripe_webhook_events.
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  public.stripe_connect_encaisser_facture_service('aa000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'cs_closure_A_1', 'acct_test_A', 12000, 'pi_closure_1'),
  'encaissee',
  'rejeu du même évènement (même session Checkout) : la RPC ne lève pas, aucun double effet'
);
reset role;
select is((select count(*) from public.paiements where facture_id = 'aa000000-0000-0000-0000-000000000001' and stripe_session_id = 'cs_closure_A_1')::int, 1, 'toujours un seul paiement après rejeu (idempotence par session Checkout, ON CONFLICT DO NOTHING)');

-- Négatif : confusion de tenant (deputy confus) — l'évènement prétend agir
-- pour l'entreprise B sur une facture qui appartient à l'entreprise A.
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  public.stripe_connect_encaisser_facture_service('aa000000-0000-0000-0000-000000000001'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid, 'cs_closure_A_1', 'acct_test_A', 12000, 'pi_forged_tenant'),
  'ignoree',
  'cross-tenant : facture de A réclamée sous entreprise_id de B -> ignorée, aucune écriture'
);
reset role;

-- Négatif : confusion de compte Connect — bon tenant, bon checkout, mauvais
-- compte Stripe Connect émetteur (deputy confus côté Connect).
insert into public.factures (id, entreprise_id, numero, client_id, chantier_id, statut, montant_ht, montant_tva, montant_ttc, stripe_checkout_id)
values ('aa000000-0000-0000-0000-000000000099', 'a0000000-0000-0000-0000-000000000001', 'TEST_A_FAC_099', 'a3000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'envoyee', 50, 10, 60, 'cs_closure_A_2');
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  public.stripe_connect_encaisser_facture_service('aa000000-0000-0000-0000-000000000099'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'cs_closure_A_2', 'acct_test_B', 6000, 'pi_wrong_account'),
  'ignoree',
  'confused deputy Connect : compte Stripe émetteur ne correspond pas à celui de l''entreprise -> ignorée'
);
reset role;
select is((select stripe_payment_status from public.factures where id = 'aa000000-0000-0000-0000-000000000099'), null, 'aucune écriture sur la facture visée par le confused deputy Connect');

-- Négatif : session Checkout incorrecte (rejeu d'un ancien identifiant, ou
-- évènement forgé) -> ignorée.
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  public.stripe_connect_encaisser_facture_service('aa000000-0000-0000-0000-000000000099'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'cs_inconnue', 'acct_test_A', 6000, 'pi_wrong_checkout'),
  'ignoree',
  'session Checkout incohérente avec la facture -> ignorée'
);

-- Validation du montant : le montant encaissé ne peut jamais dépasser le
-- reste dû, même si l'évènement (falsifié ou buggé côté Stripe) annonce plus.
select is(
  public.stripe_connect_encaisser_facture_service('aa000000-0000-0000-0000-000000000099'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'cs_closure_A_2', 'acct_test_A', 999999, 'pi_over_amount'),
  'encaissee',
  'montant Stripe supérieur au reste dû : encaissement accepté mais plafonné'
);
reset role;
select is((select montant_paye from public.factures where id = 'aa000000-0000-0000-0000-000000000099')::numeric, 60.00::numeric, 'montant_paye plafonné au reste dû (60), jamais au montant annoncé par l''évènement (9999.99)');

-- Positif : expiration Boutique par le chemin serveur.
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$select public.boutique_expirer_commande_service('c0000000-0000-0000-0000-000000000020'::uuid, 'cs_closure_boutique_A_1')$$,
  'le chemin serveur peut expirer une commande Boutique en attente de paiement'
);
reset role;
select is(
  (select statut from public.boutique_commandes where id = 'c0000000-0000-0000-0000-000000000020'),
  'expiree',
  'la commande Boutique passe à expiree'
);

-- Négatif : expiration ne s'applique jamais à une commande déjà payée (même
-- appelée par service_role avec un mauvais couple commande/checkout) — la
-- clause WHERE statut='en_attente_paiement' protège contre une régression
-- d'une commande payée vers expiree.
insert into public.boutique_commandes (id, entreprise_id, statut, montant_ht, montant_tva, montant_ttc, stripe_checkout_id)
values ('c0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000001', 'payee', 10, 2, 12, 'cs_closure_boutique_A_2');
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$select public.boutique_expirer_commande_service('c0000000-0000-0000-0000-000000000021'::uuid, 'cs_closure_boutique_A_2')$$,
  'appeler expirer sur une commande déjà payée ne lève pas (no-op silencieux, comme le reste à jour Boutique)'
);
reset role;
select is(
  (select statut from public.boutique_commandes where id = 'c0000000-0000-0000-0000-000000000021'),
  'payee',
  'une commande déjà payée ne repasse jamais à expiree'
);

-- ─────────────────────────────────────────────────────────────────────────
-- 3) D3 — résidu documenté, NON corrigé par ce lot (décision historique du
--    2026-09-11, revérifiée par cette mission : docs/audit/ELSATIA_SERVICE_ROLE_FLUX_ACL_V1.md,
--    "Constats annexes" #2). Caractérise le comportement ACTUEL, pas un bug
--    introduit par cette migration : un évènement dont le TRAITEMENT échoue
--    après sa réservation en base reste réservé -> un retry Stripe du même
--    évènement est avalé comme "duplicate" par le code (23505) sans être
--    rejoué, et l'effet métier n'a jamais lieu. Ce test DOIT être mis à jour
--    (ou supprimé) le jour où un lot dédié introduit reserver/finaliser/annuler
--    (comme 20260904000262 pour le webhook abonnement) sur stripe_webhook_events.
-- ─────────────────────────────────────────────────────────────────────────
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$insert into public.stripe_webhook_events(id, event_type, livemode, facture_id) values ('evt_closure_d3_witness', 'checkout.session.completed', false, 'aa000000-0000-0000-0000-000000000001')$$,
  'D3 (résidu documenté) — étape 1 : la réservation de l''évènement réussit et est déjà committée en pratique (autonome, hors transaction avec le traitement)'
);
-- Le traitement métier échouerait ici dans la route réelle (panne DB, RPC en
-- erreur, timeout) : la ligne ci-dessus reste réservée quoi qu'il arrive.
select throws_like(
  $$insert into public.stripe_webhook_events(id, event_type, livemode, facture_id) values ('evt_closure_d3_witness', 'checkout.session.completed', false, 'aa000000-0000-0000-0000-000000000001')$$,
  '%duplicate key value%',
  'D3 (résidu documenté) — étape 2 : le retry Stripe du même évènement est avalé comme duplicate même si le traitement précédent n''a jamais réussi (perte silencieuse, pas une régression de ce lot — voir le rapport de clôture)'
);
reset role;

select * from finish();
rollback;
