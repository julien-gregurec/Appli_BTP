begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ELSATIA — Stripe Trial Synchronization Hardening V1, compléments (§6, §8, §10).
-- 1. Preuve exhaustive : la VRAIE RPC ordonnée, alimentée par toutes les
--    combinaisons (début d'essai × fin locale × trial_end Stripe, y compris
--    null / avant début / très au-delà), ne lève jamais d'erreur et laisse
--    toujours une fenêtre acceptée par entreprises_essai_dates_coherentes,
--    jamais prolongée.
-- 2. invoice.payment_action_required pendant l'essai : ni suspension, ni essai modifié.
-- 3. Subscription annulée puis nouvelle subscription (re-Checkout) : jamais
--    rattachée, jamais de nouvel essai.
-- Dates fixes : la suite ne dépend ni de current_date ni du fuseau.

\ir fixtures/isolation_multitenant.inc

insert into public.plans_abonnement(id, code, version, nom, prix_mensuel_ht, prix_annuel_ht, devise,
  utilisateurs_inclus, administrateurs_inclus, operations_ia_incluses, stockage_go_inclus, actif)
values ('c1a11111-0000-0000-0000-0000000000b2','pro',9,'Pro (test essai exhaustif)',249,2490,'EUR',15,3,0,100,true)
on conflict do nothing;

create function pg_temp.t(n integer) returns timestamptz language sql immutable
as $$ select timestamptz '2026-01-01 00:00:00+00' + make_interval(secs => n) $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Preuve exhaustive via la RPC réelle
-- ═══════════════════════════════════════════════════════════════════════════
create temp table resultats_exhaustifs (
  entreprise_id uuid, debut date, fin_initiale date, trial_end date,
  fin_avant date, fin_apres date, erreur text
);

do $$
declare
  v_debuts date[] := array[
    '2026-01-01','2026-01-31','2026-02-28','2026-03-01','2026-03-29','2026-03-30',
    '2026-06-30','2026-10-01','2026-10-25','2026-12-31','2028-02-29','2028-01-31'
  ]::date[];
  v_debut date;
  v_fin_initiale date;
  v_offsets integer[] := array[-40,-3,-1,0,1,2,7,14,15,20,28,29,30,31,32,45,60,365];
  v_trial date;
  v_entreprise uuid;
  v_avant date;
  v_apres date;
  v_n integer := 0;
  v_ev integer := 0;
  v_ordre integer[];
  v_i integer;
  v_candidats date[];
begin
  foreach v_debut in array v_debuts loop
    foreach v_fin_initiale in array array[v_debut, v_debut + 1, v_debut + 15, v_debut + 29, v_debut + 30] loop
      v_n := v_n + 1;
      v_entreprise := ('ee000000-0000-4000-8000-' || lpad(v_n::text, 12, '0'))::uuid;
      insert into public.entreprises (id, nom, code_adhesion, abonnement_statut, abonnement_essai_debut, abonnement_essai_fin)
      values (v_entreprise, 'Exhaustif ' || v_n, 'EXH' || lpad(v_n::text, 5, '0'), 'essai', v_debut, v_fin_initiale);
      -- Candidats Stripe : null (sans essai) + décalages, appliqués dans un
      -- ordre mélangé déterministe (les événements sont de plus en plus récents).
      v_candidats := array[null::date];
      foreach v_i in array v_offsets loop v_candidats := v_candidats || (v_debut + v_i); end loop;
      select array_agg(i order by md5(v_n::text || ':' || i)) into v_ordre
        from generate_series(1, array_length(v_candidats, 1)) i;
      foreach v_i in array v_ordre loop
        v_trial := v_candidats[v_i];
        v_ev := v_ev + 1;
        select abonnement_essai_fin into v_avant from public.entreprises where id = v_entreprise;
        begin
          perform public.synchroniser_abonnement_stripe_ordonne_service(
            v_entreprise, 'sub_exh_' || v_n, 'cus_exh_' || v_n,
            case when v_trial is null or v_trial < v_debut then 'actif' else 'essai' end,
            'pro', 'mensuel', v_debut + 60, v_trial, null,
            pg_temp.t(0), pg_temp.t(0) + interval '30 days',
            'evt_exh_' || v_ev, 'customer.subscription.updated', pg_temp.t(v_ev), 'subscription', 'sub_exh_' || v_n);
          select abonnement_essai_fin into v_apres from public.entreprises where id = v_entreprise;
          insert into resultats_exhaustifs values (v_entreprise, v_debut, v_fin_initiale, v_trial, v_avant, v_apres, null);
        exception when others then
          insert into resultats_exhaustifs values (v_entreprise, v_debut, v_fin_initiale, v_trial, v_avant, null, sqlstate || ' ' || sqlerrm);
        end;
      end loop;
    end loop;
  end loop;
