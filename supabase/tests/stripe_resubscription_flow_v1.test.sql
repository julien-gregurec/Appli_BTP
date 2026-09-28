begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ELSATIA — Stripe Resubscription Flow V1 (migration 20260927000508).
-- Réabonnement d'une entreprise dont la subscription Stripe a été annulée :
-- cas Stripe (cancel_at_period_end, canceled, unpaid, past_due, subscription
-- deleted, customer existant sans abonnement), réactivation préférée, aucun
-- nouvel essai, même customer, garde anti-double abonnement, webhooks ordonnés
-- (created / updated / deleted / invoice.paid / invoice.payment_failed) dans
-- les 120 ordres possibles, rejeux, droits rendus uniquement sur un état Stripe
-- compatible.
--
-- Les horodatages d'événements sont fixes. Les fenêtres d'essai sont relatives
-- à current_date : le réabonnement clôt l'essai « à hier » (current_date - 1).

\ir fixtures/isolation_multitenant.inc

insert into public.plans_abonnement(id, code, version, nom, prix_mensuel_ht, prix_annuel_ht, devise,
  utilisateurs_inclus, administrateurs_inclus, operations_ia_incluses, stockage_go_inclus, actif)
values ('c1a11111-0000-0000-0000-0000000000c1','pro',10,'Pro (test réabonnement)',249,2490,'EUR',15,3,0,100,true)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- Simulation fidèle du chemin applicatif (synchroniserAbonnementCoordonne +
-- route invoice.*), Stripe étant représenté par sa « vérité » relue.
-- ─────────────────────────────────────────────────────────────────────────────
create temp table verite_stripe (sub text primary key, status text not null);

create function pg_temp.t(n integer) returns timestamptz language sql immutable
as $$ select timestamptz '2026-11-01 00:00:00+00' + make_interval(secs => n) $$;

create function pg_temp.statut(stripe text) returns text language sql immutable as $$
  select case when stripe = 'trialing' then 'essai' when stripe = 'active' then 'actif'
              when stripe in ('past_due','unpaid','incomplete','paused') then 'suspendu' else 'annule' end
$$;

create function pg_temp.verite(p_sub text, p_status text) returns void language sql as $$
  insert into verite_stripe values (p_sub, p_status) on conflict (sub) do update set status = excluded.status
$$;

-- customer.subscription.* / checkout.session.completed : relecture Stripe,
-- rattachement (première liaison ou réabonnement), puis RPC ordonnée.
create function pg_temp.evt_sub(e uuid, evt text, typ text, sub text, n integer,
  essai date default null, annulation timestamptz default null, cus text default null)
returns text language plpgsql as $$
declare
  v_courante text; v_cus text; v_issue text; v_status text; v_anc_status text; v_res jsonb;
begin
  select stripe_subscription_id, stripe_customer_id into v_courante, v_cus from public.entreprises where id = e;
  select status into v_status from verite_stripe where verite_stripe.sub = evt_sub.sub;
  if v_courante is not null and v_courante <> sub then
    select status into v_anc_status from verite_stripe where verite_stripe.sub = v_courante;
  end if;
  v_issue := public.relier_subscription_reabonnement_service(e, sub, coalesce(cus, v_cus, 'cus_' || left(e::text, 8)), v_status,
    case when v_courante <> sub then v_courante end, v_anc_status);
  if v_issue in ('remplacee', 'terminale_ignoree') then
    perform public.journaliser_evenement_stripe_ordre_service('abonnement', evt, typ, pg_temp.t(n), 'subscription', sub, e,
      case when v_issue = 'remplacee' then 'subscription_remplacee' else 'subscription_terminale_non_rattachee' end);
    return v_issue;
  end if;
  v_res := public.synchroniser_abonnement_stripe_ordonne_service(
    e, sub, coalesce(cus, v_cus, 'cus_' || left(e::text, 8)), pg_temp.statut(v_status), 'pro', 'mensuel',
    current_date + 30, essai, annulation, pg_temp.t(0), pg_temp.t(0) + interval '30 days',
    evt, typ, pg_temp.t(n), 'subscription', sub);
  return v_issue || ':' || (v_res->>'decision');
end;
$$;

create function pg_temp.fac(e uuid, evt text, typ text, invoice text, sub text, n integer) returns text language sql as $$
  select public.appliquer_evenement_facture_abonnement_v2_service(
    e, evt, typ, pg_temp.t(n), invoice, case when typ = 'invoice.paid' then 'paid' else 'open' end, pg_temp.t(n),
    'ELS-' || invoice, pg_temp.t(0), pg_temp.t(0) + interval '30 days', 249, 49.8, 298.8, 'eur',
    'https://invoice.stripe.com/i/' || invoice, null, sub)->>'decision'
$$;

create function pg_temp.st(e uuid) returns text language sql as $$
  select abonnement_statut from public.entreprises where id = e
$$;
create function pg_temp.courante(e uuid) returns text language sql as $$
  select stripe_subscription_id from public.entreprises where id = e
