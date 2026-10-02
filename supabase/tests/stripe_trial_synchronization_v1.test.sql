begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ELSATIA — Stripe Trial Synchronization Hardening V1 (migration 20260927000507).
-- L'essai local ELSATIA fait autorité : un trial_end Stripe ne peut que le
-- raccourcir, jamais l'allonger ni le vider, et plus aucun customer.subscription.*
-- ne lève d'erreur de contrainte (finding F-1 du lot Stripe Ordering).
-- Toutes les dates sont fixes : la suite ne dépend ni de current_date ni du fuseau.

\ir fixtures/isolation_multitenant.inc

insert into public.plans_abonnement(id, code, version, nom, prix_mensuel_ht, prix_annuel_ht, devise,
  utilisateurs_inclus, administrateurs_inclus, operations_ia_incluses, stockage_go_inclus, actif)
values ('c1a11111-0000-0000-0000-0000000000b1','pro',8,'Pro (test essai)',249,2490,'EUR',15,3,0,100,true)
on conflict do nothing;

-- Essai local : D = 2026-10-01, fin locale D+30 = 2026-10-31.
insert into public.entreprises (id, nom, code_adhesion, abonnement_statut, abonnement_essai_debut, abonnement_essai_fin, stripe_customer_id) values
  ('f0000000-0000-0000-0000-000000000001', 'Essai J0', 'TRI00001', 'essai', '2026-10-01', '2026-10-31', null),
  ('f0000000-0000-0000-0000-000000000002', 'Essai J15 corrigé', 'TRI00002', 'essai', '2026-10-01', '2026-10-31', null),
  ('f0000000-0000-0000-0000-000000000003', 'Essai J15 legacy F-1', 'TRI00003', 'essai', '2026-10-01', '2026-10-31', null),
  ('f0000000-0000-0000-0000-000000000004', 'Sans essai J29', 'TRI00004', 'essai', '2026-10-01', '2026-10-31', null),
  ('f0000000-0000-0000-0000-000000000005', 'Raccourci', 'TRI00005', 'essai', '2026-10-01', '2026-10-31', null),
  ('f0000000-0000-0000-0000-000000000006', 'Date incohérente', 'TRI00006', 'essai', '2026-10-01', '2026-10-31', null),
  ('f0000000-0000-0000-0000-000000000007', 'Désordre A', 'TRI00007', 'essai', '2026-10-01', '2026-10-31', null),
  ('f0000000-0000-0000-0000-000000000008', 'Désordre B', 'TRI00008', 'essai', '2026-10-01', '2026-10-31', null),
  ('f0000000-0000-0000-0000-000000000009', 'DST mars', 'TRI00009', 'essai', '2026-03-15', '2026-04-14', null),
  ('f0000000-0000-0000-0000-000000000010', 'Client Stripe existant', 'TRI00010', 'essai', '2026-10-01', '2026-10-31', 'cus_tri_10'),
  ('f0000000-0000-0000-0000-000000000011', 'Subscription existante', 'TRI00011', 'actif', '2026-10-01', '2026-10-31', 'cus_tri_11'),
  ('f0000000-0000-0000-0000-000000000012', 'Garde trigger', 'TRI00012', 'essai', '2026-10-01', '2026-10-20', null),
  ('f0000000-0000-0000-0000-000000000013', 'Webhooks factures', 'TRI00013', 'essai', '2026-10-01', '2026-10-31', null),
  ('f0000000-0000-0000-0000-000000000014', 'Expiré', 'TRI00014', 'essai', '2026-08-01', '2026-08-31', null)
on conflict (id) do nothing;

update public.entreprises set stripe_subscription_id = 'sub_tri_11' where id = 'f0000000-0000-0000-0000-000000000011';

create function pg_temp.t(n integer) returns timestamptz language sql immutable
as $$ select timestamptz '2026-10-01 00:00:00+00' + make_interval(secs => n) $$;

