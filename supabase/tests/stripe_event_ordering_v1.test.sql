begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ELSATIA-STRIPE-EVENT-ORDERING-REPLAY-HARDENING-V1 — contrat d'ordre des
-- webhooks Stripe (migration 20260927000506). Couvre, en séquentiel dans une
-- transaction : ordre inversé, rejeu, doublons (1/10/100), égalité à la
-- seconde, 3-D Secure, cycle portail (upgrade / downgrade / cancel at period
-- end / reactivate / échec / succès), Connect account.updated, Tools, ACL.
-- La concurrence réelle (deux sessions Postgres) est prouvée séparément par
-- scripts/qualification/stripe-ordering-concurrency.sh (une transaction
-- pgTAP ne peut pas se bloquer elle-même).

\ir fixtures/isolation_multitenant.inc

insert into public.plans_abonnement(id, code, version, nom, prix_mensuel_ht, prix_annuel_ht, devise,
  utilisateurs_inclus, administrateurs_inclus, operations_ia_incluses, stockage_go_inclus, actif)
values
  ('c1a11111-0000-0000-0000-0000000000a1','pro',7,'Pro (test ordre)',249,2490,'EUR',15,3,0,100,true),
  ('c1a11111-0000-0000-0000-0000000000a2','business',7,'Business (test ordre)',449,4490,'EUR',30,5,0,200,true)
on conflict do nothing;

insert into public.entreprises (id, nom, code_adhesion, abonnement_statut) values
  ('e0000000-0000-0000-0000-000000000001', 'Ordre 1 inversé', 'ORD00001', 'actif'),
  ('e0000000-0000-0000-0000-000000000002', 'Ordre 2 nominal', 'ORD00002', 'actif'),
  ('e0000000-0000-0000-0000-000000000003', 'Ordre 3 rejeu', 'ORD00003', 'actif'),
  ('e0000000-0000-0000-0000-000000000004', 'Ordre 4 doublons', 'ORD00004', 'actif'),
  ('e0000000-0000-0000-0000-000000000005', 'Ordre 5 égalité paid>failed', 'ORD00005', 'actif'),
  ('e0000000-0000-0000-0000-000000000006', 'Ordre 6 égalité failed>paid', 'ORD00006', 'actif'),
  ('e0000000-0000-0000-0000-000000000007', 'Ordre 7 3DS', 'ORD00007', 'actif'),
  ('e0000000-0000-0000-0000-000000000008', 'Ordre 8 portail', 'ORD00008', 'essai'),
  ('e0000000-0000-0000-0000-000000000009', 'Ordre 9 3DS inversé', 'ORD00009', 'actif'),
  ('e0000000-0000-0000-0000-000000000010', 'Ordre 10 essai sub→paid', 'ORD00010', 'essai'),
  ('e0000000-0000-0000-0000-000000000011', 'Ordre 11 essai paid→sub', 'ORD00011', 'essai')
on conflict (id) do nothing;

-- Horloge Stripe de test : t(n) = 2026-10-01T00:00:00Z + n secondes.
create function pg_temp.t(n integer) returns timestamptz language sql immutable
as $$ select timestamptz '2026-10-01 00:00:00+00' + make_interval(secs => n) $$;

create function pg_temp.facture(e text, evt text, typ text, n integer, inv text, st text default null)
returns jsonb language sql as $$
  select public.appliquer_evenement_facture_abonnement_service(
    e::uuid, evt, typ, pg_temp.t(n), inv,
    coalesce(st, case typ when 'invoice.paid' then 'paid' else 'open' end),
    pg_temp.t(n) - interval '1 hour', 'F-' || inv, pg_temp.t(0), pg_temp.t(0) + interval '30 days',
    249, 49.8, 298.8, 'eur', 'https://invoice.test/' || inv, null)
$$;

create function pg_temp.abo(e text, evt text, typ text, n integer, statut text, offre text, periodicite text,
  annulation timestamptz default null, sub text default 'sub_ord_8')
returns jsonb language sql as $$
  select public.synchroniser_abonnement_stripe_ordonne_service(
    e::uuid, sub, replace(sub, 'sub_', 'cus_'), statut, offre, periodicite,
    date '2026-11-01', (select abonnement_essai_fin from public.entreprises where id = e::uuid), annulation, pg_temp.t(0), pg_temp.t(0) + interval '30 days',
    evt, typ, pg_temp.t(n), 'subscription', sub)
$$;

