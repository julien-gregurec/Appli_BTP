begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

-- ELSATIA — Stripe readiness, train canonique V9 (docs/qualification/
-- ELSATIA_CANONICAL_TRAIN_V9_CONVERGENCE_V1.md §5).
--   §P1  prix contractuel au changement de périodicité (migration 20261002001002)
--   §P7  facture d'essai à 0 € livrée après la relecture « trialing » : contre-épreuve
--   §P5  relecture de rapprochement (cron) : passe par la RPC ordonnée, jamais de
--        réactivation d'un abonnement terminal, rejeu idempotent
-- Helpers repris de billing_subscription_lifecycle_v1 (Stripe représenté par sa
-- « vérité » relue).

create temp table verite_stripe (sub text primary key, status text not null);
grant all on verite_stripe to public;

create function pg_temp.t(n integer) returns timestamptz language sql immutable
as $$ select timestamptz '2026-11-01 00:00:00+00' + make_interval(secs => n) $$;

create function pg_temp.statut(stripe text) returns text language sql immutable as $$
  select case when stripe = 'trialing' then 'essai' when stripe = 'active' then 'actif'
              when stripe in ('past_due','unpaid','incomplete','paused') then 'suspendu' else 'annule' end
$$;

create function pg_temp.verite(p_sub text, p_status text) returns void language sql as $$
  insert into verite_stripe values (p_sub, p_status) on conflict (sub) do update set status = excluded.status
$$;

-- customer.subscription.* / checkout.session.completed (synchroniserAbonnementCoordonne).
create function pg_temp.evt_sub(e uuid, evt text, typ text, sub text, n integer,
  offre text default 'mini', periodicite text default 'mensuel',
  annulation timestamptz default null, cus text default null, essai date default null)
returns text language plpgsql as $$
declare
  v_courante text; v_cus text; v_issue text; v_status text; v_anc_status text; v_res jsonb;
begin
  select stripe_subscription_id, stripe_customer_id into v_courante, v_cus from public.entreprises where id = e;
  select status into v_status from verite_stripe where verite_stripe.sub = evt_sub.sub;
  if v_courante is not null and v_courante <> sub then
    select status into v_anc_status from verite_stripe where verite_stripe.sub = v_courante;
  end if;
  v_issue := public.relier_subscription_reabonnement_service(e, sub, coalesce(cus, v_cus), v_status,
    case when v_courante <> sub then v_courante end, v_anc_status);
  if v_issue in ('remplacee', 'terminale_ignoree') then
    perform public.journaliser_evenement_stripe_ordre_service('abonnement', evt, typ, pg_temp.t(n), 'subscription', sub, e,
      case when v_issue = 'remplacee' then 'subscription_remplacee' else 'subscription_terminale_non_rattachee' end);
    return v_issue;
  end if;
  v_res := public.synchroniser_abonnement_stripe_ordonne_service(
    e, sub, coalesce(cus, v_cus), pg_temp.statut(v_status), offre, periodicite,
    current_date + 30, essai, annulation, pg_temp.t(0), pg_temp.t(0) + interval '30 days',
    evt, typ, pg_temp.t(n), 'subscription', sub);
  return v_issue || ':' || (v_res->>'decision');
end;
$$;

-- invoice.paid / invoice.payment_failed / invoice.payment_action_required.
create function pg_temp.fac(e uuid, evt text, typ text, invoice text, sub text, n integer) returns jsonb language sql as $$
  select public.appliquer_evenement_facture_abonnement_v2_service(
    e, evt, typ, pg_temp.t(n), invoice, case when typ = 'invoice.paid' then 'paid' else 'open' end, pg_temp.t(n),
    'ELS-' || invoice, pg_temp.t(0), pg_temp.t(0) + interval '30 days', 79, 0, 79, 'eur',
    'https://invoice.stripe.com/i/' || invoice, null, sub)
$$;

create function pg_temp.st(e uuid) returns text language sql as $$
  select abonnement_statut from public.entreprises where id = e
$$;
create function pg_temp.journal(evt text) returns text language sql as $$
  select decision || coalesce('/' || motif, '') from public.stripe_evenements_ordre
  where flux = 'abonnement' and stripe_event_id = evt
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §P1. Prix contractuel : offre ET périodicité
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.entreprises (id, nom, code_adhesion, stripe_customer_id)
values ('d9000000-0000-4000-8000-000000000001', 'P1 périodicité', 'V9P10001', 'cus_P1');
select pg_temp.verite('sub_P1', 'active');
select is(pg_temp.evt_sub('d9000000-0000-4000-8000-000000000001', 'evt_P1_co', 'checkout.session.completed', 'sub_P1', 10, 'pro', 'mensuel'),
  'lie:applique', 'P1-1 Pro mensuel souscrit');
select is((select code_offre || ':' || periodicite || ':' || prix_contractuel_ht from public.abonnements_entreprises where entreprise_id = 'd9000000-0000-4000-8000-000000000001'),
  'pro:mensuel:249.00', 'P1-1 contrat Pro mensuel 249 €');