create function pg_temp.abo(e text, evt text, n integer, essai date, statut text default 'essai', sub text default null)
returns jsonb language sql as $$
  select public.synchroniser_abonnement_stripe_ordonne_service(
    e::uuid, coalesce(sub, 'sub_tri_' || right(e, 2)), 'cus_tri_' || right(e, 2), statut, 'pro', 'mensuel',
    date '2026-11-30', essai, null, pg_temp.t(0), pg_temp.t(0) + interval '30 days',
    evt, 'customer.subscription.updated', pg_temp.t(n), 'subscription', coalesce(sub, 'sub_tri_' || right(e, 2)))
$$;

create function pg_temp.fin(e text) returns date language sql as $$
  select abonnement_essai_fin from public.entreprises where id = e::uuid
$$;

create function pg_temp.ecarts(e text) returns text language sql as $$
  select coalesce(string_agg(nature || ':' || trial_end_stripe || '->' || essai_fin_retenue || 'x' || occurrences, ',' order by id), '')
  from public.stripe_essai_ecarts where entreprise_id = e::uuid
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0. Structure, ACL
-- ═══════════════════════════════════════════════════════════════════════════
select has_table('public', 'stripe_essai_ecarts', 'journal des écarts d''essai présent');
select ok((select relrowsecurity from pg_class where oid = 'public.stripe_essai_ecarts'::regclass), 'RLS écarts activée');
select ok(not has_table_privilege('service_role', 'public.stripe_essai_ecarts', 'INSERT'), 'service_role : pas d''INSERT direct des écarts');
select ok(not has_table_privilege('authenticated', 'public.stripe_essai_ecarts', 'INSERT'), 'authenticated : pas d''INSERT des écarts');
select ok(not has_table_privilege('anon', 'public.stripe_essai_ecarts', 'SELECT'), 'anon : aucune lecture des écarts');
select ok(has_function_privilege('service_role',
  'public.synchroniser_abonnement_stripe_service(uuid,text,text,text,text,text,date,date,timestamptz,timestamptz,timestamptz)', 'EXECUTE'),
  'service_role : EXECUTE synchroniser_abonnement_stripe_service conservé');
select ok(not has_function_privilege('authenticated',
  'public.synchroniser_abonnement_stripe_service(uuid,text,text,text,text,text,date,date,timestamptz,timestamptz,timestamptz)', 'EXECUTE'),
  'authenticated : PAS d''EXECUTE sur la synchronisation');
select ok(not has_function_privilege('anon', 'public.essai_fin_bornee_stripe(date,date,date)', 'EXECUTE'), 'anon : pas la borne');
select has_trigger('public', 'entreprises', 'borner_essai_entreprise', 'trigger borner_essai_entreprise présent');
select ok(exists(select 1 from pg_constraint where conname = 'entreprises_essai_dates_coherentes'), 'contrainte de fenêtre toujours en place');

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Borne pure
-- ═══════════════════════════════════════════════════════════════════════════
select is(public.essai_fin_bornee_stripe('2026-10-01', '2026-10-31', '2026-10-31'), date '2026-10-31', 'borne : trial_end = fin locale → retenu');
select is(public.essai_fin_bornee_stripe('2026-10-01', '2026-10-31', '2026-11-15'), date '2026-10-31', 'borne : trial_end > fin locale → borné');
select is(public.essai_fin_bornee_stripe('2026-10-01', '2026-10-31', null), date '2026-10-31', 'borne : pas de trial Stripe → essai local conservé (jamais NULL)');
select is(public.essai_fin_bornee_stripe('2026-10-01', '2026-10-31', '2026-09-01'), date '2026-10-31', 'borne : trial_end < début → ignoré');
select is(public.essai_fin_bornee_stripe('2026-10-01', '2026-10-31', '2026-10-01'), date '2026-10-01', 'borne : trial_end = début → accepté (raccourci)');
select is(public.essai_fin_bornee_stripe('2026-10-01', '2026-10-20', '2026-10-25'), date '2026-10-20', 'borne : jamais au-delà de la fin actuelle (déjà raccourcie)');
select is(public.essai_fin_bornee_stripe('2026-10-01', null, '2026-11-20'), date '2026-10-31', 'borne : fin actuelle absente → début + 30');
select is(public.essai_fin_bornee_stripe('2026-10-01', '2026-12-31', '2026-12-01'), date '2026-10-31', 'borne : fin actuelle hors fenêtre → début + 30');

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. customer.subscription.* selon le jour de souscription
-- ═══════════════════════════════════════════════════════════════════════════
-- Jour 0 : Checkout envoie trial_end = 2026-10-31T23:59:59Z → date 2026-10-31.
select is(pg_temp.abo('f0000000-0000-0000-0000-000000000001', 'evt_j0', 10, '2026-10-31')->>'decision', 'applique', 'J0 : created appliqué');
select is(pg_temp.fin('f0000000-0000-0000-0000-000000000001'), date '2026-10-31', 'J0 : fin d''essai = fin locale');
select is(pg_temp.ecarts('f0000000-0000-0000-0000-000000000001'), '', 'J0 : aucun écart');