create function pg_temp.statut(e text) returns text language sql as $$
  select abonnement_statut from public.entreprises where id = e::uuid
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0. Structure, ACL
-- ═══════════════════════════════════════════════════════════════════════════
select has_table('public', 'stripe_evenements_ordre', 'journal d''ordonnancement présent');
select has_table('public', 'stripe_objets_ordre', 'filigranes par objet présents');
select ok((select relrowsecurity from pg_class where oid = 'public.stripe_evenements_ordre'::regclass), 'RLS journal activée');
select ok((select relrowsecurity from pg_class where oid = 'public.stripe_objets_ordre'::regclass), 'RLS filigranes activée');
select ok(not has_table_privilege('service_role', 'public.stripe_evenements_ordre', 'INSERT'), 'service_role : pas d''INSERT direct sur le journal');
select ok(not has_table_privilege('service_role', 'public.stripe_objets_ordre', 'UPDATE'), 'service_role : pas d''UPDATE direct des filigranes');
select ok(not has_table_privilege('authenticated', 'public.stripe_objets_ordre', 'INSERT'), 'authenticated : pas d''INSERT des filigranes');
select ok(has_function_privilege('service_role',
  'public.appliquer_evenement_facture_abonnement_service(uuid,text,text,timestamptz,text,text,timestamptz,text,timestamptz,timestamptz,numeric,numeric,numeric,text,text,text)', 'EXECUTE'),
  'service_role : EXECUTE appliquer_evenement_facture_abonnement_service');
select ok(not has_function_privilege('authenticated',
  'public.appliquer_evenement_facture_abonnement_service(uuid,text,text,timestamptz,text,text,timestamptz,text,timestamptz,timestamptz,numeric,numeric,numeric,text,text,text)', 'EXECUTE'),
  'authenticated : PAS d''EXECUTE sur la RPC facture');
select ok(not has_function_privilege('anon',
  'public.synchroniser_abonnement_stripe_ordonne_service(uuid,text,text,text,text,text,date,date,timestamptz,timestamptz,timestamptz,text,text,timestamptz,text,text)', 'EXECUTE'),
  'anon : PAS d''EXECUTE sur la RPC abonnement ordonnée');
select ok(not has_function_privilege('service_role', 'public.stripe_ordre_avancer(text,text,text,uuid,text,text,timestamptz,text)', 'EXECUTE'),
  'helper interne stripe_ordre_avancer non exposé à service_role');
select ok(has_function_privilege('service_role', 'public.liberer_evenement_webhook_stripe_service(text)', 'EXECUTE'), 'service_role : EXECUTE liberer_evenement_webhook_stripe_service');
select ok(not has_function_privilege('authenticated', 'public.liberer_evenement_webhook_stripe_service(text)', 'EXECUTE'), 'authenticated : PAS liberer_evenement_webhook_stripe_service');
select ok(not has_function_privilege('authenticated', 'public.stripe_connect_maj_compte_service(text,boolean,text,timestamptz)', 'EXECUTE'), 'authenticated : PAS stripe_connect_maj_compte_service');
select ok(not has_function_privilege('authenticated', 'public.tools_server_appliquer_abonnement_ordonne(jsonb,timestamptz)', 'EXECUTE'), 'authenticated : PAS tools_server_appliquer_abonnement_ordonne');

-- Un membre tenant ne lit pas le journal (lecture plateforme uniquement).
select ok(pg_temp.facture('a0000000-0000-0000-0000-000000000001', 'evt_acl_journal', 'invoice.paid', 1, 'in_acl') is not null, 'livraison exécutée');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select count(*)::int from public.stripe_evenements_ordre), 0, 'RLS : un admin tenant ne voit pas le journal d''ordonnancement');
select throws_like($$select public.appliquer_evenement_facture_abonnement_service(
  'a0000000-0000-0000-0000-000000000001', 'evt_x', 'invoice.paid', now(), 'in_x', 'paid', now(), null, null, null, 0, 0, 0, 'eur', null, null)$$,
  '%permission denied%', 'authenticated ne peut pas forcer une transition d''accès');
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. LE BUG DU PACK PREVIEW : ancien payment_failed livré après invoice.paid
-- ═══════════════════════════════════════════════════════════════════════════
select is(pg_temp.facture('e0000000-0000-0000-0000-000000000001', 'evt_1_paid', 'invoice.paid', 200, 'in_1b')->>'decision', 'applique', '1. paid(t200) appliqué');
select is(pg_temp.statut('e0000000-0000-0000-0000-000000000001'), 'actif', '1. statut actif');
select is(pg_temp.facture('e0000000-0000-0000-0000-000000000001', 'evt_1_failed', 'invoice.payment_failed', 100, 'in_1a')->>'decision', 'perime',
  '1. ancien payment_failed(t100) livré après → PÉRIMÉ');