-- Même offre, même périodicité relue plus tard sous une nouvelle grille : prix historique conservé.
update public.plans_abonnement set actif = false where code = 'pro' and actif;
insert into public.plans_abonnement(code, version, nom, prix_mensuel_ht, prix_annuel_ht, devise, utilisateurs_inclus, administrateurs_inclus, operations_ia_incluses, stockage_go_inclus, actif, valide_du)
values ('pro', 98, 'Pro futur', 269, 2690, 'EUR', 10, 2, 500, 50, true, current_date);
select pg_temp.evt_sub('d9000000-0000-4000-8000-000000000001', 'evt_P1_r', 'customer.subscription.updated', 'sub_P1', 20, 'pro', 'mensuel');
select is((select prix_contractuel_ht from public.abonnements_entreprises where entreprise_id = 'd9000000-0000-4000-8000-000000000001'),
  249.00, 'P1-2 offre et périodicité inchangées : prix historique conservé (pas de repricing)');
-- Pro mensuel → Pro annuel (Portail) : le prix annuel facturé fait le contrat.
select is(pg_temp.evt_sub('d9000000-0000-4000-8000-000000000001', 'evt_P1_an', 'customer.subscription.updated', 'sub_P1', 30, 'pro', 'annuel'),
  'deja_lie:applique', 'P1-3 passage à l''annuel appliqué');
select is((select code_offre || ':' || periodicite || ':' || prix_contractuel_ht || ':' || version_tarif from public.abonnements_entreprises where entreprise_id = 'd9000000-0000-4000-8000-000000000001'),
  'pro:annuel:2690.00:98', 'P1-3 Pro annuel : prix annuel de la version active (plus jamais 249 € en annuel)');
-- Annuel relu de nouveau : figé.
select pg_temp.evt_sub('d9000000-0000-4000-8000-000000000001', 'evt_P1_an2', 'customer.subscription.updated', 'sub_P1', 40, 'pro', 'annuel');
select is((select prix_contractuel_ht from public.abonnements_entreprises where entreprise_id = 'd9000000-0000-4000-8000-000000000001'),
  2690.00, 'P1-4 annuel relu : prix figé');
-- Annuel → mensuel.
select pg_temp.evt_sub('d9000000-0000-4000-8000-000000000001', 'evt_P1_me', 'customer.subscription.updated', 'sub_P1', 50, 'pro', 'mensuel');
select is((select periodicite || ':' || prix_contractuel_ht from public.abonnements_entreprises where entreprise_id = 'd9000000-0000-4000-8000-000000000001'),
  'mensuel:269.00', 'P1-5 retour au mensuel : prix mensuel de la version active');
select is((select abonnement_offre || ':' || abonnement_periodicite from public.entreprises where id = 'd9000000-0000-4000-8000-000000000001'),
  'pro:mensuel', 'P1-5 droits = offre et périodicité facturées');
select ok(
  (select prosrc from pg_proc where oid = 'public.synchroniser_abonnement_stripe_service(uuid,text,text,text,text,text,date,date,timestamptz,timestamptz,timestamptz)'::regprocedure)
    like '%v_contrat_periodicite is not distinct from p_periodicite%'
  and not has_function_privilege('authenticated', 'public.synchroniser_abonnement_stripe_service(uuid,text,text,text,text,text,date,date,timestamptz,timestamptz,timestamptz)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.synchroniser_abonnement_stripe_service(uuid,text,text,text,text,text,date,date,timestamptz,timestamptz,timestamptz)', 'EXECUTE'),
  'P1-6 définition 1002 en place, grants inchangés (service_role seul)');

-- ═══════════════════════════════════════════════════════════════════════════
-- §P7. Facture d'essai à 0 € pendant l'essai (contre-épreuve, décision propriétaire 8)
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.entreprises (id, nom, code_adhesion, stripe_customer_id)
values ('d9000000-0000-4000-8000-000000000007', 'P7 essai 0 €', 'V9P70001', 'cus_P7');
select pg_temp.verite('sub_P7', 'trialing');
select is(pg_temp.evt_sub('d9000000-0000-4000-8000-000000000007', 'evt_P7_co', 'checkout.session.completed', 'sub_P7', 1000, 'mini', 'mensuel', null, null, current_date + 30),
  'lie:applique', 'P7-1 relecture trialing à t');
select is(pg_temp.st('d9000000-0000-4000-8000-000000000007'), 'essai', 'P7-1 essai');
-- invoice.paid 0 € de l'essai, horodatée t + 1 s (cas désordonné non couvert par l'arbitrage à la seconde).
select public.appliquer_evenement_facture_abonnement_v2_service(
  'd9000000-0000-4000-8000-000000000007', 'evt_P7_paid0', 'invoice.paid', pg_temp.t(1001), 'in_P7_0', 'paid', pg_temp.t(1000),
  'ELS-P7-0', pg_temp.t(1000), pg_temp.t(1000) + interval '30 days', 0, 0, 0, 'eur', null, null, 'sub_P7');
