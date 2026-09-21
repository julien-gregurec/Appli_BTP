begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc
reset elsatia.capacite_personnes_bypass;

-- Plan tarifaire de référence pour le contrat.
insert into public.plans_abonnement(id, code, version, nom, prix_mensuel_ht, prix_annuel_ht, devise,
  utilisateurs_inclus, administrateurs_inclus, operations_ia_incluses, stockage_go_inclus, actif)
values ('c1a11111-0000-0000-0000-000000000001','pro',7,'Pro (test ACL)',249,2490,'EUR',15,3,0,100,true)
on conflict do nothing;

-- Entreprise A : essai, non encore liée à une subscription.
update public.entreprises
set abonnement_statut = 'essai', stripe_subscription_id = null, stripe_customer_id = null,
    abonnement_offre = null, abonnement_periodicite = null
where id = 'a0000000-0000-0000-0000-000000000001';

-- ── structure ───────────────────────────────────────────────────────────────
select has_function('public','reserver_evenement_abonnement_service','RPC réservation évènement présente');
select has_function('public','finaliser_evenement_abonnement_service','RPC finalisation évènement présente');
select has_function('public','annuler_evenement_abonnement_service','RPC annulation évènement présente');
select has_function('public','synchroniser_abonnement_stripe_service','RPC synchronisation abonnement présente');
select has_function('public','synchroniser_facture_abonnement_service','RPC synchronisation facture présente');

-- ── ACL : service uniquement ────────────────────────────────────────────────
select ok(has_function_privilege('service_role','public.synchroniser_abonnement_stripe_service(uuid,text,text,text,text,text,date,date,timestamptz,timestamptz,timestamptz)','EXECUTE'),
  'service_role : EXECUTE synchroniser_abonnement_stripe_service');
select ok(not has_function_privilege('authenticated','public.synchroniser_abonnement_stripe_service(uuid,text,text,text,text,text,date,date,timestamptz,timestamptz,timestamptz)','EXECUTE'),
  'authenticated : PAS d''EXECUTE (chemin service strict)');
select ok(not has_function_privilege('anon','public.synchroniser_abonnement_stripe_service(uuid,text,text,text,text,text,date,date,timestamptz,timestamptz,timestamptz)','EXECUTE'),
  'anon : PAS d''EXECUTE');
select ok(has_function_privilege('service_role','public.reserver_evenement_abonnement_service(text,uuid,text,jsonb)','EXECUTE'), 'service_role : EXECUTE reserver');
select ok(not has_function_privilege('authenticated','public.reserver_evenement_abonnement_service(text,uuid,text,jsonb)','EXECUTE'), 'authenticated : PAS reserver');
select ok(has_function_privilege('service_role','public.synchroniser_facture_abonnement_service(uuid,text,text,timestamptz,timestamptz,numeric,numeric,numeric,text,text,text,text)','EXECUTE'), 'service_role : EXECUTE facture');
select ok(not has_function_privilege('anon','public.synchroniser_facture_abonnement_service(uuid,text,text,timestamptz,timestamptz,numeric,numeric,numeric,text,text,text,text)','EXECUTE'), 'anon : PAS facture');

-- ── journal d'idempotence ──────────────────────────────────────────────────
select is(public.reserver_evenement_abonnement_service('evt_acl_a','a0000000-0000-0000-0000-000000000001','customer.subscription.updated','{"k":1}'::jsonb),
  'reserve', 'première réservation → reserve');
select is(public.reserver_evenement_abonnement_service('evt_acl_a','a0000000-0000-0000-0000-000000000001','x','{}'::jsonb),
  'duplicate', 'rejeu même event → duplicate');
select is((select count(*)::int from public.abonnement_evenements where stripe_event_id='evt_acl_a'), 1, 'une seule ligne journal');
select lives_ok($$select public.finaliser_evenement_abonnement_service('evt_acl_a','actif')$$, 'finalisation');
select is((select statut_resultant from public.abonnement_evenements where stripe_event_id='evt_acl_a'), 'actif', 'statut_resultant consigné');
select lives_ok($$select public.annuler_evenement_abonnement_service('evt_acl_a')$$, 'annulation (rollback réservation)');
select is((select count(*)::int from public.abonnement_evenements where stripe_event_id='evt_acl_a'), 0, 'ligne journal supprimée → rejouable');

-- ── synchronisation abonnement de base : première liaison ───────────────────
select is(
  public.synchroniser_abonnement_stripe_service(
    'a0000000-0000-0000-0000-000000000001','sub_acl_A','cus_acl_A','actif','pro','mensuel',
    date '2026-12-01', date '2026-09-30', null, now(), now() + interval '30 days'),
  'actif', 'synchronisation → statut renvoyé');