select is(pg_temp.statut('e0000000-0000-0000-0000-000000000001'), 'actif', '1. ancien payment_failed ne re-suspend PAS l''entreprise');
select is((select decision || '|' || motif from public.stripe_evenements_ordre where stripe_event_id = 'evt_1_failed'),
  'perime|evenement_anterieur_au_dernier_applique', '1. événement périmé JOURNALISÉ avec son motif');
select is((select stripe_event_created from public.stripe_evenements_ordre where stripe_event_id = 'evt_1_failed'), pg_temp.t(100),
  '1. journal : event.created Stripe conservé');
select is((select objet_type || ':' || objet_id from public.stripe_evenements_ordre where stripe_event_id = 'evt_1_failed'), 'invoice:in_1a',
  '1. journal : objet Stripe conservé');
select ok((select processed_at is not null from public.stripe_evenements_ordre where stripe_event_id = 'evt_1_failed'), '1. journal : processed_at posé');
select is((select transition from public.stripe_evenements_ordre where stripe_event_id = 'evt_1_paid'), 'actif (inchangé)', '1. journal : transition métier de paid');
select is((select abonnement_dernier_evenement_at from public.entreprises where id = 'e0000000-0000-0000-0000-000000000001'), pg_temp.t(200),
  '1. abonnement_dernier_evenement_at enfin écrit (colonne …333)');
select is((select derniere_facture_stripe_id from public.entreprises where id = 'e0000000-0000-0000-0000-000000000001'), 'in_1b',
  '1. la trace « dernière facture » n''est pas écrasée par l''événement périmé');
select is((select statut from public.factures_abonnement where stripe_invoice_id = 'in_1a'), 'open',
  '1. la facture in_1a (plus ancienne, fraîche pour elle-même) reste visible impayée');

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Ordre nominal : payment_failed puis paid
-- ═══════════════════════════════════════════════════════════════════════════
update public.entreprises set impaye_signale_at = now(), suspension_prevue_at = now() + interval '3 days'
where id = 'e0000000-0000-0000-0000-000000000002';
select is(pg_temp.facture('e0000000-0000-0000-0000-000000000002', 'evt_2_failed', 'invoice.payment_failed', 100, 'in_2')->>'notifier_echec', 'true',
  '2. payment_failed appliqué → notification demandée');
select is(pg_temp.statut('e0000000-0000-0000-0000-000000000002'), 'suspendu', '2. SUSPENSION IMMÉDIATE (décision produit conservée, pas de grâce)');
select is((select transition from public.stripe_evenements_ordre where stripe_event_id = 'evt_2_failed'), 'actif -> suspendu', '2. transition actif -> suspendu journalisée');
select is(pg_temp.facture('e0000000-0000-0000-0000-000000000002', 'evt_2_paid', 'invoice.paid', 200, 'in_2')->>'statut_resultant', 'actif', '2. paid → actif');
select is(pg_temp.statut('e0000000-0000-0000-0000-000000000002'), 'actif', '2. accès restauré');
select ok((select impaye_signale_at is null and suspension_prevue_at is null from public.entreprises where id = 'e0000000-0000-0000-0000-000000000002'),
  '2. paid régularise l''impayé (impaye_signale_at / suspension_prevue_at effacés)');
select is((select statut from public.factures_abonnement where stripe_invoice_id = 'in_2'), 'paid', '2. facture payée');

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Rejeu : même event id, facture déjà payée, payée_at stable
-- ═══════════════════════════════════════════════════════════════════════════
select ok(pg_temp.facture('e0000000-0000-0000-0000-000000000003', 'evt_3_failed', 'invoice.payment_failed', 300, 'in_3') is not null, 'livraison exécutée');
select ok(pg_temp.facture('e0000000-0000-0000-0000-000000000003', 'evt_3_paid', 'invoice.paid', 400, 'in_3') is not null, 'livraison exécutée');
select is(pg_temp.statut('e0000000-0000-0000-0000-000000000003'), 'actif', '3. failed puis paid → actif');
select is(pg_temp.facture('e0000000-0000-0000-0000-000000000003', 'evt_3_failed', 'invoice.payment_failed', 300, 'in_3')->>'decision', 'deja_traite',
  '3. rejeu du MÊME payment_failed (Dashboard « Resend ») → deja_traite, rien réappliqué');
select is(pg_temp.statut('e0000000-0000-0000-0000-000000000003'), 'actif', '3. le rejeu ne re-suspend pas');
select is(pg_temp.facture('e0000000-0000-0000-0000-000000000003', 'evt_3_failed_retry', 'invoice.payment_failed', 350, 'in_3')->>'motif', 'facture_deja_payee',
  '3. autre payment_failed de la même facture (tentative intermédiaire) → périmé : paid est terminal');
