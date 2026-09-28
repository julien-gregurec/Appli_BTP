begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ELSATIA — Billing & Subscription Lifecycle Qualification V1
-- (docs/qualification/ELSATIA_BILLING_SUBSCRIPTION_LIFECYCLE_V1.md)
--
-- Cycle commercial de bout en bout, sur les fonctions réelles de la base :
--   §M   matrice état Stripe → statut local → droits effectifs (GP, Tools,
--        Colors, Réserves) → accès facturation (admin / membre)
--   §L   cycle de vie : essai, Checkout, trialing → active, changement
--        d'offre, payment_failed, past_due / unpaid, Portail, résiliation fin
--        de période, annulation immédiate, réabonnement
--   §W   webhooks : doublon, rejeu, périmé, même seconde, désordre, événement
--        manquant, mauvais client, mauvaise subscription
--   §B1  (correctif 701) une facture ne lève jamais « annule »
--   §B2  (correctif 702) catalogue actif = grille canonique 79/249/449/599 ×10
--   §B4  (correctif 703) essai expiré = plus « membre actif » (toutes applis)
--   §S   portée des suspensions : incident Tools ≠ coupure GP
--   §A   audit : chaque transition d'accès est journalisée et motivée
--
-- Stripe est représenté par sa « vérité » relue (table verite_stripe), comme
-- dans stripe_resubscription_flow_v1 : le chemin applicatif relit toujours la
-- subscription avant de l'appliquer.

\ir fixtures/isolation_multitenant.inc

create function pg_temp.en_tant_que(p uuid) returns void language sql as $$
  select set_config('role','authenticated',true);
  select set_config('request.jwt.claim.sub',p::text,true);
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.en_service() returns void language sql as $$
  select set_config('role','postgres',true);
  select set_config('request.jwt.claim.sub','',true);
  select set_config('request.jwt.claims','',true);
$$;

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
-- §M. Matrice des droits effectifs
-- ═══════════════════════════════════════════════════════════════════════════
-- 10 entreprises, une par état (fin d'essai toujours présente : contrainte entreprises_essai_dates_coherentes) ; admin (poste gerer_parametres) + membre simple.
create temp table matrice (
  k int primary key, libelle text, statut text, essai_debut date, essai_fin date,
  suspension_prevue timestamptz, annulation_prevue timestamptz,
  metier boolean, facturation_admin boolean
);
insert into matrice values
  (1,  'essai en cours (J+25)',                   'essai',    current_date - 5,  current_date + 25, null, null, true,  true),
  (2,  'essai : dernier jour (fin = aujourd''hui)', 'essai',   current_date - 30, current_date,      null, null, true,  true),
  (3,  'essai expiré (fin = hier)',                'essai',    current_date - 31, current_date - 1,  null, null, false, true),
  (4,  'essai expiré depuis 10 j',                 'essai',    current_date - 40, current_date - 10, null, null, false, true),
  (5,  'active',                                   'actif',    current_date - 60, current_date - 30, null, null, true,  true),
  (6,  'active + cancel_at_period_end',            'actif',    current_date - 60, current_date - 30, null, now() + interval '20 days', true, true),
  (7,  'past_due / unpaid / payment_failed',       'suspendu', current_date - 60, current_date - 30, null, null, false, true),
  (8,  'canceled (subscription terminée)',         'annule',   current_date - 60, current_date - 30, null, null, false, true),
  (9,  'suspension plateforme échue',              'actif',    current_date - 60, current_date - 30, now() - interval '1 minute', null, false, true),
  (10, 'suspension plateforme programmée (future)', 'actif',   current_date - 60, current_date - 30, now() + interval '3 days', null, true, true);

create function pg_temp.ent(k int) returns uuid language sql immutable as $$ select ('c0000000-0000-4000-8000-' || lpad(k::text, 12, '0'))::uuid $$;
create function pg_temp.adm(k int) returns uuid language sql immutable as $$ select ('c1000000-0000-4000-8000-' || lpad(k::text, 12, '0'))::uuid $$;
create function pg_temp.mbr(k int) returns uuid language sql immutable as $$ select ('c2000000-0000-4000-8000-' || lpad(k::text, 12, '0'))::uuid $$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', u::text || '@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now()
from matrice, lateral (values (pg_temp.adm(k)), (pg_temp.mbr(k))) v(u);
insert into public.utilisateurs (id, prenom, nom)
select u, 'Billing', u::text from matrice, lateral (values (pg_temp.adm(k)), (pg_temp.mbr(k))) v(u)
on conflict (id) do update set prenom = excluded.prenom, nom = excluded.nom;
insert into public.entreprises (id, nom, code_adhesion, abonnement_statut, abonnement_essai_debut, abonnement_essai_fin, suspension_prevue_at, abonnement_annulation_prevue_at)
select pg_temp.ent(k), 'Billing ' || k, 'BIL' || lpad(k::text, 5, '0'), 'essai', essai_debut, essai_fin, null, annulation_prevue
from matrice;
-- Statut et suspension posés après coup.
update public.entreprises e set abonnement_statut = m.statut, suspension_prevue_at = m.suspension_prevue
from matrice m where e.id = pg_temp.ent(m.k);

insert into public.postes (id, entreprise_id, nom)
select ('c3000000-0000-4000-8000-' || lpad(k::text, 12, '0'))::uuid, pg_temp.ent(k), 'Direction' from matrice
union all
select ('c4000000-0000-4000-8000-' || lpad(k::text, 12, '0'))::uuid, pg_temp.ent(k), 'Ouvrier' from matrice;
insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
select pg_temp.ent(k), ('c3000000-0000-4000-8000-' || lpad(k::text, 12, '0'))::uuid, p, true
from matrice, unnest(array['gerer_parametres','acces_parametres','acces_chantiers']) p;
insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
select pg_temp.ent(k), ('c4000000-0000-4000-8000-' || lpad(k::text, 12, '0'))::uuid, 'acces_chantiers', true from matrice;
insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut)
select pg_temp.adm(k), pg_temp.ent(k), ('c3000000-0000-4000-8000-' || lpad(k::text, 12, '0'))::uuid, 'actif' from matrice
union all
select pg_temp.mbr(k), pg_temp.ent(k), ('c4000000-0000-4000-8000-' || lpad(k::text, 12, '0'))::uuid, 'actif' from matrice;
update public.utilisateurs u set entreprise_active_id = pg_temp.ent(m.k)
from matrice m where u.id in (pg_temp.adm(m.k), pg_temp.mbr(m.k));