create temp table p7 as select pg_temp.st('d9000000-0000-4000-8000-000000000007') as apres_paid0;
-- Relecture suivante (customer.subscription.updated à t + 60 s, Stripe toujours trialing).
select pg_temp.evt_sub('d9000000-0000-4000-8000-000000000007', 'evt_P7_up', 'customer.subscription.updated', 'sub_P7', 1060, 'mini', 'mensuel', null, null, current_date + 30);
select is(pg_temp.st('d9000000-0000-4000-8000-000000000007'), 'essai',
  'P7-2 après la relecture trialing suivante (t + 60 s) : de nouveau essai');
-- Contre-épreuve (sans 20261002001003) : apres_paid0 = 'actif' (défaut reproduit).
select is((select apres_paid0 from p7), 'essai',
  'P7-3 invoice.paid 0 € à t + 1 s pendant l''essai : l''entreprise reste en essai (1003)');
select is((select decision || '/' || motif from public.stripe_evenements_ordre where flux = 'abonnement' and stripe_event_id = 'evt_P7_paid0'),
  'sans_effet/facture_essai_sans_montant', 'P7-5 décision journalisée et motivée');
select is((select statut from public.factures_abonnement where stripe_invoice_id = 'in_P7_0'), 'paid', 'P7-6 la facture 0 € reste visible dans l''historique');
-- Fin d'essai réelle : première facture non nulle payée → actif (contrat 506 inchangé).
select is(public.appliquer_evenement_facture_abonnement_v2_service(
  'd9000000-0000-4000-8000-000000000007', 'evt_P7_paid1', 'invoice.paid', pg_temp.t(5000), 'in_P7_1', 'paid', pg_temp.t(5000),
  'ELS-P7-1', pg_temp.t(5000), pg_temp.t(5000) + interval '30 days', 79, 0, 79, 'eur', null, null, 'sub_P7')->>'statut_resultant',
  'actif', 'P7-7 première facture non nulle payée : actif');
-- Accès : identique (essai et actif ouvrent les mêmes droits) ; essai local conservé.
select is((select abonnement_essai_fin from public.entreprises where id = 'd9000000-0000-4000-8000-000000000007'), current_date + 30,
  'P7-4 la fenêtre d''essai locale n''est jamais modifiée par la facture 0 €');

-- ═══════════════════════════════════════════════════════════════════════════
-- §P5. Relecture de rapprochement (cron) sur la RPC ordonnée
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.entreprises (id, nom, code_adhesion, stripe_customer_id)
values ('d9000000-0000-4000-8000-000000000005', 'P5 rapprochement', 'V9P50001', 'cus_P5');
select pg_temp.verite('sub_P5', 'active');
select pg_temp.evt_sub('d9000000-0000-4000-8000-000000000005', 'evt_P5_co', 'checkout.session.completed', 'sub_P5', 2000, 'mini', 'mensuel');
-- Webhook manquant : Stripe est passé en past_due, aucun événement reçu. La relecture
-- de rapprochement (identifiant synthétique rapprochement:<sub>:<jour>) l'applique.
select pg_temp.verite('sub_P5', 'past_due');
select is(pg_temp.evt_sub('d9000000-0000-4000-8000-000000000005', 'rapprochement:sub_P5:2026-11-01', 'rapprochement.subscription', 'sub_P5', 2100),
  'deja_lie:applique', 'P5-1 relecture de rapprochement appliquée par la RPC ordonnée');
select is(pg_temp.st('d9000000-0000-4000-8000-000000000005'), 'suspendu', 'P5-1 statut rattrapé (suspendu)');
select is(pg_temp.evt_sub('d9000000-0000-4000-8000-000000000005', 'rapprochement:sub_P5:2026-11-01', 'rapprochement.subscription', 'sub_P5', 2100),
  'deja_lie:deja_traite', 'P5-2 rejeu du même rapprochement : idempotent');
-- Abonnement terminal : la relecture de rapprochement d'une subscription canceled
-- laisse l'entreprise annulée ; une vieille facture payée ensuite ne la rouvre pas (801).
select pg_temp.verite('sub_P5', 'canceled');
select is(pg_temp.evt_sub('d9000000-0000-4000-8000-000000000005', 'rapprochement:sub_P5:2026-11-02', 'rapprochement.subscription', 'sub_P5', 2300),
  'deja_lie:applique', 'P5-3 rapprochement d''une subscription terminée chez Stripe');
select is(pg_temp.st('d9000000-0000-4000-8000-000000000005'), 'annule', 'P5-3 annulée');
select is(pg_temp.fac('d9000000-0000-4000-8000-000000000005', 'evt_P5_old', 'invoice.paid', 'in_P5_old', 'sub_P5', 2400)->>'statut_resultant',
  'annule', 'P5-4 jamais de réactivation d''un abonnement terminal');

select * from finish();
rollback;
