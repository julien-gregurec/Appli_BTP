-- Train canonique V5 — contrôles MÉTIER sur la base upgradée V4 → V5 (scripts/qualification/upgrade-v4-v5.sh §7).
-- Rapport : docs/qualification/ELSATIA_CANONICAL_TRAIN_V5_CONVERGENCE_V1.md §10.
--
-- Rejoue, sur les données V4 réelles du jeu d'upgrade (upgrade_v4_v5_seed_complement.sql), les
-- trois comportements introduits par V5. Transaction ANNULÉE : la base upgradée n'est pas modifiée.
--   R  Relevé & Métré plan 2D (…0928 101) sur un relevé Lots 2-4 existant ;
--   D  Réserves D-01 (…0928 301) : hôte suspendu AVANT l'upgrade, intervenant externe S,
--      même session JWT avant/après, rejeu hors-ligne d'une mutation d'avant la suspension ;
--   S  Stripe réabonnement (…0928 201) sur l'entreprise annulée du jeu V3 → V4.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(35);

create function pg_temp.en_session(p uuid, s uuid) returns text language sql as $$
  select set_config('role', 'authenticated', true)
      || set_config('request.jwt.claim.sub', p::text, true)
      || set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'session_id', s)::text, true)
$$;
create function pg_temp.en_service() returns text language sql as $$
  select set_config('role', 'postgres', true)
      || set_config('request.jwt.claim.sub', '', true)
      || set_config('request.jwt.claims', '', true)
$$;
-- Session UNIQUE de l'intervenant S, la même avant et après la suspension.
create function pg_temp.session_s() returns text language sql as $$
  select pg_temp.en_session('c9000000-0000-0000-0000-0000000000a1', '5f000000-0000-4000-8000-00000000005a')
$$;
create function pg_temp.reserve(p_titre text) returns uuid language sql as $$
  select id from public.reserves where titre = p_titre
$$;
-- Échanges d'une réserve (les messages sont portés par les conversations de la réserve).
create function pg_temp.nb_messages(p_reserve uuid) returns bigint language sql as $$
  select count(*) from public.reserves_messages m join public.reserves_conversations c on c.id = m.conversation_id
   where c.reserve_id = p_reserve