insert into public.acces_applications_entreprises (entreprise_id, application_code, autorise, source)
select pg_temp.ent(k), a, true, 'test' from matrice, unnest(array['tools','colors','reserves']) a;
insert into public.habilitations_applications_utilisateurs (entreprise_id, utilisateur_id, application_code, role_code)
select pg_temp.ent(k), pg_temp.adm(k), a, r from matrice,
  (values ('tools','tools_pro'), ('colors','colors_admin_organisation'), ('reserves','reserves_admin_organisation')) v(a, r);
-- Tools Pro personnel (web) de chaque admin : le palier réel dépend de l'accès entreprise.
insert into public.entitlements_utilisateurs_elsatia (utilisateur_id, application_code, niveau, capabilities, source)
select pg_temp.adm(k), 'tools', 'pro', public.tools_capabilities_pro(), 'web' from matrice;

create temp table resultats_matrice (k int, libelle text, metier_admin boolean, metier_membre boolean,
  tools boolean, colors boolean, reserves boolean, tools_tier text, entreprise_visible boolean,
  facturation_admin boolean, facturation_membre_vue boolean, facturation_membre_gere boolean, chantiers_rls boolean);
grant all on resultats_matrice to public;

create function pg_temp.mesurer(p_k int) returns void language plpgsql as $$
declare
  v_e uuid := pg_temp.ent(p_k);
  v_metier_admin boolean; v_tools boolean; v_colors boolean; v_reserves boolean; v_tier text; v_visible boolean;
  v_fact_admin boolean; v_metier_membre boolean; v_vue boolean; v_gere boolean; v_chantiers boolean;
begin
  perform pg_temp.en_tant_que(pg_temp.adm(p_k));
  v_metier_admin := public.est_membre_actif(v_e);
  v_tools := public.a_acces_application(v_e, 'tools');
  v_colors := public.a_acces_application(v_e, 'colors');
  v_reserves := public.a_acces_application(v_e, 'reserves');
  v_tier := public.tools_resoudre_entitlements_entreprise(v_e)->>'tier';
  v_visible := exists (select 1 from public.entreprises where id = v_e);
  v_fact_admin := coalesce((select peut_gerer from public.etat_reabonnement_entreprise(v_e)), false);
  v_chantiers := public.a_permission(v_e, 'acces_chantiers');
  perform pg_temp.en_tant_que(pg_temp.mbr(p_k));
  v_metier_membre := public.est_membre_actif(v_e);
  v_vue := exists (select 1 from public.etat_reabonnement_entreprise(v_e));
  v_gere := coalesce((select peut_gerer from public.etat_reabonnement_entreprise(v_e)), false);
  perform pg_temp.en_service();
  insert into resultats_matrice values (p_k, (select libelle from matrice where k = p_k), v_metier_admin, v_metier_membre,
    v_tools, v_colors, v_reserves, v_tier, v_visible, v_fact_admin, v_vue, v_gere, v_chantiers);
end;
$$;
select pg_temp.mesurer(k) from matrice order by k;