$$;

-- Entreprises : essai commencé il y a 10 jours (fenêtre ouverte jusqu'à J+20).
insert into public.entreprises (id, nom, code_adhesion, abonnement_statut, abonnement_essai_debut, abonnement_essai_fin, stripe_customer_id)
select ('a5000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'Réabonnement ' || i, 'RSB' || lpad(i::text, 5, '0'),
       'essai', current_date - 10, current_date + 20, 'cus_rsb_' || i
from generate_series(1, 20) i;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0. Structure, ACL
-- ═══════════════════════════════════════════════════════════════════════════
select has_table('public', 'stripe_subscriptions_remplacees', 'historique des subscriptions remplacées');
select ok((select relrowsecurity from pg_class where oid = 'public.stripe_subscriptions_remplacees'::regclass), 'RLS historique activée');
select ok(not has_table_privilege('service_role', 'public.stripe_subscriptions_remplacees', 'INSERT'), 'service_role : aucune écriture directe dans l''historique');
select ok(not has_table_privilege('authenticated', 'public.stripe_subscriptions_remplacees', 'INSERT'), 'authenticated : aucune écriture directe');
select ok(has_function_privilege('service_role', 'public.relier_subscription_reabonnement_service(uuid,text,text,text,text,text)', 'EXECUTE'), 'service_role : rattachement');
select ok(not has_function_privilege('authenticated', 'public.relier_subscription_reabonnement_service(uuid,text,text,text,text,text)', 'EXECUTE'), 'authenticated : pas de rattachement');
select ok(not has_function_privilege('anon', 'public.relier_subscription_reabonnement_service(uuid,text,text,text,text,text)', 'EXECUTE'), 'anon : pas de rattachement');
select ok(has_function_privilege('service_role', 'public.appliquer_evenement_facture_abonnement_v2_service(uuid,text,text,timestamptz,text,text,timestamptz,text,timestamptz,timestamptz,numeric,numeric,numeric,text,text,text,text)', 'EXECUTE'), 'service_role : facture v2');
select ok(not has_function_privilege('authenticated', 'public.appliquer_evenement_facture_abonnement_v2_service(uuid,text,text,timestamptz,text,text,timestamptz,text,timestamptz,timestamptz,numeric,numeric,numeric,text,text,text,text)', 'EXECUTE'), 'authenticated : pas de facture v2');

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. cancel_at_period_end : réactivable → jamais de nouvelle subscription
-- ═══════════════════════════════════════════════════════════════════════════
select pg_temp.verite('sub_rsb_1', 'active');
select is(pg_temp.evt_sub('a5000000-0000-4000-8000-000000000001', 'evt_1_a', 'customer.subscription.created', 'sub_rsb_1', 10), 'lie:applique', 'C1 première liaison');
select is(pg_temp.evt_sub('a5000000-0000-4000-8000-000000000001', 'evt_1_b', 'customer.subscription.updated', 'sub_rsb_1', 20, null, pg_temp.t(0) + interval '30 days'), 'deja_lie:applique', 'C1 résiliation programmée');
select is(pg_temp.st('a5000000-0000-4000-8000-000000000001'), 'actif', 'C1 accès conservé jusqu''à la fin de période');
select isnt((select abonnement_annulation_prevue_at from public.entreprises where id = 'a5000000-0000-4000-8000-000000000001'), null, 'C1 annulation programmée visible');
select pg_temp.verite('sub_rsb_1_bis', 'active');
select throws_ok($$ select public.relier_subscription_reabonnement_service('a5000000-0000-4000-8000-000000000001', 'sub_rsb_1_bis', 'cus_rsb_1', 'active', 'sub_rsb_1', 'active') $$,
  '42501', 'La subscription rattachée est encore active chez Stripe', 'C1 anti-double abonnement : aucun remplacement tant que l''ancienne vit');
-- Reprise via le Portail : Stripe envoie updated, cancel_at_period_end = false.
select is(pg_temp.evt_sub('a5000000-0000-4000-8000-000000000001', 'evt_1_c', 'customer.subscription.updated', 'sub_rsb_1', 30), 'deja_lie:applique', 'C1 reprise (Portail)');
select is((select abonnement_annulation_prevue_at from public.entreprises where id = 'a5000000-0000-4000-8000-000000000001'), null, 'C1 annulation effacée, même subscription');
select is(pg_temp.courante('a5000000-0000-4000-8000-000000000001'), 'sub_rsb_1', 'C1 aucune nouvelle subscription');

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. canceled / subscription deleted → nouveau Checkout rattaché
-- ═══════════════════════════════════════════════════════════════════════════
select pg_temp.verite('sub_rsb_2a', 'active');
select pg_temp.evt_sub('a5000000-0000-4000-8000-000000000002', 'evt_2_a', 'customer.subscription.created', 'sub_rsb_2a', 10);
select pg_temp.verite('sub_rsb_2a', 'canceled');
select is(pg_temp.evt_sub('a5000000-0000-4000-8000-000000000002', 'evt_2_del', 'customer.subscription.deleted', 'sub_rsb_2a', 100), 'deja_lie:applique', 'C2 deleted appliqué');
select is(pg_temp.st('a5000000-0000-4000-8000-000000000002'), 'annule', 'C2 abonnement annulé : aucun droit');
-- Nouvelle subscription d'un AUTRE client : jamais rattachée.
select throws_ok($$ select public.relier_subscription_reabonnement_service('a5000000-0000-4000-8000-000000000002', 'sub_rsb_2x', 'cus_intrus', 'active', 'sub_rsb_2a', 'canceled') $$,
  '42501', 'Client Stripe différent de celui de l''entreprise', 'C2 même customer obligatoire');
-- Nouvelle subscription déjà terminale : jamais rattachée.
select is(public.relier_subscription_reabonnement_service('a5000000-0000-4000-8000-000000000002', 'sub_rsb_2t', 'cus_rsb_2', 'incomplete_expired', 'sub_rsb_2a', 'canceled'),
  'terminale_ignoree', 'C2 subscription terminale ignorée');
select is(pg_temp.courante('a5000000-0000-4000-8000-000000000002'), 'sub_rsb_2a', 'C2 inchangée après refus');
-- Réabonnement : Checkout payé, subscription incomplete puis active.
select pg_temp.verite('sub_rsb_2b', 'incomplete');
select is(pg_temp.evt_sub('a5000000-0000-4000-8000-000000000002', 'evt_2_b', 'checkout.session.completed', 'sub_rsb_2b', 200), 'relie:applique', 'C2 rattachement du réabonnement');
select is(pg_temp.courante('a5000000-0000-4000-8000-000000000002'), 'sub_rsb_2b', 'C2 nouvelle subscription courante');
select is(pg_temp.st('a5000000-0000-4000-8000-000000000002'), 'suspendu', 'C2 paiement non confirmé (incomplete) : aucun droit');
select is((select stripe_customer_id from public.entreprises where id = 'a5000000-0000-4000-8000-000000000002'), 'cus_rsb_2', 'C2 même customer Stripe');
select is((select remplacee_par || '/' || statut_stripe_observe from public.stripe_subscriptions_remplacees where stripe_subscription_id = 'sub_rsb_2a'),
  'sub_rsb_2b/canceled', 'C2 ancienne historisée');
select is((select abonnement_essai_fin from public.entreprises where id = 'a5000000-0000-4000-8000-000000000002'), current_date - 1, 'C2 essai ELSATIA clos (consommé)');
select is(pg_temp.fac('a5000000-0000-4000-8000-000000000002', 'evt_2_paid', 'invoice.paid', 'in_rsb_2b', 'sub_rsb_2b', 210), 'applique', 'C2 invoice.paid de la nouvelle');
select is(pg_temp.st('a5000000-0000-4000-8000-000000000002'), 'actif', 'C2 droits rendus après paiement confirmé');
-- Rejeux et événements tardifs de l'ancienne.
select is(pg_temp.evt_sub('a5000000-0000-4000-8000-000000000002', 'evt_2_del', 'customer.subscription.deleted', 'sub_rsb_2a', 100), 'remplacee', 'C2 rejeu deleted de l''ancienne : sans effet');
select is(pg_temp.evt_sub('a5000000-0000-4000-8000-000000000002', 'evt_2_late', 'customer.subscription.updated', 'sub_rsb_2a', 900), 'remplacee', 'C2 updated tardif de l''ancienne : sans effet');
select is(pg_temp.fac('a5000000-0000-4000-8000-000000000002', 'evt_2_oldfail', 'invoice.payment_failed', 'in_rsb_2a_final', 'sub_rsb_2a', 950), 'sans_effet', 'C2 payment_failed tardif de l''ancienne (plus récent) : sans effet');
select is(pg_temp.st('a5000000-0000-4000-8000-000000000002'), 'actif', 'C2 la nouvelle n''est jamais suspendue par l''ancienne');
select is((select motif from public.stripe_evenements_ordre where stripe_event_id = 'evt_2_oldfail'), 'subscription_remplacee', 'C2 journalisé subscription_remplacee');
select is((select statut from public.factures_abonnement where stripe_invoice_id = 'in_rsb_2a_final'), 'open', 'C2 facture de l''ancienne conservée à l''historique');
select is(pg_temp.fac('a5000000-0000-4000-8000-000000000002', 'evt_2_oldfail', 'invoice.payment_failed', 'in_rsb_2a_final', 'sub_rsb_2a', 950), 'deja_traite', 'C2 rejeu : déjà traité');
select throws_ok($$ select public.synchroniser_abonnement_stripe_service('a5000000-0000-4000-8000-000000000002', 'sub_rsb_2a', 'cus_rsb_2', 'annule', 'pro', 'mensuel', null, null, null, null, null) $$,
  '42501', null, 'C2 la garde tenant historique refuse toujours l''ancienne');
select is(public.relier_subscription_reabonnement_service('a5000000-0000-4000-8000-000000000002', 'sub_rsb_2a', 'cus_rsb_2', 'active', 'sub_rsb_2b', 'active'),
  'remplacee', 'C2 une subscription remplacée ne redevient jamais courante');
select is(public.relier_subscription_reabonnement_service('a5000000-0000-4000-8000-000000000002', 'sub_rsb_2b', 'cus_rsb_2', 'active', null, null),
  'deja_lie', 'C2 rattachement rejoué : idempotent');
select is((select count(*)::int from public.stripe_subscriptions_remplacees where entreprise_id = 'a5000000-0000-4000-8000-000000000002'), 1, 'C2 un seul remplacement');

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. unpaid : réactivable (paiement), jamais remplacé
-- ═══════════════════════════════════════════════════════════════════════════
select pg_temp.verite('sub_rsb_3', 'active');
select pg_temp.evt_sub('a5000000-0000-4000-8000-000000000003', 'evt_3_a', 'customer.subscription.created', 'sub_rsb_3', 10);
select is(pg_temp.fac('a5000000-0000-4000-8000-000000000003', 'evt_3_fail', 'invoice.payment_failed', 'in_rsb_3', 'sub_rsb_3', 20), 'applique', 'C3 échec de paiement');
select pg_temp.verite('sub_rsb_3', 'unpaid');
select is(pg_temp.evt_sub('a5000000-0000-4000-8000-000000000003', 'evt_3_unpaid', 'customer.subscription.updated', 'sub_rsb_3', 30), 'deja_lie:applique', 'C3 unpaid');
select is(pg_temp.st('a5000000-0000-4000-8000-000000000003'), 'suspendu', 'C3 unpaid : aucun droit');
select throws_ok($$ select public.relier_subscription_reabonnement_service('a5000000-0000-4000-8000-000000000003', 'sub_rsb_3_bis', 'cus_rsb_3', 'active', 'sub_rsb_3', 'unpaid') $$,
  '42501', null, 'C3 unpaid n''est pas terminal : pas de seconde subscription');
select is(pg_temp.fac('a5000000-0000-4000-8000-000000000003', 'evt_3_paid', 'invoice.paid', 'in_rsb_3', 'sub_rsb_3', 40), 'applique', 'C3 facture réglée (Portail / lien de facture)');
select is(pg_temp.st('a5000000-0000-4000-8000-000000000003'), 'actif', 'C3 réactivée sur la même subscription');

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. past_due : réactivable (moyen de paiement), jamais remplacé
-- ═══════════════════════════════════════════════════════════════════════════
select pg_temp.verite('sub_rsb_4', 'active');
select pg_temp.evt_sub('a5000000-0000-4000-8000-000000000004', 'evt_4_a', 'customer.subscription.created', 'sub_rsb_4', 10);
select pg_temp.verite('sub_rsb_4', 'past_due');
select pg_temp.evt_sub('a5000000-0000-4000-8000-000000000004', 'evt_4_pd', 'customer.subscription.updated', 'sub_rsb_4', 20);
select is(pg_temp.st('a5000000-0000-4000-8000-000000000004'), 'suspendu', 'C4 past_due : aucun droit');
select throws_ok($$ select public.relier_subscription_reabonnement_service('a5000000-0000-4000-8000-000000000004', 'sub_rsb_4_bis', 'cus_rsb_4', 'active', 'sub_rsb_4', 'past_due') $$,
  '42501', null, 'C4 past_due n''est pas terminal');
select pg_temp.verite('sub_rsb_4', 'active');
select is(pg_temp.evt_sub('a5000000-0000-4000-8000-000000000004', 'evt_4_ok', 'customer.subscription.updated', 'sub_rsb_4', 30), 'deja_lie:applique', 'C4 paiement repris');
select is(pg_temp.st('a5000000-0000-4000-8000-000000000004'), 'actif', 'C4 droits rendus par l''état Stripe active');

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Entreprise annulée : une ancienne facture payée ne rouvre rien
-- ═══════════════════════════════════════════════════════════════════════════
select pg_temp.verite('sub_rsb_5', 'active');
select pg_temp.evt_sub('a5000000-0000-4000-8000-000000000005', 'evt_5_a', 'customer.subscription.created', 'sub_rsb_5', 10);
select pg_temp.verite('sub_rsb_5', 'canceled');
select pg_temp.evt_sub('a5000000-0000-4000-8000-000000000005', 'evt_5_del', 'customer.subscription.deleted', 'sub_rsb_5', 100);
select pg_temp.verite('sub_rsb_5b', 'active');
select pg_temp.evt_sub('a5000000-0000-4000-8000-000000000005', 'evt_5_b', 'customer.subscription.created', 'sub_rsb_5b', 200);
select pg_temp.verite('sub_rsb_5b', 'canceled');
select pg_temp.evt_sub('a5000000-0000-4000-8000-000000000005', 'evt_5_bdel', 'customer.subscription.deleted', 'sub_rsb_5b', 300);
select is(pg_temp.st('a5000000-0000-4000-8000-000000000005'), 'annule', 'C5 second abonnement annulé');
select is(pg_temp.fac('a5000000-0000-4000-8000-000000000005', 'evt_5_oldpaid', 'invoice.paid', 'in_rsb_5_vieille', 'sub_rsb_5', 400), 'sans_effet', 'C5 invoice.paid d''une subscription remplacée : sans effet');
select is(pg_temp.st('a5000000-0000-4000-8000-000000000005'), 'annule', 'C5 aucun droit rouvert par une ancienne facture');
-- Deuxième réabonnement (chaîne) : l'essai reste clos, l'historique s'allonge.
select pg_temp.verite('sub_rsb_5c', 'active');
select is(pg_temp.evt_sub('a5000000-0000-4000-8000-000000000005', 'evt_5_c', 'customer.subscription.created', 'sub_rsb_5c', 500), 'relie:applique', 'C5 second réabonnement');
select is((select count(*)::int from public.stripe_subscriptions_remplacees where entreprise_id = 'a5000000-0000-4000-8000-000000000005'), 2, 'C5 deux remplacements historisés');
select is(pg_temp.st('a5000000-0000-4000-8000-000000000005'), 'actif', 'C5 actif sur la troisième subscription');

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Customer existant sans abonnement : première liaison, même customer
-- ═══════════════════════════════════════════════════════════════════════════
select pg_temp.verite('sub_rsb_6', 'trialing');
select is(pg_temp.evt_sub('a5000000-0000-4000-8000-000000000006', 'evt_6_a', 'customer.subscription.created', 'sub_rsb_6', 10, current_date + 20), 'lie:applique', 'C6 première liaison, customer réutilisé');
select is(pg_temp.st('a5000000-0000-4000-8000-000000000006'), 'essai', 'C6 premier abonnement : reliquat d''essai conservé');
select is((select abonnement_essai_fin from public.entreprises where id = 'a5000000-0000-4000-8000-000000000006'), current_date + 20, 'C6 essai non prolongé, non clos');
select throws_ok($$ select public.relier_subscription_reabonnement_service('a5000000-0000-4000-8000-000000000007', 'sub_rsb_7', 'cus_autre_client', 'active', null, null) $$,
  '42501', 'Client Stripe différent de celui de l''entreprise', 'C6 subscription d''un autre customer : jamais liée');

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Essai consommé : un « trialing » sur le réabonnement ne rouvre rien
-- ═══════════════════════════════════════════════════════════════════════════
select pg_temp.verite('sub_rsb_8a', 'active');
select pg_temp.evt_sub('a5000000-0000-4000-8000-000000000008', 'evt_8_a', 'customer.subscription.created', 'sub_rsb_8a', 10);
select pg_temp.verite('sub_rsb_8a', 'incomplete_expired');
select pg_temp.evt_sub('a5000000-0000-4000-8000-000000000008', 'evt_8_exp', 'customer.subscription.updated', 'sub_rsb_8a', 20);
select pg_temp.verite('sub_rsb_8b', 'trialing');
select is(pg_temp.evt_sub('a5000000-0000-4000-8000-000000000008', 'evt_8_b', 'customer.subscription.created', 'sub_rsb_8b', 30, current_date + 25), 'relie:applique', 'C7 ancienne incomplete_expired : réabonnement permis');
select is((select abonnement_essai_fin from public.entreprises where id = 'a5000000-0000-4000-8000-000000000008'), current_date - 1, 'C7 trial Stripe ignoré : essai clos, jamais rouvert');
select ok((select abonnement_essai_fin < current_date from public.entreprises where id = 'a5000000-0000-4000-8000-000000000008'), 'C7 fenêtre d''accès essai expirée (getContexteEntreprise bloque)');
select is((select nature from public.stripe_essai_ecarts where entreprise_id = 'a5000000-0000-4000-8000-000000000008'), 'depasse_fenetre_locale', 'C7 écart journalisé');

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Facture d'une subscription inconnue : différée, puis appliquée
-- ═══════════════════════════════════════════════════════════════════════════
select pg_temp.verite('sub_rsb_9a', 'active');
select pg_temp.evt_sub('a5000000-0000-4000-8000-000000000009', 'evt_9_a', 'customer.subscription.created', 'sub_rsb_9a', 10);
select pg_temp.verite('sub_rsb_9a', 'canceled');
select pg_temp.evt_sub('a5000000-0000-4000-8000-000000000009', 'evt_9_del', 'customer.subscription.deleted', 'sub_rsb_9a', 100);
select pg_temp.verite('sub_rsb_9b', 'active');
select is(pg_temp.fac('a5000000-0000-4000-8000-000000000009', 'evt_9_paid', 'invoice.paid', 'in_rsb_9b', 'sub_rsb_9b', 210), 'differe', 'C8 invoice.paid avant le rattachement : différé');
select is(pg_temp.st('a5000000-0000-4000-8000-000000000009'), 'annule', 'C8 aucun droit sur une subscription non rattachée');
select is((select count(*)::int from public.stripe_evenements_ordre where stripe_event_id = 'evt_9_paid'), 0, 'C8 différé non journalisé (rejouable)');
select is((select count(*)::int from public.factures_abonnement where stripe_invoice_id = 'in_rsb_9b'), 0, 'C8 rien écrit');
select pg_temp.evt_sub('a5000000-0000-4000-8000-000000000009', 'evt_9_b', 'customer.subscription.created', 'sub_rsb_9b', 200);
select is(pg_temp.fac('a5000000-0000-4000-8000-000000000009', 'evt_9_paid', 'invoice.paid', 'in_rsb_9b', 'sub_rsb_9b', 210), 'applique', 'C8 re-livraison après rattachement : appliquée');
select is(pg_temp.st('a5000000-0000-4000-8000-000000000009'), 'actif', 'C8 droits rendus');
select is(pg_temp.fac('a5000000-0000-4000-8000-000000000009', 'evt_9_sans_sub', 'invoice.payment_action_required', 'in_rsb_9x', null, 220), 'sans_effet', 'C8 facture sans subscription : contrat 506 inchangé');

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Double réabonnement concurrent (séquentialisé par le verrou)
-- ═══════════════════════════════════════════════════════════════════════════
select pg_temp.verite('sub_rsb_10a', 'active');
select pg_temp.evt_sub('a5000000-0000-4000-8000-000000000010', 'evt_10_a', 'customer.subscription.created', 'sub_rsb_10a', 10);
select pg_temp.verite('sub_rsb_10a', 'canceled');
select pg_temp.evt_sub('a5000000-0000-4000-8000-000000000010', 'evt_10_del', 'customer.subscription.deleted', 'sub_rsb_10a', 100);
select is(public.relier_subscription_reabonnement_service('a5000000-0000-4000-8000-000000000010', 'sub_rsb_10x', 'cus_rsb_10', 'active', 'sub_rsb_10a', 'canceled'), 'relie', 'C9 premier gagne');
select throws_ok($$ select public.relier_subscription_reabonnement_service('a5000000-0000-4000-8000-000000000010', 'sub_rsb_10y', 'cus_rsb_10', 'active', 'sub_rsb_10a', 'canceled') $$,
  '42501', 'Subscription Stripe non liée à cette entreprise', 'C9 second (même ancienne) refusé');
select throws_ok($$ select public.relier_subscription_reabonnement_service('a5000000-0000-4000-8000-000000000010', 'sub_rsb_10y', 'cus_rsb_10', 'active', 'sub_rsb_10x', 'active') $$,
  '42501', 'La subscription rattachée est encore active chez Stripe', 'C9 second (relu vivant) refusé : jamais deux subscriptions');

-- ═══════════════════════════════════════════════════════════════════════════
-- 9 bis. Filigrane : un created de la nouvelle, refusé tant que l'ancienne
--        vivait puis re-livré APRÈS le deleted (plus récent) de l'ancienne,
--        s'applique quand même (le filigrane de l'ancienne est réinitialisé).
-- ═══════════════════════════════════════════════════════════════════════════
select pg_temp.verite('sub_rsb_11a', 'active');
select pg_temp.evt_sub('a5000000-0000-4000-8000-000000000011', 'evt_11_a', 'customer.subscription.created', 'sub_rsb_11a', 10);
select pg_temp.verite('sub_rsb_11b', 'active');
select throws_ok($$ select pg_temp.evt_sub('a5000000-0000-4000-8000-000000000011', 'evt_11_b', 'customer.subscription.created', 'sub_rsb_11b', 150) $$,
  '42501', null, 'C10 nouvelle créée pendant que l''ancienne vit : refusée (422, re-livrée)');
select pg_temp.verite('sub_rsb_11a', 'canceled');
select pg_temp.evt_sub('a5000000-0000-4000-8000-000000000011', 'evt_11_del', 'customer.subscription.deleted', 'sub_rsb_11a', 300);
select is(pg_temp.evt_sub('a5000000-0000-4000-8000-000000000011', 'evt_11_b', 'customer.subscription.created', 'sub_rsb_11b', 150), 'relie:applique', 'C10 re-livraison après le deleted : rattachée et APPLIQUÉE');
select is(pg_temp.st('a5000000-0000-4000-8000-000000000011'), 'actif', 'C10 droits rendus malgré un événement antérieur au deleted de l''ancienne');
select is(pg_temp.fac('a5000000-0000-4000-8000-000000000011', 'evt_11_oldfail', 'invoice.payment_failed', 'in_rsb_11a', 'sub_rsb_11a', 400), 'sans_effet', 'C10 l''ancienne reste sans effet');

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. Ordre : created / updated / deleted / invoice.paid / invoice.payment_failed
--     dans les 120 ordres de livraison (factures différées re-livrées ensuite)
-- ═══════════════════════════════════════════════════════════════════════════
create temp table ordre_resultats (perm int, ordre text, statut text, courante text, historique int, essai_ouvert boolean, erreurs int, violations int);

do $$
declare
  v_perm int[];
  v_n int := 0;
  v_e uuid;
  v_ev int;
  v_ret text;
  v_file int[];
  v_erreurs int;
  v_violations int;
  v_del_applique boolean;
  v_tentative int;
begin
  for v_perm in
    with recursive p(a) as (
      select array[x] from generate_series(1, 5) x
      union all
      select p.a || x from p, generate_series(1, 5) x where not x = any(p.a)
    ) select a from p where array_length(a, 1) = 5
  loop
    v_n := v_n + 1;
    v_e := ('a6000000-0000-4000-8000-' || lpad(v_n::text, 12, '0'))::uuid;
    insert into public.entreprises (id, nom, code_adhesion, abonnement_statut, abonnement_essai_debut, abonnement_essai_fin, stripe_customer_id)
    values (v_e, 'Ordre ' || v_n, 'ORD' || lpad(v_n::text, 5, '0'), 'essai', current_date - 10, current_date + 20, 'cus_ord_' || v_n);
    perform pg_temp.verite('sub_ord_old_' || v_n, 'active');
    perform pg_temp.evt_sub(v_e, 'evt_ord_init_' || v_n, 'customer.subscription.created', 'sub_ord_old_' || v_n, 50);
    -- Vérité Stripe au moment des livraisons (retardées) : ancienne annulée, nouvelle active.
    perform pg_temp.verite('sub_ord_old_' || v_n, 'canceled');
    perform pg_temp.verite('sub_ord_new_' || v_n, 'active');
    v_file := array[]::int[];
    v_erreurs := 0; v_violations := 0; v_del_applique := false;
    for v_tentative in 1..2 loop
      foreach v_ev in array case when v_tentative = 1 then v_perm else v_file end loop
        begin
          v_ret := case v_ev
            when 1 then pg_temp.evt_sub(v_e, 'evt_ord_del_' || v_n, 'customer.subscription.deleted', 'sub_ord_old_' || v_n, 100)
            when 2 then pg_temp.evt_sub(v_e, 'evt_ord_cre_' || v_n, 'customer.subscription.created', 'sub_ord_new_' || v_n, 200)
            when 3 then pg_temp.fac(v_e, 'evt_ord_fail_' || v_n, 'invoice.payment_failed', 'in_ord_a_' || v_n, 'sub_ord_new_' || v_n, 250)
            when 4 then pg_temp.fac(v_e, 'evt_ord_paid_' || v_n, 'invoice.paid', 'in_ord_b_' || v_n, 'sub_ord_new_' || v_n, 300)
            when 5 then pg_temp.evt_sub(v_e, 'evt_ord_upd_' || v_n, 'customer.subscription.updated', 'sub_ord_new_' || v_n, 310)
          end;
          if v_ret = 'differe' then
            if v_tentative = 2 then v_erreurs := v_erreurs + 1; end if;
            v_file := v_file || v_ev;
          end if;
          if v_ev = 1 and v_ret like 'deja_lie:%' then v_del_applique := true; end if;
        exception when others then
          v_erreurs := v_erreurs + 1;
        end;
        -- Invariants à chaque pas : ancienne annulée et encore courante → aucun droit ;
        -- jamais d'essai après réabonnement.
        if (pg_temp.courante(v_e) = 'sub_ord_old_' || v_n and v_del_applique and pg_temp.st(v_e) <> 'annule')
           or (pg_temp.courante(v_e) = 'sub_ord_new_' || v_n and pg_temp.st(v_e) = 'essai') then
          v_violations := v_violations + 1;
        end if;
      end loop;
    end loop;
    insert into ordre_resultats
    select v_n, array_to_string(v_perm, ''), abonnement_statut, stripe_subscription_id,
           (select count(*)::int from public.stripe_subscriptions_remplacees where entreprise_id = v_e),
           abonnement_essai_fin >= current_date, v_erreurs, v_violations
    from public.entreprises where id = v_e;
  end loop;
end;
$$;

select is((select count(*)::int from ordre_resultats), 120, 'O 120 ordres de livraison rejoués');
select is((select count(*)::int from ordre_resultats where erreurs > 0), 0, 'O aucune erreur (aucun 500) ni facture restée différée');
select is((select count(*)::int from ordre_resultats where statut <> 'actif'), 0, 'O convergence : actif dans les 120 ordres');
select is((select count(*)::int from ordre_resultats where courante not like 'sub_ord_new_%'), 0, 'O la nouvelle subscription est toujours la courante');
select is((select count(*)::int from ordre_resultats where historique <> 1), 0, 'O exactement un remplacement par ordre');
select is((select count(*)::int from ordre_resultats where essai_ouvert), 0, 'O aucun essai rouvert');
select is((select count(*)::int from ordre_resultats where violations > 0), 0, 'O aucun droit hors état Stripe compatible, à aucun pas');
select is((select count(*)::int from public.factures_abonnement where stripe_invoice_id like 'in_ord_b_%' and statut = 'paid'), 120, 'O facture payée enregistrée dans les 120 ordres');

-- Rejeu complet (Stripe re-livre tout) : rien ne change.
do $$
declare v_n int;
begin
  for v_n in 1..120 loop
    perform pg_temp.evt_sub(('a6000000-0000-4000-8000-' || lpad(v_n::text, 12, '0'))::uuid, 'evt_ord_del_' || v_n, 'customer.subscription.deleted', 'sub_ord_old_' || v_n, 100);
    perform pg_temp.evt_sub(('a6000000-0000-4000-8000-' || lpad(v_n::text, 12, '0'))::uuid, 'evt_ord_cre_' || v_n, 'customer.subscription.created', 'sub_ord_new_' || v_n, 200);
    perform pg_temp.fac(('a6000000-0000-4000-8000-' || lpad(v_n::text, 12, '0'))::uuid, 'evt_ord_fail_' || v_n, 'invoice.payment_failed', 'in_ord_a_' || v_n, 'sub_ord_new_' || v_n, 250);
    perform pg_temp.fac(('a6000000-0000-4000-8000-' || lpad(v_n::text, 12, '0'))::uuid, 'evt_ord_paid_' || v_n, 'invoice.paid', 'in_ord_b_' || v_n, 'sub_ord_new_' || v_n, 300);
  end loop;
end;
$$;
select is((select count(*)::int from public.entreprises where id::text like 'a6000000-%' and abonnement_statut <> 'actif'), 0, 'R rejeu complet : état inchangé (actif)');
select is((select count(*)::int from public.stripe_subscriptions_remplacees where entreprise_id::text like 'a6000000-%'), 120, 'R rejeu complet : aucun remplacement supplémentaire');

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. État de reprise lisible par les membres d'une entreprise annulée
--     (la RLS est_membre_actif masque alors l'entreprise et ses permissions)
-- ═══════════════════════════════════════════════════════════════════════════
update public.entreprises set abonnement_statut = 'annule', stripe_subscription_id = 'sub_iso_a_annulee',
  derniere_facture_statut = 'open', derniere_facture_url = 'https://invoice.stripe.com/i/iso_a'
where id = 'a0000000-0000-0000-0000-000000000001';
select ok(not has_function_privilege('anon', 'public.etat_reabonnement_entreprise(uuid)', 'EXECUTE'), 'L anon : aucune lecture');
select ok(has_function_privilege('authenticated', 'public.etat_reabonnement_entreprise(uuid)', 'EXECUTE'), 'L authenticated : lecture bornée');
select is((select array_agg(parameter_name::text order by ordinal_position) from information_schema.parameters
           where specific_name like 'etat_reabonnement_entreprise%' and parameter_mode = 'OUT')::text,
  '{abonnement_statut,subscription_rattachee,annulation_prevue_at,derniere_facture_statut,derniere_facture_url,peut_gerer}',
  'L aucune colonne d''identifiant Stripe exposée');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.entreprises where id = 'a0000000-0000-0000-0000-000000000001'), 0,
  'L constat : la RLS masque l''entreprise annulée à son administrateur');