select is(pg_temp.statut('e0000000-0000-0000-0000-000000000003'), 'actif', '3. toujours actif');
select is(pg_temp.facture('e0000000-0000-0000-0000-000000000003', 'evt_3_failed_late', 'invoice.payment_failed', 900, 'in_3')->>'decision', 'perime',
  '3. même un payment_failed PLUS RÉCENT d''une facture payée est périmé (horodatage incohérent)');
create temp table payee_ref as select payee_at from public.factures_abonnement where stripe_invoice_id = 'in_3';
select ok(pg_temp.facture('e0000000-0000-0000-0000-000000000003', 'evt_3_paid_bis', 'invoice.paid', 410, 'in_3') is not null, 'livraison exécutée');
select is((select payee_at from public.factures_abonnement where stripe_invoice_id = 'in_3'), (select payee_at from payee_ref),
  '3. payee_at stable au rejeu d''un paid');
select is((select statut from public.factures_abonnement where stripe_invoice_id = 'in_3'), 'paid', '3. facture reste paid');
-- Nouvelle facture, échec postérieur au dernier paid → suspension (chronologie respectée).
select is(pg_temp.facture('e0000000-0000-0000-0000-000000000003', 'evt_3_next_failed', 'invoice.payment_failed', 1000, 'in_3b')->>'decision', 'applique',
  '3. échec d''une NOUVELLE facture, postérieur → appliqué');
select is(pg_temp.statut('e0000000-0000-0000-0000-000000000003'), 'suspendu', '3. suspension immédiate sur le nouvel échec');

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Idempotence : même event_id 1, 10, 100 fois → même état final
-- ═══════════════════════════════════════════════════════════════════════════
select ok(pg_temp.facture('e0000000-0000-0000-0000-000000000004', 'evt_4_failed', 'invoice.payment_failed', 100, 'in_4') is not null, 'livraison exécutée');
create temp table etat_1 as select abonnement_statut, derniere_facture_stripe_id, abonnement_dernier_evenement_at
  from public.entreprises where id = 'e0000000-0000-0000-0000-000000000004';
select is((select count(*)::int from (select pg_temp.facture('e0000000-0000-0000-0000-000000000004', 'evt_4_failed', 'invoice.payment_failed', 100, 'in_4') from generate_series(1, 9)) x), 9, 'livraisons répétées exécutées (9)');
select is((select row(abonnement_statut, derniere_facture_stripe_id, abonnement_dernier_evenement_at)::text from public.entreprises where id = 'e0000000-0000-0000-0000-000000000004'),
  (select row(abonnement_statut, derniere_facture_stripe_id, abonnement_dernier_evenement_at)::text from etat_1), '4. 10 livraisons = état de 1 livraison');
select is((select count(*)::int from (select pg_temp.facture('e0000000-0000-0000-0000-000000000004', 'evt_4_failed', 'invoice.payment_failed', 100, 'in_4') from generate_series(1, 90)) x), 90, 'livraisons répétées exécutées (90)');
select is((select row(abonnement_statut, derniere_facture_stripe_id, abonnement_dernier_evenement_at)::text from public.entreprises where id = 'e0000000-0000-0000-0000-000000000004'),
  (select row(abonnement_statut, derniere_facture_stripe_id, abonnement_dernier_evenement_at)::text from etat_1), '4. 100 livraisons = état de 1 livraison');
select is((select count(*)::int from public.stripe_evenements_ordre where stripe_event_id = 'evt_4_failed'), 1, '4. une seule décision journalisée pour 100 livraisons');
select is((select count(*)::int from public.factures_abonnement where stripe_invoice_id = 'in_4'), 1, '4. une seule facture');
-- Réservation d'idempotence (chemin webhook) : 1 réservation, 99 doublons comptés.
select is(public.reserver_evenement_abonnement_service('evt_4_resa', 'e0000000-0000-0000-0000-000000000004', 'invoice.payment_failed', '{}'), 'reserve', '4. première réservation');
select is((select count(*)::int from (select public.reserver_evenement_abonnement_service('evt_4_resa', 'e0000000-0000-0000-0000-000000000004', 'invoice.payment_failed', '{}') r
  from generate_series(1, 99)) d where r = 'duplicate'), 99, '4. 99 re-livraisons → duplicate');