select is(r.metier_admin, m.metier, 'M' || m.k || ' ' || m.libelle || ' : accès métier GP (admin)') from matrice m join resultats_matrice r using (k) order by k;
select is(r.metier_membre, m.metier, 'M' || m.k || ' ' || m.libelle || ' : accès métier GP (membre)') from matrice m join resultats_matrice r using (k) order by k;
select is(r.chantiers_rls, m.metier, 'M' || m.k || ' ' || m.libelle || ' : permission métier (a_permission)') from matrice m join resultats_matrice r using (k) order by k;
select is(r.entreprise_visible, m.metier, 'M' || m.k || ' ' || m.libelle || ' : fiche entreprise visible par RLS') from matrice m join resultats_matrice r using (k) order by k;
select is(r.tools, m.metier, 'M' || m.k || ' ' || m.libelle || ' : Tools (a_acces_application)') from matrice m join resultats_matrice r using (k) order by k;
select is(r.colors, m.metier, 'M' || m.k || ' ' || m.libelle || ' : Colors') from matrice m join resultats_matrice r using (k) order by k;
select is(r.reserves, m.metier, 'M' || m.k || ' ' || m.libelle || ' : Réserves') from matrice m join resultats_matrice r using (k) order by k;
select is(r.tools_tier, case when m.metier then 'pro' else 'free' end, 'M' || m.k || ' ' || m.libelle || ' : palier Tools effectif de l''admin Tools Pro') from matrice m join resultats_matrice r using (k) order by k;
select is(r.facturation_admin, m.facturation_admin, 'M' || m.k || ' ' || m.libelle || ' : chemin facturation ouvert à l''admin (voir / payer / réactiver)') from matrice m join resultats_matrice r using (k) order by k;
select ok(r.facturation_membre_vue and not r.facturation_membre_gere, 'M' || r.k || ' ' || r.libelle || ' : membre simple voit l''état, ne gère pas la facturation') from resultats_matrice r order by k;

-- Chemin minimal de l'admin suspendu : jamais d'identifiant Stripe, jamais de donnée métier.
select pg_temp.en_tant_que(pg_temp.adm(7));
select is((select count(*)::int from public.permissions_poste where entreprise_id = pg_temp.ent(7)), 0, 'M7 admin suspendu : permissions de poste masquées (aucun métier)');
select is((select count(*)::int from public.chantiers where entreprise_id = pg_temp.ent(7)), 0, 'M7 admin suspendu : chantiers invisibles');
select ok(not exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'etat_reabonnement_entreprise'), 'etat_reabonnement_entreprise est une fonction, pas une vue');
select is((select count(*)::int from public.etat_reabonnement_entreprise(pg_temp.ent(8))), 0, 'admin de M7 : aucun état d''une autre entreprise (M8)');
select pg_temp.en_service();
select ok(position('stripe' in lower(pg_get_function_result('public.etat_reabonnement_entreprise'::regproc))) = 0
  or pg_get_function_result('public.etat_reabonnement_entreprise'::regproc) not like '%stripe_%id%', 'état de reprise : aucun identifiant Stripe exposé');

-- Accès support plateforme inchangé par B-4 : il reste le seul accès à une entreprise en essai expiré.
select is(public.est_membre_actif(pg_temp.ent(4)), false, 'M4 hors session : aucun accès');

-- ═══════════════════════════════════════════════════════════════════════════
-- §S. Portée des suspensions : un incident Tools ne coupe pas GP
-- ═══════════════════════════════════════════════════════════════════════════
update public.entitlements_utilisateurs_elsatia set status = 'past_due' where utilisateur_id = pg_temp.adm(5);
select pg_temp.en_tant_que(pg_temp.adm(5));
select is(public.tools_resoudre_entitlements_entreprise(pg_temp.ent(5))->>'tier', 'free', 'S1 abonnement Tools past_due : Tools redescend en Free');
select ok(public.est_membre_actif(pg_temp.ent(5)), 'S1 abonnement Tools past_due : GP intact');
select ok(public.a_acces_application(pg_temp.ent(5), 'colors') and public.a_acces_application(pg_temp.ent(5), 'reserves'), 'S1 Colors et Réserves intacts');
select pg_temp.en_service();
update public.acces_applications_entreprises set autorise = false where entreprise_id = pg_temp.ent(5) and application_code = 'tools';
select pg_temp.en_tant_que(pg_temp.adm(5));
select ok(not public.a_acces_application(pg_temp.ent(5), 'tools'), 'S2 accès Tools retiré à l''entreprise : Tools coupé');
select ok(public.est_membre_actif(pg_temp.ent(5)) and public.a_permission(pg_temp.ent(5), 'acces_chantiers'), 'S2 accès Tools retiré : GP intact');
select ok(public.a_acces_application(pg_temp.ent(5), 'colors'), 'S2 accès Tools retiré : Colors intact');
select pg_temp.en_service();
-- Relevé Pro inclut Tools Pro (catalogue) ; Tools Pro seul n'ouvre jamais Relevé.
insert into public.entitlements_utilisateurs_elsatia (utilisateur_id, application_code, niveau, capabilities, source)
values (pg_temp.adm(1), 'tools', 'pro', array['releve-metre'], 'internal');
select pg_temp.en_tant_que(pg_temp.adm(1));
select ok((select bool_and(c = any (array(select jsonb_array_elements_text(public.tools_resoudre_entitlements()->'capabilities'))))
  from unnest(public.tools_capabilities_pro()) c), 'S3 Relevé Pro ⊇ Tools Pro');