-- Jour 15 corrigé : le même trial_end absolu.
select is(pg_temp.abo('f0000000-0000-0000-0000-000000000002', 'evt_j15', 10, '2026-10-31')->>'decision', 'applique', 'J15 : appliqué');
select is(pg_temp.fin('f0000000-0000-0000-0000-000000000002'), date '2026-10-31', 'J15 : pas de prolongation');

-- Jour 15 legacy (subscription créée avant ce lot, trial_period_days = 30) : F-1.
select lives_ok($$select pg_temp.abo('f0000000-0000-0000-0000-000000000003', 'evt_legacy_1', 10, '2026-11-15')$$,
  'F-1 : trial_end legacy (J+45) n''échoue plus (ancienne violation 23514 → 500 en boucle)');
select is(pg_temp.fin('f0000000-0000-0000-0000-000000000003'), date '2026-10-31', 'F-1 : fin d''essai bornée à la fenêtre locale');
select is((select abonnement_statut from public.entreprises where id = 'f0000000-0000-0000-0000-000000000003'), 'essai', 'F-1 : statut synchronisé malgré le trial excessif');
select is(pg_temp.ecarts('f0000000-0000-0000-0000-000000000003'), 'depasse_fenetre_locale:2026-11-15->2026-10-31x1', 'F-1 : écart journalisé');
select lives_ok($$select pg_temp.abo('f0000000-0000-0000-0000-000000000003', 'evt_legacy_2', 20, '2026-11-15')$$, 'F-1 : updated suivant accepté');
select is(pg_temp.ecarts('f0000000-0000-0000-0000-000000000003'), 'depasse_fenetre_locale:2026-11-15->2026-10-31x2', 'F-1 : écart dédoublonné (occurrences)');
select is(pg_temp.abo('f0000000-0000-0000-0000-000000000003', 'evt_legacy_2', 20, '2026-11-15')->>'decision', 'deja_traite', 'F-1 : rejeu du même événement = deja_traite');
select is(pg_temp.ecarts('f0000000-0000-0000-0000-000000000003'), 'depasse_fenetre_locale:2026-11-15->2026-10-31x2', 'F-1 : rejeu sans nouvel écart');

-- Jour 29 / 30 / expiré : Checkout sans essai → trial_end NULL, statut actif.
select lives_ok($$select pg_temp.abo('f0000000-0000-0000-0000-000000000004', 'evt_sans_essai', 10, null, 'actif')$$,
  'sans essai : trial_end NULL n''échoue plus (ancienne violation NOT NULL)');
select is(pg_temp.fin('f0000000-0000-0000-0000-000000000004'), date '2026-10-31', 'sans essai : essai local conservé, jamais NULL');
select is((select abonnement_statut from public.entreprises where id = 'f0000000-0000-0000-0000-000000000004'), 'actif', 'sans essai : actif');
select is(pg_temp.ecarts('f0000000-0000-0000-0000-000000000004'), '', 'sans essai : aucun écart');