select is((select livraisons_doublons from public.abonnement_evenements where stripe_event_id = 'evt_4_resa'), 99, '4. doublons journalisés (compteur)');
-- Même chose pour paid après failed : paid 100 fois.
select is((select count(*)::int from (select pg_temp.facture('e0000000-0000-0000-0000-000000000004', 'evt_4_paid', 'invoice.paid', 200, 'in_4') from generate_series(1, 100)) x), 100, 'livraisons répétées exécutées (100)');
select is(pg_temp.statut('e0000000-0000-0000-0000-000000000004'), 'actif', '4. paid ×100 → actif');
select is((select count(*)::int from public.stripe_evenements_ordre where entreprise_id = 'e0000000-0000-0000-0000-000000000004'), 2, '4. deux décisions au total (failed, paid)');

-- ═══════════════════════════════════════════════════════════════════════════
-- 5/6. Égalité à la seconde (paid et failed au même event.created), deux ordres
-- ═══════════════════════════════════════════════════════════════════════════
select ok(pg_temp.facture('e0000000-0000-0000-0000-000000000005', 'evt_5_paid', 'invoice.paid', 500, 'in_5b') is not null, 'livraison exécutée');
select ok(pg_temp.facture('e0000000-0000-0000-0000-000000000005', 'evt_5_failed', 'invoice.payment_failed', 500, 'in_5a') is not null, 'livraison exécutée');
select ok(pg_temp.facture('e0000000-0000-0000-0000-000000000006', 'evt_6_failed', 'invoice.payment_failed', 500, 'in_6a') is not null, 'livraison exécutée');
select ok(pg_temp.facture('e0000000-0000-0000-0000-000000000006', 'evt_6_paid', 'invoice.paid', 500, 'in_6b') is not null, 'livraison exécutée');
select is(pg_temp.statut('e0000000-0000-0000-0000-000000000005'), 'actif', '5. égalité, ordre paid→failed : actif');
select is(pg_temp.statut('e0000000-0000-0000-0000-000000000006'), 'actif', '6. égalité, ordre failed→paid : actif (même état final)');
select is((select decision from public.stripe_evenements_ordre where stripe_event_id = 'evt_5_failed'), 'perime', '5. failed à égalité après paid : périmé et journalisé');

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. 3-D Secure : en attente ≠ échec définitif
-- ═══════════════════════════════════════════════════════════════════════════
select is(pg_temp.facture('e0000000-0000-0000-0000-000000000007', 'evt_7_3ds', 'invoice.payment_action_required', 700, 'in_7')->>'decision', 'sans_effet',
  '7. payment_action_required → sans effet sur l''accès');
select is(pg_temp.statut('e0000000-0000-0000-0000-000000000007'), 'actif', '7. 3DS en attente NE SUSPEND PAS');
select is((select motif from public.stripe_evenements_ordre where stripe_event_id = 'evt_7_3ds'), 'authentification_3ds_en_attente', '7. 3DS journalisé');
select is((select count(*)::int from public.stripe_objets_ordre where objet_type = 'entreprise_acces' and objet_id = 'e0000000-0000-0000-0000-000000000007'), 0,
  '7. 3DS n''avance pas le filigrane d''accès');
select is((select derniere_facture_statut from public.entreprises where id = 'e0000000-0000-0000-0000-000000000007'), 'open', '7. trace facture mise à jour');
select ok(pg_temp.facture('e0000000-0000-0000-0000-000000000007', 'evt_7_paid', 'invoice.paid', 760, 'in_7') is not null, 'livraison exécutée');
select is(pg_temp.statut('e0000000-0000-0000-0000-000000000007'), 'actif', '7. 3DS confirmée → paid → actif');
select is(pg_temp.facture('e0000000-0000-0000-0000-000000000007', 'evt_7_3ds_replay', 'invoice.payment_action_required', 730, 'in_7')->>'decision', 'perime',
  '7. action_required rejouée après paid → périmée');
-- Ordre inversé 3DS : action_required(t950) livré AVANT le payment_failed(t900)
-- qui l'a précédé chez Stripe. Même état final que dans l'ordre Stripe.
select ok(pg_temp.facture('e0000000-0000-0000-0000-000000000009', 'evt_9_3ds', 'invoice.payment_action_required', 950, 'in_9') is not null, 'livraison exécutée');
select is(pg_temp.facture('e0000000-0000-0000-0000-000000000009', 'evt_9_failed', 'invoice.payment_failed', 900, 'in_9')->>'decision', 'applique',
  '9. payment_failed antérieur livré après la 3DS : appliqué (3DS n''est pas un filigrane)');