select pg_temp.en_tant_que(pg_temp.adm(10));
select ok(not (public.tools_resoudre_entitlements()->'capabilities') ? 'releve-metre', 'S3 Tools Pro seul : pas de Relevé');
select pg_temp.en_service();
select throws_ok($$ insert into public.tools_monetization_subscriptions(utilisateur_id, product_sku) values ('c1000000-0000-4000-8000-000000000001', 'tools_releve_monthly') $$,
  null, null, 'S4 aucun SKU Relevé Pro vendable (Stripe Relevé Pro non activé)');

-- ═══════════════════════════════════════════════════════════════════════════
-- §B2. Catalogue actif = grille canonique (79/249/449/599, annuel ×10)
-- ═══════════════════════════════════════════════════════════════════════════
select results_eq($$ select code, prix_mensuel_ht, prix_annuel_ht from public.plans_abonnement where actif and code in ('mini','pro','business','entreprise') order by code $$,
  $$ values ('business'::text, 449.00::numeric, 4490.00::numeric), ('entreprise', 599.00, 5990.00), ('mini', 79.00, 790.00), ('pro', 249.00, 2490.00) $$,
  'B2 versions actives = grille canonique');
select ok((select bool_and(prix_annuel_ht = 10 * prix_mensuel_ht) from public.plans_abonnement where actif and not devis_obligatoire), 'B2 annuel = 10 × mensuel');
select is((select count(*)::int from public.plans_abonnement where code = 'mini' and prix_mensuel_ht = 69), 1, 'B2 grille 69 € conservée en historique (jamais supprimée)');
select ok((select bool_and(p.utilisateurs_inclus = x.n) from public.plans_abonnement p join (values ('mini',3),('pro',15),('business',30),('entreprise',50)) x(code, n) using (code) where p.actif), 'B2 quotas inchangés (3/15/30/50)');
select is((select prix_mensuel_ht from public.plans_abonnement where code = 'sur_mesure' and actif), null, 'B2 Sur mesure : toujours sur devis');