end $$;

select is((select count(*)::int from resultats_exhaustifs), 12 * 5 * 19, 'exhaustif : 1140 synchronisations exécutées');
select is((select count(*)::int from resultats_exhaustifs where erreur is not null), 0,
  'exhaustif : aucune erreur (plus jamais de 500 customer.subscription.* sur l''essai)');
select is((select count(*)::int from resultats_exhaustifs
  where fin_apres is null or fin_apres < debut or fin_apres > debut + 30), 0,
  'exhaustif : la fin d''essai reste dans [début, début + 30], jamais nulle');
select is((select count(*)::int from resultats_exhaustifs where fin_apres > fin_avant), 0,
  'exhaustif : la fin d''essai n''est jamais prolongée (aucun second essai)');
select is((select count(*)::int from resultats_exhaustifs where fin_apres > fin_initiale), 0,
  'exhaustif : jamais au-delà de la fin locale ELSATIA initiale');
select is((select count(*)::int from resultats_exhaustifs
  where trial_end is not null and trial_end >= debut and trial_end <= fin_avant and fin_apres <> trial_end), 0,
  'exhaustif : un trial_end dans la fenêtre restante (raccourcissement) est appliqué tel quel');
select is((select count(*)::int from resultats_exhaustifs where trial_end is null and fin_apres <> fin_avant), 0,
  'exhaustif : sans essai Stripe (trial_end null), l''essai local est conservé');
select is((select count(*)::int from public.entreprises e
  where e.id in (select entreprise_id from resultats_exhaustifs)
    and not (e.abonnement_essai_fin between e.abonnement_essai_debut and e.abonnement_essai_debut + 30)), 0,
  'exhaustif : état final conforme à la contrainte pour les 60 entreprises');
select ok((select count(*) from public.stripe_essai_ecarts
  where entreprise_id in (select entreprise_id from resultats_exhaustifs)) > 0,
  'exhaustif : les trial_end hors fenêtre sont journalisés dans stripe_essai_ecarts');

-- Flux Checkout → webhook : la valeur que Checkout envoie désormais
-- (fin locale T23:59:59Z) revient en base exactement sur la fin locale, pour
-- toute fin locale de l'année 2026 et 2028 (bissextile), sous tout fuseau.
set local timezone = 'Pacific/Kiritimati';
select is((select count(*)::int from generate_series(date '2026-01-01', date '2028-12-31', interval '1 day') d
  where (to_timestamp(extract(epoch from (d::date::timestamp at time zone 'UTC')) + 86399) at time zone 'UTC')::date <> d::date), 0,
  'Checkout : date UTC de (fin locale T23:59:59Z) = fin locale, 1096 jours, fuseau +14');
reset timezone;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. invoice.payment_action_required pendant l'essai
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.entreprises (id, nom, code_adhesion, abonnement_statut, abonnement_essai_debut, abonnement_essai_fin) values
  ('ef000000-0000-4000-8000-000000000001', 'Essai 3DS', 'EXH3DS01', 'essai', '2026-10-01', '2026-10-31'),
  ('ef000000-0000-4000-8000-000000000002', 'Annulée puis re-Checkout', 'EXHANN01', 'essai', '2026-10-01', '2026-10-31');

select is(public.synchroniser_abonnement_stripe_ordonne_service(
  'ef000000-0000-4000-8000-000000000001', 'sub_3ds', 'cus_3ds', 'essai', 'pro', 'mensuel', date '2026-11-30', date '2026-10-31', null,
  pg_temp.t(0), pg_temp.t(0) + interval '30 days', 'evt_3ds_sub', 'customer.subscription.created', pg_temp.t(10), 'subscription', 'sub_3ds')->>'decision',
  'applique', '3DS : subscription créée (Checkout jour 0, trial_end = fin locale)');
select is(public.appliquer_evenement_facture_abonnement_service('ef000000-0000-4000-8000-000000000001', 'evt_3ds_action', 'invoice.payment_action_required',
  pg_temp.t(20), 'in_3ds', 'open', pg_temp.t(19), 'F-3DS', pg_temp.t(0), pg_temp.t(0) + interval '30 days', 249, 49.8, 298.8, 'eur', null, null)->>'decision',
  'sans_effet', 'invoice.payment_action_required : sans effet sur l''accès');