select is(pg_temp.statut('e0000000-0000-0000-0000-000000000009'), 'suspendu', '9. état final = ordre Stripe (échec puis 3DS) : suspendu');

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Portail / abonnements : upgrade, downgrade, cancel at period end,
--    reactivate, payment failure, payment success, ordre inversé.
-- ═══════════════════════════════════════════════════════════════════════════
select is(pg_temp.abo('e0000000-0000-0000-0000-000000000008', 'evt_8_create', 'customer.subscription.created', 1000, 'actif', 'pro', 'mensuel')->>'decision', 'applique', '8. création pro');
select is(pg_temp.statut('e0000000-0000-0000-0000-000000000008'), 'actif', '8. essai → actif');
select ok(pg_temp.abo('e0000000-0000-0000-0000-000000000008', 'evt_8_upgrade', 'customer.subscription.updated', 1100, 'actif', 'business', 'annuel') is not null, 'livraison exécutée');
select is((select abonnement_offre || '/' || abonnement_periodicite from public.entreprises where id = 'e0000000-0000-0000-0000-000000000008'), 'business/annuel', '8. upgrade appliqué');
select is((select code_offre from public.abonnements_entreprises where entreprise_id = 'e0000000-0000-0000-0000-000000000008'), 'business', '8. contrat upgradé');
select ok(pg_temp.abo('e0000000-0000-0000-0000-000000000008', 'evt_8_downgrade', 'customer.subscription.updated', 1200, 'actif', 'pro', 'mensuel') is not null, 'livraison exécutée');
select is((select abonnement_offre from public.entreprises where id = 'e0000000-0000-0000-0000-000000000008'), 'pro', '8. downgrade appliqué');
select ok(pg_temp.abo('e0000000-0000-0000-0000-000000000008', 'evt_8_cancel_end', 'customer.subscription.updated', 1300, 'actif', 'pro', 'mensuel', pg_temp.t(0) + interval '30 days') is not null, 'livraison exécutée');
select ok((select abonnement_annulation_prevue_at is not null from public.entreprises where id = 'e0000000-0000-0000-0000-000000000008'), '8. cancel at period end : annulation programmée');
select is(pg_temp.statut('e0000000-0000-0000-0000-000000000008'), 'actif', '8. cancel at period end : accès conservé jusqu''à l''échéance');
select ok(pg_temp.abo('e0000000-0000-0000-0000-000000000008', 'evt_8_reactivate', 'customer.subscription.updated', 1400, 'actif', 'pro', 'mensuel', null) is not null, 'livraison exécutée');
select ok((select abonnement_annulation_prevue_at is null from public.entreprises where id = 'e0000000-0000-0000-0000-000000000008'), '8. reactivate : annulation levée');
-- Échec de paiement au renouvellement (facture + subscription past_due, même seconde).
select ok(pg_temp.facture('e0000000-0000-0000-0000-000000000008', 'evt_8_failed', 'invoice.payment_failed', 1500, 'in_8') is not null, 'livraison exécutée');
select ok(pg_temp.abo('e0000000-0000-0000-0000-000000000008', 'evt_8_past_due', 'customer.subscription.updated', 1500, 'suspendu', 'pro', 'mensuel') is not null, 'livraison exécutée');
select is(pg_temp.statut('e0000000-0000-0000-0000-000000000008'), 'suspendu', '8. payment failure → suspendu');
-- Succès : subscription active livrée AVANT le invoice.paid, même seconde.
select ok(pg_temp.abo('e0000000-0000-0000-0000-000000000008', 'evt_8_active', 'customer.subscription.updated', 1600, 'actif', 'pro', 'mensuel') is not null, 'livraison exécutée');
select ok(pg_temp.facture('e0000000-0000-0000-0000-000000000008', 'evt_8_paid', 'invoice.paid', 1600, 'in_8') is not null, 'livraison exécutée');
select is(pg_temp.statut('e0000000-0000-0000-0000-000000000008'), 'actif', '8. payment success → actif');
-- Livraisons tardives des événements d'échec (ordre inversé) : aucun effet.
select is(pg_temp.abo('e0000000-0000-0000-0000-000000000008', 'evt_8_past_due_old', 'customer.subscription.updated', 1450, 'suspendu', 'pro', 'mensuel')->>'decision', 'perime',
  '8. subscription.updated antérieur (relu suspendu par course) → statut périmé');
select is(pg_temp.statut('e0000000-0000-0000-0000-000000000008'), 'actif', '8. le statut plus récent n''est pas inversé');
select is((select motif from public.stripe_evenements_ordre where stripe_event_id = 'evt_8_past_due_old'), 'statut_conserve_evenement_anterieur_champs_rafraichis',
  '8. subscription périmée journalisée');
select is(pg_temp.facture('e0000000-0000-0000-0000-000000000008', 'evt_8_failed_old', 'invoice.payment_failed', 1450, 'in_8_old')->>'decision', 'perime',
  '8. vieux payment_failed après succès → périmé');
