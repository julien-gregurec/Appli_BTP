-- DR V2 — smokes métier APRÈS restauration (pgTAP, transaction ANNULÉE).
-- Rapport : docs/qualification/ELSATIA_DISASTER_RECOVERY_RESTORE_V2.md §11.
--
-- Complète les contrôles métier V5 (scripts/local-postgres-bootstrap/upgrade_v4_v5_business_checks.sql,
-- rejoués tels quels) par ce qu'une restauration peut casser sans que le schéma change :
-- isolation multi-tenant effective, idempotence Stripe (le journal de dédup et le filigrane
-- d'ordre sont restaurés, donc un rejeu ne ré-applique rien), droits Tools, écriture métier
-- (stock, planning, Relevé) sous RLS, RGPD (rapport de purge), Réserves hôte suspendu.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(16);

create function pg_temp.en_session(p uuid) returns text language sql as $$
  select set_config('role', 'authenticated', true)
      || set_config('request.jwt.claim.sub', p::text, true)
      || set_config('request.jwt.claim.role', 'authenticated', true)
      || set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.en_service() returns text language sql as $$
  select set_config('role', 'postgres', true)
      || set_config('request.jwt.claim.sub', '', true)
      || set_config('request.jwt.claim.role', '', true)
      || set_config('request.jwt.claims', '', true)
$$;
create temporary table _stock as select id, quantite_stock from public.articles_stock
  where entreprise_id = 'a0000000-0000-0000-0000-000000000001' order by id limit 1;
grant select on _stock to authenticated;

-- ── Isolation multi-tenant (RLS réelle) ───────────────────────────────────────────────
select pg_temp.en_session('10000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.clients where entreprise_id = 'b0000000-0000-0000-0000-000000000001'), 0,
  'I01 un membre de A ne voit aucun client de B');
select ok((select count(*) from public.clients where entreprise_id = 'a0000000-0000-0000-0000-000000000001') > 0,
  'I02 un membre de A voit ses clients');
select is((select count(*)::int from public.factures where entreprise_id <> 'a0000000-0000-0000-0000-000000000001'), 0,
  'I03 un membre de A ne voit aucune facture d''un autre tenant');
select pg_temp.en_session('20000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001'), 0,
  'I04 un membre de B ne voit aucun chantier de A');
select pg_temp.en_service();
set local role anon;
select throws_ok('select count(*) from public.clients', '42501', null, 'I05 anon : aucun accès aux clients (GRANT restauré)');
reset role;

-- ── Écritures métier sous RLS ─────────────────────────────────────────────────────────
select pg_temp.en_session('10000000-0000-0000-0000-000000000001');
select lives_ok($$ insert into public.mouvements_stock (entreprise_id, article_id, type, quantite, motif)
                   select 'a0000000-0000-0000-0000-000000000001', id, 'entree', 5, 'smoke DR' from _stock $$,
  'W01 mouvement de stock accepté (RLS + permission gerer_stock)');
select pg_temp.en_service();
select is((select a.quantite_stock - s.quantite_stock from public.articles_stock a join _stock s using (id)), 5::numeric,
  'W02 trigger de stock appliqué (quantité +5)');
select pg_temp.en_session('10000000-0000-0000-0000-000000000001');
select lives_ok($$ insert into public.planning_evenements (entreprise_id, titre, debut, fin)
                   values ('a0000000-0000-0000-0000-000000000001', 'smoke DR', now() + interval '1 day', now() + interval '1 day 2 hours') $$,
  'W03 planning : création acceptée');
select pg_temp.en_session('10000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.tools_releves_plans where releve_id = 'd2200000-0000-4000-8000-000000000001'), 1,
  'W04 Relevé : le métreur lit son plan 2D restauré');
select pg_temp.en_service();

-- ── Stripe : journal de dédup et filigrane d'ordre restaurés ──────────────────────────
select is(public.reserver_evenement_abonnement_service('evt_upg4_0001', 'a7400000-0000-4000-8000-000000000050', 'checkout.session.completed'),
  'duplicate', 'S01 webhook déjà reçu avant la sauvegarde : rejeu = doublon');
select is(public.appliquer_evenement_facture_abonnement_v2_service(
    'a7400000-0000-4000-8000-000000000050', 'evt_drv2_paid_0001', 'invoice.paid', now() - interval '2 days',
    'in_drv2_0001', 'paid', now() - interval '2 days', 'ELS-DRV2-0001', now() - interval '2 days', now() + interval '28 days',
    249, 49.8, 298.8, 'eur', null, null, 'sub_upg4_50')->>'decision',
  'deja_traite', 'S02 facture payée déjà appliquée : rejeu sans effet');
select is(public.appliquer_evenement_facture_abonnement_v2_service(
    'a7400000-0000-4000-8000-000000000050', 'evt_drv2_old_failed', 'invoice.payment_failed', now() - interval '3 days',
    'in_drv2_old', 'open', now() - interval '3 days', 'ELS-DRV2-OLD', now() - interval '33 days', now() - interval '3 days',
    249, 49.8, 298.8, 'eur', null, null, 'sub_upg4_50')->>'decision',
  'perime', 'S03 échec de paiement ANTÉRIEUR au filigrane restauré : périmé, aucune suspension');
select is((select abonnement_statut from public.entreprises where id = 'a7400000-0000-4000-8000-000000000050'), 'actif',
  'S04 accès inchangé');
select ok((select revoked_at is null from public.entitlements_utilisateurs_elsatia
            where source = 'web' and metadata->>'reference_externe' = 'sub_upgrade_v3'),
  'S05 Tools Pro : droit actif restauré (conforme à l''état Stripe sauvegardé)');

-- ── RGPD / Réserves ────────────────────────────────────────────────────────────────────
select ok((select count(*) from public.rapport_purge_entreprise('e0000000-0000-4000-8000-00000000000a')) > 0,
  'G01 rapport de purge RGPD calculable pour le tenant programmé');
select pg_temp.en_session('c9000000-0000-0000-0000-0000000000a1');
select is(public.reserves_chantier_lecture_seule_hote('e9000000-0000-0000-0000-000000000001'), true,
  'G02 Réserves : pour l''intervenant externe, le chantier de l''hôte suspendu reste en lecture seule');
select pg_temp.en_service();

select * from finish();
rollback;