select is((select stripe_subscription_id from public.entreprises where id='a0000000-0000-0000-0000-000000000001'), 'sub_acl_A', 'subscription liée');
select is((select abonnement_statut from public.entreprises where id='a0000000-0000-0000-0000-000000000001'), 'actif', 'statut appliqué');
select is((select abonnement_offre from public.entreprises where id='a0000000-0000-0000-0000-000000000001'), 'pro', 'offre appliquée');
select is((select abonnement_periodicite from public.entreprises where id='a0000000-0000-0000-0000-000000000001'), 'mensuel', 'périodicité appliquée');
select is((select abonnement_echeance from public.entreprises where id='a0000000-0000-0000-0000-000000000001'), date '2026-12-01', 'échéance appliquée');
select is((select code_offre from public.abonnements_entreprises where entreprise_id='a0000000-0000-0000-0000-000000000001'), 'pro', 'contrat : offre');
select is((select periodicite from public.abonnements_entreprises where entreprise_id='a0000000-0000-0000-0000-000000000001'), 'mensuel', 'contrat : périodicité');
select is((select statut from public.abonnements_entreprises where entreprise_id='a0000000-0000-0000-0000-000000000001'), 'actif', 'contrat : statut');
select ok((select prix_contractuel_ht from public.abonnements_entreprises where entreprise_id='a0000000-0000-0000-0000-000000000001') is not null, 'contrat : prix contractuel renseigné');

-- seules les colonnes autorisées ont bougé : le nom de l'entreprise est intact
select is((select nom from public.entreprises where id='a0000000-0000-0000-0000-000000000001'), 'Entreprise Isolation A', 'colonnes non-abonnement inchangées (nom)');
select is((select code_adhesion from public.entreprises where id='a0000000-0000-0000-0000-000000000001'), 'ISOA0001', 'colonnes non-abonnement inchangées (code_adhesion)');
select is((select capacite_personnes_supplementaire from public.entreprises where id='a0000000-0000-0000-0000-000000000001'), 0, 'capacité personne intacte (hors périmètre)');

-- ── idempotence : rejeu même observation → même état ────────────────────────
select lives_ok($$
  select public.synchroniser_abonnement_stripe_service(
    'a0000000-0000-0000-0000-000000000001','sub_acl_A','cus_acl_A','actif','pro','mensuel',
    date '2026-12-01', date '2026-09-30', null, now(), now() + interval '30 days')
$$, 'rejeu idempotent');
select is((select count(*)::int from public.abonnements_entreprises where entreprise_id='a0000000-0000-0000-0000-000000000001'), 1, 'contrat : pas de doublon (upsert)');

-- ── garde tenant : subscription étrangère → 42501 ──────────────────────────
select throws_ok($$
  select public.synchroniser_abonnement_stripe_service(
    'a0000000-0000-0000-0000-000000000001','sub_ETRANGERE','cus_x','actif','pro','mensuel',
    null, date '2026-09-30', null, null, null)
$$, '42501', 'Subscription Stripe non liée à cette entreprise', 'subscription étrangère → refus fail-closed');
select is((select stripe_subscription_id from public.entreprises where id='a0000000-0000-0000-0000-000000000001'), 'sub_acl_A', 'aucune mutation après refus tenant');

-- entreprise inconnue → P0002
select throws_ok($$
  select public.synchroniser_abonnement_stripe_service(
    '00000000-0000-0000-0000-0000000000ff','sub_x','cus_x','actif','pro','mensuel', null,null,null,null,null)
$$, 'P0002', 'Entreprise introuvable', 'entreprise inconnue → refus');

-- statut invalide → 22023
select throws_ok($$
  select public.synchroniser_abonnement_stripe_service(
    'a0000000-0000-0000-0000-000000000001','sub_acl_A','cus_acl_A','zombie','pro','mensuel', null,null,null,null,null)
$$, '22023', 'Statut d''abonnement invalide', 'statut hors référentiel → refus');

-- ── facture d'abonnement ───────────────────────────────────────────────────
select lives_ok($$
  select public.synchroniser_facture_abonnement_service(
    'a0000000-0000-0000-0000-000000000001','in_acl_1','FAC-ACL-1',
    now() - interval '30 days', now(), 200.00, 40.00, 240.00, 'eur', 'paid',
    'https://invoice/acl1', 'https://invoice/acl1.pdf')
$$, 'upsert facture');
select is((select montant_ttc from public.factures_abonnement where stripe_invoice_id='in_acl_1'), 240.00, 'facture : montant TTC');
select is((select devise from public.factures_abonnement where stripe_invoice_id='in_acl_1'), 'EUR', 'facture : devise normalisée');
select ok((select payee_at from public.factures_abonnement where stripe_invoice_id='in_acl_1') is not null, 'facture payée → payee_at renseigné');
select lives_ok($$
  select public.synchroniser_facture_abonnement_service(
    'a0000000-0000-0000-0000-000000000001','in_acl_1','FAC-ACL-1',
    now() - interval '30 days', now(), 200.00, 40.00, 240.00, 'eur', 'open', null, null)
$$, 'rejeu facture (upsert)');
select is((select count(*)::int from public.factures_abonnement where stripe_invoice_id='in_acl_1'), 1, 'facture : pas de doublon');
select is((select statut from public.factures_abonnement where stripe_invoice_id='in_acl_1'), 'open', 'facture : statut mis à jour');

-- ── non-régression capacité R2 : les RPC capacité restent intactes ─────────
select has_function('public','synchroniser_capacite_stripe_service','R2-B RPC capacité toujours présente');
select has_function('public','annuler_baisse_capacite_planifiee','R2-D RPC annulation baisse toujours présente');

select * from finish();
rollback;