select is(pg_temp.statut('e0000000-0000-0000-0000-000000000008'), 'actif', '8. toujours actif');
-- Relecture périmée : les champs non-statut (observation Stripe fraîche) restent rafraîchis.
select ok(pg_temp.abo('e0000000-0000-0000-0000-000000000008', 'evt_8_old_upgrade', 'customer.subscription.updated', 1455, 'suspendu', 'business', 'mensuel') is not null, 'livraison exécutée');
select is((select abonnement_offre || '/' || abonnement_statut from public.entreprises where id = 'e0000000-0000-0000-0000-000000000008'), 'business/actif',
  '8. événement périmé : offre relue appliquée, statut d''accès conservé');
select is((select statut from public.abonnements_entreprises where entreprise_id = 'e0000000-0000-0000-0000-000000000008'), 'actif', '8. contrat cohérent avec l''accès');
-- Suppression (annulation effective) plus récente : appliquée.
select ok(pg_temp.abo('e0000000-0000-0000-0000-000000000008', 'evt_8_deleted', 'customer.subscription.deleted', 2000, 'annule', 'business', 'mensuel') is not null, 'livraison exécutée');
select is(pg_temp.statut('e0000000-0000-0000-0000-000000000008'), 'annule', '8. subscription.deleted → annule');
select is(pg_temp.facture('e0000000-0000-0000-0000-000000000008', 'evt_8_paid_old', 'invoice.paid', 1900, 'in_8_late')->>'decision', 'perime',
  '8. invoice.paid antérieur à l''annulation, livré après → ne réactive pas');
select is(pg_temp.statut('e0000000-0000-0000-0000-000000000008'), 'annule', '8. reste annule');
-- Idempotence abonnement.
select is(pg_temp.abo('e0000000-0000-0000-0000-000000000008', 'evt_8_deleted', 'customer.subscription.deleted', 2000, 'annule', 'business', 'mensuel')->>'decision', 'deja_traite',
  '8. rejeu subscription.deleted → deja_traite');
-- Garde tenant conservée : subscription d'une autre entreprise refusée.
select throws_ok($$select pg_temp.abo('e0000000-0000-0000-0000-000000000008', 'evt_8_foreign', 'customer.subscription.updated', 3000, 'actif', 'pro', 'mensuel', null, 'sub_etrangere')$$,
  '42501', null, '8. garde tenant fail-closed conservée (subscription étrangère)');
select is((select count(*)::int from public.stripe_evenements_ordre where stripe_event_id = 'evt_8_foreign'), 0, '8. refus : aucune trace partielle (transaction annulée)');

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. Égalité à la seconde : abonnement relu (trialing → essai) vs invoice.paid
--     0 € de l'essai, deux ordres → même état final (la relecture gagne).
-- ═══════════════════════════════════════════════════════════════════════════
select ok(pg_temp.abo('e0000000-0000-0000-0000-000000000010', 'evt_10_sub', 'customer.subscription.created', 3000, 'essai', 'pro', 'mensuel', null, 'sub_ord_10') is not null, 'livraison exécutée');
select is(pg_temp.facture('e0000000-0000-0000-0000-000000000010', 'evt_10_paid', 'invoice.paid', 3000, 'in_10')->>'decision', 'perime',
  '11. invoice.paid à égalité après la relecture d''abonnement → périmé');
select ok(pg_temp.facture('e0000000-0000-0000-0000-000000000011', 'evt_11_paid', 'invoice.paid', 3000, 'in_11') is not null, 'livraison exécutée');
select ok(pg_temp.abo('e0000000-0000-0000-0000-000000000011', 'evt_11_sub', 'customer.subscription.created', 3000, 'essai', 'pro', 'mensuel', null, 'sub_ord_11') is not null, 'livraison exécutée');
select is(pg_temp.statut('e0000000-0000-0000-0000-000000000010') || '/' || pg_temp.statut('e0000000-0000-0000-0000-000000000011'), 'essai/essai',
  '11. deux ordres de livraison → même état final (essai)');
select is((select statut from public.factures_abonnement where stripe_invoice_id = 'in_10'), 'paid', '11. la facture 0 € reste enregistrée payée');

-- Validation : event.created obligatoire.
select throws_ok($$select public.appliquer_evenement_facture_abonnement_service(
  'e0000000-0000-0000-0000-000000000001', 'evt_nocreated', 'invoice.paid', null, 'in_x', 'paid', null, null, null, null, 0, 0, 0, 'eur', null, null)$$,
  '22023', null, 'event.created absent → refus (pas d''ordonnancement à l''aveugle)');