select is((select abonnement_statut || '/' || subscription_rattachee || '/' || peut_gerer from public.etat_reabonnement_entreprise('a0000000-0000-0000-0000-000000000001')),
  'annule/true/true', 'L administrateur (gerer_parametres) : état de reprise lisible, peut gérer');
select is((select derniere_facture_url from public.etat_reabonnement_entreprise('a0000000-0000-0000-0000-000000000001')),
  'https://invoice.stripe.com/i/iso_a', 'L lien de facture Stripe (paiement requis)');
select is((select count(*)::int from public.etat_reabonnement_entreprise('b0000000-0000-0000-0000-000000000001')), 0,
  'L autre entreprise : aucune ligne (cloisonnement)');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select peut_gerer from public.etat_reabonnement_entreprise('a0000000-0000-0000-0000-000000000001')), false,
  'L ouvrier (sans gerer_parametres) : lecture, mais ne peut pas gérer');
reset role;

update public.utilisateurs_entreprises set statut = 'desactive'
where utilisateur_id = '10000000-0000-0000-0000-000000000002' and entreprise_id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.etat_reabonnement_entreprise('a0000000-0000-0000-0000-000000000001')), 0,
  'L membre désactivé : aucune ligne');
reset role;

set local role anon;
select throws_ok($$ select * from public.etat_reabonnement_entreprise('a0000000-0000-0000-0000-000000000001') $$, '42501', null, 'L anon refusé');
reset role;

select * from finish();
rollback;