select lives_ok($$select pg_temp.abo('f0000000-0000-0000-0000-000000000014', 'evt_expire', 10, null, 'actif')$$, 'essai expiré : abonnement sans essai accepté');
select is(pg_temp.fin('f0000000-0000-0000-0000-000000000014'), date '2026-08-31', 'essai expiré : fin historique conservée');
select lives_ok($$select pg_temp.abo('f0000000-0000-0000-0000-000000000014', 'evt_expire_2', 20, '2026-10-31', 'essai')$$,
  'essai expiré : un trial Stripe (second essai) ne lève pas d''erreur…');
select is(pg_temp.fin('f0000000-0000-0000-0000-000000000014'), date '2026-08-31', '… mais n''ouvre AUCUN second essai en base');
select is(pg_temp.ecarts('f0000000-0000-0000-0000-000000000014'), 'depasse_fenetre_locale:2026-10-31->2026-08-31x1', 'essai expiré : tentative de second essai journalisée');

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Raccourcissement monotone, date incohérente
-- ═══════════════════════════════════════════════════════════════════════════
select is(pg_temp.abo('f0000000-0000-0000-0000-000000000005', 'evt_r1', 10, '2026-10-10')->>'decision', 'applique', 'fin d''essai anticipée chez Stripe : appliquée');
select is(pg_temp.fin('f0000000-0000-0000-0000-000000000005'), date '2026-10-10', 'raccourci : fin d''essai = trial_end Stripe');
select is(pg_temp.abo('f0000000-0000-0000-0000-000000000005', 'evt_r2', 20, '2026-10-31')->>'decision', 'applique', 'raccourci : événement suivant appliqué');
select is(pg_temp.fin('f0000000-0000-0000-0000-000000000005'), date '2026-10-10', 'raccourci : jamais ré-allongé ensuite');