-- ═══════════════════════════════════════════════════════════════════════════
-- §L. Cycle de vie complet — entreprise L (essai → payant → impayé → reprise
--      → changement d'offre → résiliation → annulation → réabonnement)
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.entreprises (id, nom, code_adhesion, stripe_customer_id)
values ('d0000000-0000-4000-8000-000000000001', 'Cycle L', 'CYCL0001', 'cus_L');
select is((select abonnement_statut || ':' || (abonnement_essai_fin - abonnement_essai_debut) from public.entreprises where id = 'd0000000-0000-4000-8000-000000000001'),
  'essai:30', 'L1 création : essai ELSATIA de 30 jours');
select is((select abonnement_essai_debut from public.entreprises where id = 'd0000000-0000-4000-8000-000000000001'), current_date, 'L1 essai démarre à la création');

-- Checkout pendant l'essai : Stripe trialing ; trial_end au-delà de la fenêtre locale → borné.
select pg_temp.verite('sub_L1', 'trialing');
select is(pg_temp.evt_sub('d0000000-0000-4000-8000-000000000001', 'evt_L_co', 'checkout.session.completed', 'sub_L1', 10, 'mini', 'mensuel', null, null, current_date + 90),
  'lie:applique', 'L2 checkout.session.completed : première liaison');
select is(pg_temp.st('d0000000-0000-4000-8000-000000000001'), 'essai', 'L2 trialing = essai');
select is((select abonnement_essai_fin from public.entreprises where id = 'd0000000-0000-4000-8000-000000000001'), current_date + 30, 'L2 trial_end Stripe (J+90) borné à la fenêtre locale : aucun essai rallongé');
select is((select count(*)::int from public.stripe_essai_ecarts where entreprise_id = 'd0000000-0000-4000-8000-000000000001'), 1, 'L2 écart d''essai journalisé');
select is((select code_offre || ':' || prix_contractuel_ht from public.abonnements_entreprises where entreprise_id = 'd0000000-0000-4000-8000-000000000001'),
  'mini:79.00', 'L2 contrat Mini au prix canonique 79 € (B2)');

-- Doublon exact du checkout : aucun effet.
select is(pg_temp.evt_sub('d0000000-0000-4000-8000-000000000001', 'evt_L_co', 'checkout.session.completed', 'sub_L1', 10), 'deja_lie:deja_traite', 'W1 doublon exact : déjà traité');

-- Fin d'essai : Stripe facture, invoice.paid puis subscription active.
select pg_temp.verite('sub_L1', 'active');
select is(pg_temp.fac('d0000000-0000-4000-8000-000000000001', 'evt_L_p1', 'invoice.paid', 'in_L1', 'sub_L1', 100)->>'decision', 'applique', 'L3 invoice.paid appliqué');
select is(pg_temp.evt_sub('d0000000-0000-4000-8000-000000000001', 'evt_L_up1', 'customer.subscription.updated', 'sub_L1', 101), 'deja_lie:applique', 'L3 trialing → active');
select is(pg_temp.st('d0000000-0000-4000-8000-000000000001'), 'actif', 'L3 actif');

-- Échec de paiement : suspension immédiate (décision Preview, aucun délai de grâce).
select is(pg_temp.fac('d0000000-0000-4000-8000-000000000001', 'evt_L_f2', 'invoice.payment_failed', 'in_L2', 'sub_L1', 200)::jsonb - 'statut_avant',
  '{"decision":"applique","motif":null,"statut_resultant":"suspendu","notifier_echec":true}'::jsonb, 'L4 payment_failed : suspension immédiate + notification');
select is(pg_temp.st('d0000000-0000-4000-8000-000000000001'), 'suspendu', 'L4 suspendu');
select is(pg_temp.fac('d0000000-0000-4000-8000-000000000001', 'evt_L_f2', 'invoice.payment_failed', 'in_L2', 'sub_L1', 200)->>'notifier_echec', 'false', 'W2 rejeu du payment_failed : aucune seconde notification');
-- 3-D Secure : jamais un échec.
select is(pg_temp.fac('d0000000-0000-4000-8000-000000000001', 'evt_L_3ds', 'invoice.payment_action_required', 'in_L2', 'sub_L1', 201)->>'decision', 'sans_effet', 'L4 payment_action_required : sans effet sur l''accès');
-- past_due puis unpaid (relecture) : reste suspendu.
select pg_temp.verite('sub_L1', 'past_due');
select is(pg_temp.evt_sub('d0000000-0000-4000-8000-000000000001', 'evt_L_pd', 'customer.subscription.updated', 'sub_L1', 202), 'deja_lie:applique', 'L5 past_due relu');
select is(pg_temp.st('d0000000-0000-4000-8000-000000000001'), 'suspendu', 'L5 past_due = suspendu');
select pg_temp.verite('sub_L1', 'unpaid');
select pg_temp.evt_sub('d0000000-0000-4000-8000-000000000001', 'evt_L_un', 'customer.subscription.updated', 'sub_L1', 203);
select is(pg_temp.st('d0000000-0000-4000-8000-000000000001'), 'suspendu', 'L5 unpaid = suspendu');
-- Périmé : un vieux invoice.paid d'une facture antérieure, livré maintenant, ne réactive pas.
select is(pg_temp.fac('d0000000-0000-4000-8000-000000000001', 'evt_L_old', 'invoice.paid', 'in_L0', 'sub_L1', 150)->>'decision', 'perime', 'W3 invoice.paid antérieur au filigrane : périmé');
select is(pg_temp.st('d0000000-0000-4000-8000-000000000001'), 'suspendu', 'W3 toujours suspendu');
-- Paiement via le Portail / facture hébergée : invoice.paid puis active.
select pg_temp.verite('sub_L1', 'active');
select is(pg_temp.fac('d0000000-0000-4000-8000-000000000001', 'evt_L_p2', 'invoice.paid', 'in_L2', 'sub_L1', 300)->>'decision', 'applique', 'L6 régularisation (Portail) : invoice.paid');
select is(pg_temp.st('d0000000-0000-4000-8000-000000000001'), 'actif', 'L6 accès rétabli');
select is((select impaye_signale_at from public.entreprises where id = 'd0000000-0000-4000-8000-000000000001'), null, 'L6 impayé régularisé');
-- W4 désordre : le payment_failed de in_L2 (créé à 200) re-livré après son paid → facture payée terminale.
select is(pg_temp.fac('d0000000-0000-4000-8000-000000000001', 'evt_L_f2_bis', 'invoice.payment_failed', 'in_L2', 'sub_L1', 250)->>'decision', 'perime', 'W4 payment_failed après paid de la même facture : périmé');
select is(pg_temp.st('d0000000-0000-4000-8000-000000000001'), 'actif', 'W4 toujours actif');

-- Changement d'offre (Portail) : l'offre facturée (Price) est transmise par le serveur (B-3).
select is(pg_temp.evt_sub('d0000000-0000-4000-8000-000000000001', 'evt_L_chg', 'customer.subscription.updated', 'sub_L1', 400, 'business', 'annuel'), 'deja_lie:applique', 'L7 changement d''offre appliqué');
select is((select abonnement_offre || ':' || abonnement_periodicite from public.entreprises where id = 'd0000000-0000-4000-8000-000000000001'), 'business:annuel', 'L7 droits = offre facturée');
select is((select code_offre || ':' || prix_contractuel_ht from public.abonnements_entreprises where entreprise_id = 'd0000000-0000-4000-8000-000000000001'),
  'business:4490.00', 'L7 nouveau contrat au prix canonique annuel (449 × 10)');
-- Même offre relue plus tard : prix contractuel figé.
update public.plans_abonnement set actif = false where code = 'business' and actif;
insert into public.plans_abonnement(code, version, nom, prix_mensuel_ht, prix_annuel_ht, devise, utilisateurs_inclus, administrateurs_inclus, operations_ia_incluses, stockage_go_inclus, actif, valide_du)
values ('business', 99, 'Business futur', 499, 4990, 'EUR', 30, 6, 1500, 150, true, current_date);
select pg_temp.evt_sub('d0000000-0000-4000-8000-000000000001', 'evt_L_chg2', 'customer.subscription.updated', 'sub_L1', 401, 'business', 'annuel');
select is((select prix_contractuel_ht from public.abonnements_entreprises where entreprise_id = 'd0000000-0000-4000-8000-000000000001'), 4490.00, 'L7 nouvelle grille : contrat en cours inchangé (pas de repricing)');

-- Résiliation fin de période (Portail : cancel_at_period_end) : droits conservés jusqu'à l'échéance.
select is(pg_temp.evt_sub('d0000000-0000-4000-8000-000000000001', 'evt_L_cpe', 'customer.subscription.updated', 'sub_L1', 500, 'business', 'annuel', pg_temp.t(0) + interval '30 days'), 'deja_lie:applique', 'L8 cancel_at_period_end');
select is(pg_temp.st('d0000000-0000-4000-8000-000000000001'), 'actif', 'L8 droits conservés jusqu''à la fin de période');
select isnt((select abonnement_annulation_prevue_at from public.entreprises where id = 'd0000000-0000-4000-8000-000000000001'), null, 'L8 annulation programmée visible');
-- Fin de période : Stripe supprime la subscription (aucun renouvellement).
select pg_temp.verite('sub_L1', 'canceled');
select is(pg_temp.evt_sub('d0000000-0000-4000-8000-000000000001', 'evt_L_del', 'customer.subscription.deleted', 'sub_L1', 600, 'business', 'annuel'), 'deja_lie:applique', 'L9 subscription.deleted');
select is(pg_temp.st('d0000000-0000-4000-8000-000000000001'), 'annule', 'L9 annulé : plus de droits');

-- ═══════════════════════════════════════════════════════════════════════════
-- §B1. Une facture ne lève jamais « annule » (correctif 701)
-- ═══════════════════════════════════════════════════════════════════════════
select is(pg_temp.fac('d0000000-0000-4000-8000-000000000001', 'evt_L_late', 'invoice.paid', 'in_L9', 'sub_L1', 700)::jsonb - 'statut_avant',
  '{"decision":"sans_effet","motif":"abonnement_termine","statut_resultant":"annule","notifier_echec":false}'::jsonb, 'B1 invoice.paid tardif après deleted : sans effet');
select is(pg_temp.st('d0000000-0000-4000-8000-000000000001'), 'annule', 'B1 aucun accès rouvert sans subscription vivante');
select is((select statut from public.factures_abonnement where stripe_invoice_id = 'in_L9'), 'paid', 'B1 facture réelle conservée (historique client)');
select is((select derniere_facture_statut from public.entreprises where id = 'd0000000-0000-4000-8000-000000000001'), 'paid', 'B1 trace « dernière facture » tenue');
select is(pg_temp.journal('evt_L_late'), 'sans_effet/abonnement_termine', 'B1 décision journalisée et motivée');
select is(pg_temp.fac('d0000000-0000-4000-8000-000000000001', 'evt_L_late_f', 'invoice.payment_failed', 'in_L10', 'sub_L1', 710)->>'decision', 'sans_effet', 'B1 payment_failed tardif : sans effet');
select is(pg_temp.fac('d0000000-0000-4000-8000-000000000001', 'evt_L_late_3', 'invoice.payment_action_required', 'in_L11', 'sub_L1', 720)->>'decision', 'sans_effet', 'B1 3DS tardif : sans effet');
select is(pg_temp.st('d0000000-0000-4000-8000-000000000001'), 'annule', 'B1 toujours annulé');
-- Même seconde, deux ordres : deleted et invoice.paid à la même seconde → annule.
insert into public.entreprises (id, nom, code_adhesion, stripe_customer_id, abonnement_statut) values
  ('d0000000-0000-4000-8000-000000000002', 'Même seconde 1', 'CYCL0002', 'cus_M1', 'essai'),
  ('d0000000-0000-4000-8000-000000000003', 'Même seconde 2', 'CYCL0003', 'cus_M2', 'essai');
select pg_temp.verite('sub_M1', 'active'); select pg_temp.verite('sub_M2', 'active');
select pg_temp.evt_sub('d0000000-0000-4000-8000-000000000002', 'evt_M1_a', 'customer.subscription.created', 'sub_M1', 10);
select pg_temp.evt_sub('d0000000-0000-4000-8000-000000000003', 'evt_M2_a', 'customer.subscription.created', 'sub_M2', 10);
select pg_temp.verite('sub_M1', 'canceled'); select pg_temp.verite('sub_M2', 'canceled');
select pg_temp.evt_sub('d0000000-0000-4000-8000-000000000002', 'evt_M1_d', 'customer.subscription.deleted', 'sub_M1', 50);
select pg_temp.fac('d0000000-0000-4000-8000-000000000002', 'evt_M1_p', 'invoice.paid', 'in_M1', 'sub_M1', 50);
select pg_temp.fac('d0000000-0000-4000-8000-000000000003', 'evt_M2_p', 'invoice.paid', 'in_M2', 'sub_M2', 50);
select pg_temp.evt_sub('d0000000-0000-4000-8000-000000000003', 'evt_M2_d', 'customer.subscription.deleted', 'sub_M2', 50);
select is(pg_temp.st('d0000000-0000-4000-8000-000000000002') || '/' || pg_temp.st('d0000000-0000-4000-8000-000000000003'), 'annule/annule',
  'W5 même seconde deleted / invoice.paid : annulé dans les deux ordres');

-- Désordre : la facture finale payée (plus récente) arrive AVANT le deleted (plus ancien).
insert into public.entreprises (id, nom, code_adhesion, stripe_customer_id) values ('d0000000-0000-4000-8000-000000000005', 'Désordre annulation', 'CYCL0005', 'cus_O');
select pg_temp.verite('sub_O', 'active');
select pg_temp.evt_sub('d0000000-0000-4000-8000-000000000005', 'evt_O_a', 'customer.subscription.created', 'sub_O', 10);
select pg_temp.verite('sub_O', 'canceled');
select is(pg_temp.fac('d0000000-0000-4000-8000-000000000005', 'evt_O_p', 'invoice.paid', 'in_O', 'sub_O', 200)->>'decision', 'applique', 'W8 invoice.paid final livré avant le deleted : appliqué (subscription encore active localement)');
select is(pg_temp.evt_sub('d0000000-0000-4000-8000-000000000005', 'evt_O_d', 'customer.subscription.deleted', 'sub_O', 100), 'deja_lie:applique', 'W8 deleted antérieur au filigrane : état terminal appliqué (B-1)');
select is(pg_temp.st('d0000000-0000-4000-8000-000000000005'), 'annule', 'W8 annulé : aucun accès sans subscription vivante');
select is((select dernier_evenement_id from public.stripe_objets_ordre where flux = 'abonnement' and objet_type = 'entreprise_acces' and objet_id = 'd0000000-0000-4000-8000-000000000005'),
  'evt_O_p', 'W8 filigrane jamais reculé');
select is(pg_temp.fac('d0000000-0000-4000-8000-000000000005', 'evt_O_p2', 'invoice.paid', 'in_O2', 'sub_O', 300)->>'decision', 'sans_effet', 'W8 facture encore plus tardive : sans effet');

-- Annulation immédiate (depuis actif, sans fin de période).
insert into public.entreprises (id, nom, code_adhesion, stripe_customer_id) values ('d0000000-0000-4000-8000-000000000004', 'Annulation immédiate', 'CYCL0004', 'cus_I');
select pg_temp.verite('sub_I', 'active');
select pg_temp.evt_sub('d0000000-0000-4000-8000-000000000004', 'evt_I_a', 'customer.subscription.created', 'sub_I', 10);
select pg_temp.fac('d0000000-0000-4000-8000-000000000004', 'evt_I_p', 'invoice.paid', 'in_I1', 'sub_I', 11);
select pg_temp.verite('sub_I', 'canceled');
select pg_temp.evt_sub('d0000000-0000-4000-8000-000000000004', 'evt_I_d', 'customer.subscription.deleted', 'sub_I', 20);
select is(pg_temp.st('d0000000-0000-4000-8000-000000000004'), 'annule', 'L10 annulation immédiate : droits coupés tout de suite');
-- Facture de prorata finale payée juste après : aucune réouverture (B1).
select pg_temp.fac('d0000000-0000-4000-8000-000000000004', 'evt_I_fin', 'invoice.paid', 'in_I2', 'sub_I', 21);
select is(pg_temp.st('d0000000-0000-4000-8000-000000000004'), 'annule', 'L10 facture finale payée : aucune réouverture');

-- ═══════════════════════════════════════════════════════════════════════════
-- §L11. Réabonnement de L : même client, aucun essai, anciennes factures ignorées
-- ═══════════════════════════════════════════════════════════════════════════
select throws_ok($$ select public.relier_subscription_reabonnement_service('d0000000-0000-4000-8000-000000000001', 'sub_intrus', 'cus_autre', 'active', 'sub_L1', 'canceled') $$,
  '42501', null, 'W6 mauvais client : jamais rattaché');
-- W7 facture d'une subscription inconnue (événement subscription manquant/en retard) : différée.
select is(pg_temp.fac('d0000000-0000-4000-8000-000000000001', 'evt_L2_p0', 'invoice.paid', 'in_L2_0', 'sub_L2', 800)->>'decision', 'differe', 'W7 facture avant subscription.created : différée (503, Stripe re-livre)');
select is(pg_temp.journal('evt_L2_p0'), null, 'W7 rien journalisé : l''événement reste rejouable');
select is(pg_temp.st('d0000000-0000-4000-8000-000000000001'), 'annule', 'W7 aucun accès sur une facture non rattachée');
select pg_temp.verite('sub_L2', 'active');
select is(pg_temp.evt_sub('d0000000-0000-4000-8000-000000000001', 'evt_L2_co', 'checkout.session.completed', 'sub_L2', 810, 'pro', 'mensuel', null, null, current_date + 20),
  'relie:applique', 'L11 réabonnement rattaché');
select is(pg_temp.st('d0000000-0000-4000-8000-000000000001'), 'actif', 'L11 droits rendus sur état Stripe compatible');
select is((select stripe_customer_id from public.entreprises where id = 'd0000000-0000-4000-8000-000000000001'), 'cus_L', 'L11 même client Stripe');
-- Essai démarré aujourd'hui : fenêtre close au plus tôt à son début (contrainte), jamais rouverte.
select ok((select abonnement_essai_fin <= current_date and abonnement_essai_fin < abonnement_essai_debut + 30 from public.entreprises where id = 'd0000000-0000-4000-8000-000000000001'), 'L11 aucun second essai (fenêtre locale close)');
select is(pg_temp.fac('d0000000-0000-4000-8000-000000000001', 'evt_L_ancien', 'invoice.payment_failed', 'in_L12', 'sub_L1', 900)->>'decision', 'sans_effet', 'L11 vieille facture de l''ancienne subscription ignorée');
select is(pg_temp.st('d0000000-0000-4000-8000-000000000001'), 'actif', 'L11 nouvelle subscription non suspendue par l''ancienne');
select is(pg_temp.evt_sub('d0000000-0000-4000-8000-000000000001', 'evt_L_vieux_up', 'customer.subscription.updated', 'sub_L1', 910), 'remplacee', 'L11 événement tardif de l''ancienne subscription : sans effet');
-- W7 suite : la facture différée re-livrée après rattachement s'applique normalement.
select is(pg_temp.fac('d0000000-0000-4000-8000-000000000001', 'evt_L2_p0', 'invoice.paid', 'in_L2_0', 'sub_L2', 800)->>'decision', 'perime', 'W7 re-livraison : ordonnée (antérieure au rattachement) sans inverser l''accès');
select is(pg_temp.st('d0000000-0000-4000-8000-000000000001'), 'actif', 'W7 accès conservé');

-- ═══════════════════════════════════════════════════════════════════════════
-- §T. Essai : jamais prolongé par l'API
-- ═══════════════════════════════════════════════════════════════════════════
select pg_temp.en_tant_que(pg_temp.adm(1));
select throws_ok($$ update public.entreprises set abonnement_essai_fin = current_date + 60 where id = 'c0000000-0000-4000-8000-000000000001' $$,
  null, null, 'T1 un membre ne prolonge jamais son essai');
select pg_temp.en_service();
set local role service_role;
select throws_ok($$ update public.entreprises set abonnement_essai_fin = current_date + 60 where id = 'c0000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'T2 service_role ne prolonge jamais l''essai');
reset role;
-- B4 : l'essai expiré redevient accessible dès qu'un paiement est confirmé.
select pg_temp.verite('sub_B4', 'active');
update public.entreprises set stripe_customer_id = 'cus_B4' where id = pg_temp.ent(4);
select pg_temp.evt_sub(pg_temp.ent(4), 'evt_B4_co', 'checkout.session.completed', 'sub_B4', 10);
select pg_temp.en_tant_que(pg_temp.adm(4));
select ok(public.est_membre_actif(pg_temp.ent(4)) and public.a_acces_application(pg_temp.ent(4), 'colors'), 'B4 essai expiré puis abonnement actif : GP et applis rouvertes');
select pg_temp.en_service();

-- ═══════════════════════════════════════════════════════════════════════════
-- §A. Audit : chaque transition d'accès de L est journalisée
-- ═══════════════════════════════════════════════════════════════════════════
select ok((select bool_and(decision in ('applique','perime','sans_effet','deja_traite')) from public.stripe_evenements_ordre where entreprise_id = 'd0000000-0000-4000-8000-000000000001'), 'A1 décisions typées');
select is((select count(*)::int from public.stripe_evenements_ordre where entreprise_id = 'd0000000-0000-4000-8000-000000000001' and decision = 'applique' and etat_avant is distinct from etat_apres),
  (select count(*)::int from public.stripe_evenements_ordre where entreprise_id = 'd0000000-0000-4000-8000-000000000001' and decision = 'applique' and etat_avant is distinct from etat_apres and stripe_event_type is not null),
  'A2 chaque changement d''état porte son type d''événement Stripe');
select ok((select count(*) from public.stripe_evenements_ordre where entreprise_id = 'd0000000-0000-4000-8000-000000000001' and decision in ('perime','sans_effet') and motif is null) = 0, 'A3 tout refus est motivé');
select is((select count(distinct stripe_event_id)::int from public.stripe_evenements_ordre where entreprise_id = 'd0000000-0000-4000-8000-000000000001'),
  (select count(*)::int from public.stripe_evenements_ordre where entreprise_id = 'd0000000-0000-4000-8000-000000000001'), 'A4 un événement = une décision (idempotence)');

select * from finish();
rollback;