select throws_ok($$select pg_temp.facture('e0000000-0000-0000-0000-000000000001', 'evt_bad', 'invoice.created', 1, 'in_x')$$,
  '22023', null, 'type non ordonnançable refusé');

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Connect : account.updated instantané, ordonné ; expiration ≠ paiement
-- ═══════════════════════════════════════════════════════════════════════════
update public.entreprises set stripe_account_id = 'acct_ord_a' where id = 'a0000000-0000-0000-0000-000000000001';
select is(public.stripe_connect_maj_compte_service('acct_ord_a', true, 'evt_acct_new', pg_temp.t(500)), 'applique', '9. account.updated récent (onboardé) appliqué');
select is(public.stripe_connect_maj_compte_service('acct_ord_a', false, 'evt_acct_old', pg_temp.t(100)), 'perime', '9. ancien account.updated livré après → périmé');
select ok((select stripe_onboarding_complete from public.entreprises where id = 'a0000000-0000-0000-0000-000000000001'), '9. onboarding non régressé');
select is(public.stripe_connect_maj_compte_service('acct_ord_a', true, 'evt_acct_new', pg_temp.t(500)), 'deja_traite', '9. rejeu → deja_traite');
select is(public.stripe_connect_maj_compte_service('acct_inconnu', true, 'evt_acct_x', pg_temp.t(500)), 'ignore', '9. compte non rattaché → ignoré et journalisé');

select set_config('elsatia.test_facture', (
  select f.id::text from public.factures f where f.entreprise_id = 'a0000000-0000-0000-0000-000000000001' limit 1), true);
select lives_ok($$
  update public.factures set stripe_checkout_id = 'cs_ord_paid', stripe_payment_status = 'paid'
  where id = nullif(current_setting('elsatia.test_facture', true), '')::uuid
$$, '9. préparation facture Connect payée (si fixture présente)');
select lives_ok($$select public.stripe_connect_expirer_checkout_facture_service(
  nullif(current_setting('elsatia.test_facture', true), '')::uuid, 'cs_ord_paid')$$, '9. expiration tardive exécutée');
select ok(coalesce((select stripe_payment_status = 'paid' from public.factures
  where id = nullif(current_setting('elsatia.test_facture', true), '')::uuid), true),
  '9. checkout.session.expired tardif ne défait pas un paiement');

-- Replay après échec (D3) : libération de la réservation Connect/Boutique.
insert into public.stripe_webhook_events(id, event_type, livemode, facture_id) values ('evt_d3', 'checkout.session.completed', false, null);
select lives_ok($$select public.liberer_evenement_webhook_stripe_service('evt_d3')$$, 'D3. libération de la réservation après échec');
select is((select count(*)::int from public.stripe_webhook_events where id = 'evt_d3'), 0, 'D3. événement de nouveau rejouable');

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. Tools : abonnement relu, ordonné par event.created
-- ═══════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claim.role', 'service_role', true);
create function pg_temp.tools(evt text, typ text, n integer, statut text) returns jsonb language sql as $$
  select public.tools_server_appliquer_abonnement_ordonne(jsonb_build_object(
    'user_id', '10000000-0000-0000-0000-000000000001', 'provider', 'stripe', 'environment', 'test',
    'product_sku', 'tools_pro_monthly', 'external_product_id', 'price_tools_m', 'external_subscription_id', 'sub_tools_ord',
    'status', statut, 'raw_status', statut, 'expires_at', (now() + interval '30 days')::text,
    'auto_renews', true, 'event_type', typ, 'external_event_id', evt, 'metadata', '{}'::jsonb), pg_temp.t(n))
$$;
select is(pg_temp.tools('evt_t_deleted', 'customer.subscription.deleted', 800, 'expired')->>'decision', 'applique', '10. Tools deleted(t800) appliqué');
select is(pg_temp.tools('evt_t_old_active', 'customer.subscription.updated', 700, 'active')->>'decision', 'perime', '10. Tools ancien active(t700) livré après → périmé');
select is((select status from public.tools_monetization_subscriptions where external_subscription_id = 'sub_tools_ord'), 'expired', '10. Tools : pas de ré-octroi Pro par un vieil événement');
select is(pg_temp.tools('evt_t_deleted', 'customer.subscription.deleted', 800, 'expired')->>'decision', 'deja_traite', '10. Tools rejeu → deja_traite');
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_like($$select pg_temp.tools('evt_t_auth', 'customer.subscription.updated', 900, 'active')$$, '%serveur de paiement%', '10. Tools : réservé au serveur de paiement');
select set_config('request.jwt.claim.role', '', true);

select * from finish();
rollback;