select lives_ok($$select pg_temp.abo('f0000000-0000-0000-0000-000000000006', 'evt_incoherent', 10, '2026-09-01')$$, 'date incohérente (avant début) : pas d''erreur');
select is(pg_temp.fin('f0000000-0000-0000-0000-000000000006'), date '2026-10-31', 'date incohérente : essai local conservé');
select is(pg_temp.ecarts('f0000000-0000-0000-0000-000000000006'), 'avant_debut_essai:2026-09-01->2026-10-31x1', 'date incohérente : écart journalisé');

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Ordre : même résultat quel que soit l'ordre d'arrivée (contrat 506 intact)
-- ═══════════════════════════════════════════════════════════════════════════
select is(pg_temp.abo('f0000000-0000-0000-0000-000000000007', 'evt_a_new', 200, '2026-10-20')->>'decision', 'applique', 'ordre direct : récent appliqué');
select is(pg_temp.abo('f0000000-0000-0000-0000-000000000007', 'evt_a_old', 100, '2026-10-31')->>'decision', 'perime', 'ordre direct : ancien périmé');
select is(pg_temp.abo('f0000000-0000-0000-0000-000000000008', 'evt_b_old', 100, '2026-10-31')->>'decision', 'applique', 'ordre inversé : ancien appliqué d''abord');
select is(pg_temp.abo('f0000000-0000-0000-0000-000000000008', 'evt_b_new', 200, '2026-10-20')->>'decision', 'applique', 'ordre inversé : récent appliqué');
select is(pg_temp.fin('f0000000-0000-0000-0000-000000000007'), pg_temp.fin('f0000000-0000-0000-0000-000000000008'), 'désordre : fins d''essai convergentes');
select is(pg_temp.fin('f0000000-0000-0000-0000-000000000007'), date '2026-10-20', 'désordre : un événement périmé ne ré-allonge pas l''essai');
select is((select count(*)::int from public.stripe_evenements_ordre where stripe_event_id in ('evt_a_new','evt_a_old','evt_b_old','evt_b_new')), 4,
  'désordre : les 4 événements sont journalisés par le contrat d''ordre');

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Fuseau, heure d'été, UTC : la décision ne dépend que de dates
-- ═══════════════════════════════════════════════════════════════════════════
set local timezone = 'Pacific/Kiritimati';
select is(public.essai_fin_bornee_stripe('2026-10-01', '2026-10-31', '2026-11-01'), date '2026-10-31', 'fuseau UTC+14 : même borne');
set local timezone = 'Pacific/Pago_Pago';
select is(public.essai_fin_bornee_stripe('2026-10-01', '2026-10-31', '2026-11-01'), date '2026-10-31', 'fuseau UTC-11 : même borne');
set local timezone = 'Europe/Paris';
-- Passage à l'heure d'hiver le 2026-10-25 dans la fenêtre : aucune journée perdue ni gagnée.
select is(public.essai_fin_bornee_stripe('2026-10-01', '2026-10-31', '2026-10-31'), date '2026-10-31', 'DST octobre (Paris) : fin retenue exacte');
-- Passage à l'heure d'été le 2026-03-29 dans la fenêtre.
select is(pg_temp.abo('f0000000-0000-0000-0000-000000000009', 'evt_dst_1', 10, '2026-04-15')->>'decision', 'applique', 'DST mars : appliqué');
select is(pg_temp.fin('f0000000-0000-0000-0000-000000000009'), date '2026-04-14', 'DST mars : début + 30 exact (J+31 borné)');
set local timezone = 'UTC';
select is((select abonnement_essai_fin - abonnement_essai_debut from public.entreprises where id = 'f0000000-0000-0000-0000-000000000009'), 30,
  'UTC : fenêtre de 30 jours calendaires conservée');

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Client / subscription Stripe existants
-- ═══════════════════════════════════════════════════════════════════════════
select is(pg_temp.abo('f0000000-0000-0000-0000-000000000010', 'evt_cus_1', 10, '2026-10-31')->>'decision', 'applique', 'client Stripe existant sans subscription : première liaison');
select is((select stripe_subscription_id from public.entreprises where id = 'f0000000-0000-0000-0000-000000000010'), 'sub_tri_10', 'client existant : subscription liée');
select throws_ok($$select pg_temp.abo('f0000000-0000-0000-0000-000000000011', 'evt_sub_b', 10, '2026-10-31', 'essai', 'sub_tri_11_bis')$$,
  '42501', 'Subscription Stripe non liée à cette entreprise',
  'subscription existante : une seconde subscription (second Checkout) n''est jamais rattachée');
select is(pg_temp.fin('f0000000-0000-0000-0000-000000000011'), date '2026-10-31', 'subscription existante : essai intact');
select is((select abonnement_statut from public.entreprises where id = 'f0000000-0000-0000-0000-000000000011'), 'actif', 'subscription existante : statut intact');

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Autres webhooks : trial_will_end, invoice.paid, invoice.payment_failed
-- ═══════════════════════════════════════════════════════════════════════════
select lives_ok($$select public.journaliser_evenement_stripe_ordre_service('abonnement', 'evt_twe', 'customer.subscription.trial_will_end',
  pg_temp.t(50), 'subscription', 'sub_tri_13', 'f0000000-0000-0000-0000-000000000013', 'essai_fin_annoncee')$$, 'trial_will_end : journalisé');
select is((select decision || '|' || motif from public.stripe_evenements_ordre where stripe_event_id = 'evt_twe'), 'sans_effet|essai_fin_annoncee', 'trial_will_end : sans effet');
select is(pg_temp.fin('f0000000-0000-0000-0000-000000000013'), date '2026-10-31', 'trial_will_end : essai inchangé');
select is(public.appliquer_evenement_facture_abonnement_service('f0000000-0000-0000-0000-000000000013', 'evt_inv_paid', 'invoice.paid', pg_temp.t(60),
  'in_tri_13a', 'paid', pg_temp.t(59), 'F-13', pg_temp.t(0), pg_temp.t(0) + interval '30 days', 0, 0, 0, 'eur', null, null)->>'decision', 'sans_effet',
  'invoice.paid (facture 0 € d''essai) : trace de facture, sans effet sur l''accès (train V9, P7, migration 20261002001003 ; V8 : appliqué)');