select is((select abonnement_statut from public.entreprises where id = 'ef000000-0000-4000-8000-000000000001'), 'essai',
  'invoice.payment_action_required : aucune suspension');
select is((select abonnement_essai_fin from public.entreprises where id = 'ef000000-0000-4000-8000-000000000001'), date '2026-10-31',
  'invoice.payment_action_required : essai inchangé');
select is(public.appliquer_evenement_facture_abonnement_service('ef000000-0000-4000-8000-000000000001', 'evt_3ds_action', 'invoice.payment_action_required',
  pg_temp.t(20), 'in_3ds', 'open', pg_temp.t(19), 'F-3DS', pg_temp.t(0), pg_temp.t(0) + interval '30 days', 249, 49.8, 298.8, 'eur', null, null)->>'decision',
  'deja_traite', 'invoice.payment_action_required rejoué : déjà traité');
select is(public.appliquer_evenement_facture_abonnement_service('ef000000-0000-4000-8000-000000000001', 'evt_3ds_paid', 'invoice.paid',
  pg_temp.t(30), 'in_3ds', 'paid', pg_temp.t(19), 'F-3DS', pg_temp.t(0), pg_temp.t(0) + interval '30 days', 249, 49.8, 298.8, 'eur', null, null)->>'decision',
  'applique', '3DS confirmé → invoice.paid appliqué');
select is((select abonnement_essai_fin from public.entreprises where id = 'ef000000-0000-4000-8000-000000000001'), date '2026-10-31',
  'invoice.paid : essai inchangé');

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Subscription annulée puis nouvelle subscription
-- ═══════════════════════════════════════════════════════════════════════════
select is(public.synchroniser_abonnement_stripe_ordonne_service(
  'ef000000-0000-4000-8000-000000000002', 'sub_ann_1', 'cus_ann', 'essai', 'pro', 'mensuel', date '2026-11-30', date '2026-10-31', null,
  pg_temp.t(0), pg_temp.t(0) + interval '30 days', 'evt_ann_1', 'customer.subscription.created', pg_temp.t(10), 'subscription', 'sub_ann_1')->>'decision',
  'applique', 'annulée : première subscription liée');
select is(public.synchroniser_abonnement_stripe_ordonne_service(
  'ef000000-0000-4000-8000-000000000002', 'sub_ann_1', 'cus_ann', 'annule', 'pro', 'mensuel', date '2026-11-30', date '2026-10-12', null,
  pg_temp.t(0), pg_temp.t(0) + interval '30 days', 'evt_ann_2', 'customer.subscription.deleted', pg_temp.t(20), 'subscription', 'sub_ann_1')->>'decision',
  'applique', 'annulée : customer.subscription.deleted appliqué (Stripe clôt l''essai au 12/10)');
select is((select abonnement_essai_fin from public.entreprises where id = 'ef000000-0000-4000-8000-000000000002'), date '2026-10-12',
  'annulée : l''essai est raccourci à la date Stripe, jamais rallongé');
select throws_ok($$select public.synchroniser_abonnement_stripe_ordonne_service(
  'ef000000-0000-4000-8000-000000000002', 'sub_ann_2', 'cus_ann', 'essai', 'pro', 'mensuel', date '2026-12-30', date '2026-11-11', null,
  pg_temp.t(0), pg_temp.t(0) + interval '30 days', 'evt_ann_3', 'customer.subscription.created', pg_temp.t(30), 'subscription', 'sub_ann_2')$$,
  '42501', 'Subscription Stripe non liée à cette entreprise',
  'annulée : une nouvelle subscription (re-Checkout legacy 30 j) n''est jamais rattachée');
select is((select abonnement_essai_fin from public.entreprises where id = 'ef000000-0000-4000-8000-000000000002'), date '2026-10-12',
  'annulée : aucun nouvel essai de 30 jours');
set local role service_role;
select throws_ok($$update public.entreprises set abonnement_essai_fin = '2026-10-31' where id = 'ef000000-0000-4000-8000-000000000002'$$,
  '23514', 'La fenêtre d''essai ELSATIA ne peut pas être prolongée', 'annulée : service_role ne peut pas rouvrir l''essai');
select throws_ok($$update public.entreprises set abonnement_essai_debut = '2026-10-20', abonnement_essai_fin = '2026-11-19' where id = 'ef000000-0000-4000-8000-000000000002'$$,
  '23514', 'La fenêtre d''essai ELSATIA ne peut pas être prolongée', 'annulée : service_role ne peut pas redémarrer un essai');
reset role;

select * from finish();
rollback;