$$;
grant execute on function pg_temp.nb_messages(uuid) to authenticated;
grant execute on function pg_temp.reserve(text) to authenticated;
-- Tables temporaires créées sous le rôle applicatif (droit rendu à l'annulation de la transaction).
do $$ begin execute format('grant temporary on database %I to authenticated', current_database()); end $$;
-- État de référence de la réserve R1, lu hors RLS avant toute tentative.
create temporary table _r1 as
  select r.statut, pg_temp.nb_messages(r.id) as nb_messages,
         (select count(*) from public.reserves_historique h where h.reserve_id = r.id) as nb_historique
    from public.reserves r where r.titre = 'UPG5 R1 — Tuiles cassées';
grant select on _r1 to authenticated;

-- ── R. Relevé & Métré : plan 2D sur un relevé V4 ────────────────────────────────────────
select is((select count(*)::int from public.tools_releves_elements where releve_id = 'f5000000-0000-4000-8000-000000000001' and plan_id is null), 3,
  'R01 éléments V4 conservés, sans plan (colonne plan_id ajoutée, nulle)');
select pg_temp.en_session('10000000-0000-0000-0000-000000000003', gen_random_uuid());
select is((select count(*)::int from public.tools_releves_medias where releve_id = 'f5000000-0000-4000-8000-000000000001'), 3,
  'R02 photos V4 lisibles par le métreur (RLS inchangée)');
create temporary table _plan as select * from public.tools_releve_plan_creer('f5300000-0000-4000-8000-000000000001', 'initial');
select pg_temp.en_service();
select is((select count(*)::int from public.tools_releves_elements where plan_id = (select id from _plan) and type = 'mur'), 2,
  'R03 plan initial : les 2 murs relevés en V4 sont adoptés');
select is((select plan_id from public.tools_releves_elements where id = 'f5600000-0000-4000-8000-000000000003'), null,
  'R04 équipement non adopté (seuls murs et ouvertures appartiennent au plan)');
select is((select details->>'adoptes' from public.tools_releves_journal where entite = 'plan' and entite_id = (select id from _plan)), '2',
  'R05 journal : entité « plan » acceptée (contrainte étendue), adoption tracée');
select pg_temp.en_session('10000000-0000-0000-0000-000000000003', gen_random_uuid());
select lives_ok($$ select public.tools_releve_creer_version('f5000000-0000-4000-8000-000000000001', 'Après upgrade', 'corrige') $$,
  'R06 nouvelle version d''un relevé V4 (fonction redéfinie par le Lot 5)');
select pg_temp.en_service();
select is((select jsonb_array_length(contenu->'plans') from public.tools_releves_versions
            where releve_id = 'f5000000-0000-4000-8000-000000000001' order by numero desc limit 1), 1,
  'R07 la version inclut le plan 2D');
select is((select contenu ? 'plans' from public.tools_releves_versions
            where releve_id = 'f5000000-0000-4000-8000-000000000001' and libelle = 'Relevé initial'), false,
  'R08 la version V4 figée n''est pas réécrite');
select is((select count(*)::int from storage.objects where bucket_id = 'tools-releves'
            and name like 'a0000000-0000-0000-0000-000000000001/f5000000-0000-4000-8000-000000000001/%'), 6,
  'R09 objets Storage V4 (photos + miniatures) intacts');

-- ── D. Réserves D-01 : hôte suspendu → intervenant externe en lecture seule ─────────────
select is((select abonnement_statut from public.entreprises where id = 'a9000000-0000-0000-0000-000000000001'), 'suspendu',
  'D01 l''hôte H était déjà suspendu avant l''upgrade');
select pg_temp.session_s();
select is((select count(*)::int from public.reserves where chantier_id = 'e9000000-0000-0000-0000-000000000001'), 2,
  'D02 S lit toujours les 2 réserves de H (même session)');
select ok(pg_temp.nb_messages(pg_temp.reserve('UPG5 R1 — Tuiles cassées')) = (select nb_messages from _r1)
          and (select nb_messages from _r1) >= 2,
  'D03 S lit toujours les échanges écrits en V4 (dont ses 2 commentaires)');
select is(public.reserves_lecture_seule_hote(pg_temp.reserve('UPG5 R1 — Tuiles cassées')), true, 'D04 réserve signalée en lecture seule');
select is(public.reserves_chantier_lecture_seule_hote('e9000000-0000-0000-0000-000000000001'), true, 'D05 chantier signalé en lecture seule');
select throws_ok($$ select public.reserves_commenter(pg_temp.reserve('UPG5 R1 — Tuiles cassées'), 'nouveau', null, 'f5b00000-0000-4000-8000-000000000003') $$,
  '42501', 'Organisation hôte suspendue : cette réserve est en lecture seule.', 'D06 commentaire refusé en base (42501)');
select throws_ok($$ select public.reserves_commenter(pg_temp.reserve('UPG5 R1 — Tuiles cassées'), 'UPG5 : intervention prévue jeudi', null, 'f5b00000-0000-4000-8000-000000000001') $$,
  '42501', 'Organisation hôte suspendue : cette réserve est en lecture seule.', 'D07 rejeu hors-ligne d''une mutation d''AVANT la suspension : refusé');
select throws_ok($$ select public.reserves_repondre_responsabilite(pg_temp.reserve('UPG5 R1 — Tuiles cassées'), true) $$,
  '42501', 'Organisation hôte suspendue : cette réserve est en lecture seule.', 'D08 acceptation refusée');
select throws_ok($$ select public.reserves_demander_levee(pg_temp.reserve('UPG5 R2 — Gouttière désaxée')) $$,
  '42501', null, 'D09 demande de levée refusée');
select pg_temp.en_service();
select ok(pg_temp.nb_messages(pg_temp.reserve('UPG5 R1 — Tuiles cassées')) = (select nb_messages from _r1)
          and (select count(*) from public.reserves_historique where reserve_id = pg_temp.reserve('UPG5 R1 — Tuiles cassées')) = (select nb_historique from _r1),
  'D10 aucune écriture fantôme (historique, messages inchangés)');
select is((select statut from public.reserves where titre = 'UPG5 R1 — Tuiles cassées'), (select statut from _r1),
  'D11 statut de R1 inchangé');
-- Rétablissement de l'hôte : l'écriture revient, sans reconnexion ni nouvelle invitation.
update public.entreprises set abonnement_statut = 'actif' where id = 'a9000000-0000-0000-0000-000000000001';
select pg_temp.session_s();
select is(public.reserves_commenter(pg_temp.reserve('UPG5 R1 — Tuiles cassées'), 'UPG5 : intervention prévue jeudi', null, 'f5b00000-0000-4000-8000-000000000001'),
          (select conversation_id from public.reserves_messages where origine_client_id = 'f5b00000-0000-4000-8000-000000000001'),
  'D12 hôte rétabli : rejeu de la mutation V4 idempotent (même conversation, contrat V5 hors-ligne)');
select is((select count(*)::int from public.reserves_messages where origine_client_id = 'f5b00000-0000-4000-8000-000000000001'), 1,
  'D12b le message rejoué n''est pas dupliqué');
select lives_ok($$ select public.reserves_commenter(pg_temp.reserve('UPG5 R1 — Tuiles cassées'), 'après rétablissement', null, 'f5b00000-0000-4000-8000-000000000004') $$,
  'D13 hôte rétabli : S commente dans la même session');
select pg_temp.en_service();
select is((select count(*)::int from public.reserves_intervenants where id = 'e9200000-0000-0000-0000-00000000005a' and statut = 'active'), 1,
  'D14 intervenant ni recréé ni modifié');

-- ── S. Stripe : réabonnement de l'entreprise annulée du jeu V3 → V4 ────────────────────
create temporary table _avant_factures as
  select stripe_invoice_id, statut, montant_ttc, payee_at from public.factures_abonnement where entreprise_id = 'a7400000-0000-4000-8000-000000000070';
create temporary table _avant_essai as
  select abonnement_essai_debut, abonnement_essai_fin from public.entreprises where id = 'a7400000-0000-4000-8000-000000000070';
select throws_ok($$ select public.relier_subscription_reabonnement_service('a7400000-0000-4000-8000-000000000050', 'sub_upg5_double', 'cus_upg4_50', 'active', 'sub_upg4_50', 'active') $$,
  '42501', null, 'S01 anti-double abonnement : subscription courante encore active → refus');
select throws_ok($$ select public.relier_subscription_reabonnement_service('a7400000-0000-4000-8000-000000000070', 'sub_upg5_new', 'cus_autre', 'active', 'sub_upg4_70', 'canceled') $$,
  '42501', null, 'S02 autre client Stripe → refus (même customer exigé)');
select is(public.relier_subscription_reabonnement_service('a7400000-0000-4000-8000-000000000070', 'sub_upg5_new', 'cus_upg4_70', 'active', 'sub_upg4_70', 'canceled'),
  'relie', 'S03 réabonnement rattaché (ancienne terminée, même client)');
select is((select stripe_customer_id || '|' || stripe_subscription_id from public.entreprises where id = 'a7400000-0000-4000-8000-000000000070'),
  'cus_upg4_70|sub_upg5_new', 'S04 même client, nouvelle subscription');
select is((select count(*)::int from public.stripe_subscriptions_remplacees where stripe_subscription_id = 'sub_upg4_70'), 1,
  'S05 ancienne subscription historisée');
select is((select abonnement_statut from public.entreprises where id = 'a7400000-0000-4000-8000-000000000070'), 'annule',
  'S06 rattacher n''écrit aucun droit (entitlements conditionnels à l''état Stripe)');
select ok((select e.abonnement_essai_fin <= current_date and e.abonnement_essai_fin <= a.abonnement_essai_fin
             from public.entreprises e, _avant_essai a where e.id = 'a7400000-0000-4000-8000-000000000070'),
  'S07 aucun nouvel essai (fenêtre close, jamais prolongée)');
select is(public.appliquer_evenement_facture_abonnement_v2_service(
    'a7400000-0000-4000-8000-000000000070', 'evt_upg5_late', 'invoice.payment_failed', now(), 'in_upg5_late', 'open', now(),
    'ELS-UPG5-LATE', now() - interval '30 days', now(), 249, 49.8, 298.8, 'eur', null, null, 'sub_upg4_70')->>'decision',
  'sans_effet', 'S08 facture tardive de l''ancienne subscription : sans effet');
select is(public.appliquer_evenement_facture_abonnement_v2_service(
    'a7400000-0000-4000-8000-000000000070', 'evt_upg5_parasite', 'invoice.paid', now(), 'in_upg5_parasite', 'paid', now(),
    'ELS-UPG5-P', now() - interval '30 days', now(), 249, 49.8, 298.8, 'eur', null, null, 'sub_inconnue')->>'decision',
  'differe', 'S09 facture d''une subscription inconnue : différée, rien n''est écrit');
select is((select abonnement_statut from public.entreprises where id = 'a7400000-0000-4000-8000-000000000070'), 'annule',
  'S10 accès inchangé par les factures isolées');
select set_eq($$ select stripe_invoice_id, statut, montant_ttc, payee_at from public.factures_abonnement
                  where entreprise_id = 'a7400000-0000-4000-8000-000000000070' and stripe_invoice_id like 'in_upg5_old_%' $$,
              $$ select * from _avant_factures $$, 'S11 anciennes factures V4 inchangées');

select * from finish();
rollback;