select is(pg_temp.fin('f0000000-0000-0000-0000-000000000013'), date '2026-10-31', 'invoice.paid : essai inchangé');
select is(public.appliquer_evenement_facture_abonnement_service('f0000000-0000-0000-0000-000000000013', 'evt_inv_failed', 'invoice.payment_failed', pg_temp.t(70),
  'in_tri_13b', 'open', pg_temp.t(69), 'F-13b', pg_temp.t(0), pg_temp.t(0) + interval '30 days', 249, 49.8, 298.8, 'eur', null, null)->>'decision', 'applique',
  'invoice.payment_failed : appliqué');
select is((select abonnement_statut from public.entreprises where id = 'f0000000-0000-0000-0000-000000000013'), 'suspendu', 'payment_failed : suspension immédiate conservée');
select is(pg_temp.fin('f0000000-0000-0000-0000-000000000013'), date '2026-10-31', 'payment_failed : essai inchangé');

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Garde base : aucune prolongation par un rôle d'API
-- ═══════════════════════════════════════════════════════════════════════════
set local role service_role;
select throws_ok($$update public.entreprises set abonnement_essai_fin = '2026-10-25' where id = 'f0000000-0000-0000-0000-000000000012'$$,
  '23514', 'La fenêtre d''essai ELSATIA ne peut pas être prolongée', 'service_role : prolonger l''essai est refusé');
select throws_ok($$update public.entreprises set abonnement_essai_debut = '2026-10-05' where id = 'f0000000-0000-0000-0000-000000000012'$$,
  '23514', 'La fenêtre d''essai ELSATIA ne peut pas être prolongée', 'service_role : déplacer le début d''essai est refusé');
select throws_ok($$update public.entreprises set abonnement_essai_fin = null where id = 'f0000000-0000-0000-0000-000000000012'$$,
  '23514', 'La fenêtre d''essai ELSATIA ne peut pas être prolongée', 'service_role : vider la fin d''essai est refusé');
select lives_ok($$update public.entreprises set abonnement_essai_fin = '2026-10-15' where id = 'f0000000-0000-0000-0000-000000000012'$$,
  'service_role : raccourcir l''essai reste possible');
-- La RPC appelée par service_role ne déclenche jamais la garde (elle borne avant d'écrire).
select is(pg_temp.abo('f0000000-0000-0000-0000-000000000012', 'evt_garde', 10, '2026-10-31')->>'decision', 'applique',
  'service_role : RPC avec trial_end > fin actuelle → bornée, pas d''erreur');
reset role;
select is(pg_temp.fin('f0000000-0000-0000-0000-000000000012'), date '2026-10-15', 'garde : fin d''essai jamais ré-allongée');

-- Membre tenant : refusé (triggers de garde).
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.stripe_essai_ecarts), 0, 'RLS : un admin tenant ne lit pas les écarts');
reset role;

-- Administrateur plateforme gerer_facturation (aal2) : lecture des écarts, ajustement dans la fenêtre.
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'plateforme@invalid.local', true);
select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000000001","email":"plateforme@invalid.local","role":"authenticated","aal":"aal2"}', true);
select ok((select count(*)::int from public.stripe_essai_ecarts) >= 4, 'RLS : la plateforme lit les écarts');
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.email', '', true);
select set_config('request.jwt.claims', '', true);

-- La contrainte reste l'ultime borne, même hors API.
select throws_ok($$update public.entreprises set abonnement_essai_fin = '2026-11-01' where id = 'f0000000-0000-0000-0000-000000000012'$$,
  '23514', null, 'contrainte : fin d''essai > début + 30 refusée même pour postgres');

select * from finish();
rollback;
